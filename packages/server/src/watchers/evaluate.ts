import type { HaState } from '../ha.js';
import { measuresLevel } from '../home.js';
import { stateText } from '../state-text.js';
import type { Watcher } from '../watcher-data.js';
import { plainName, templateCardTitles, templateNames } from '../watcher-names.js';
import { conditionMet, type DoneTrigger } from '../watcher-types.js';
import type { Ctx } from './context.js';
import type { Parts } from './parts.js';
import { minutes } from './schedule.js';
import { metSinceOf } from './seen.js';
import type { MetNow, Seen } from './types.js';

/** Merker in den Einstellungen: die alten Gerätenamen sind aus den Namen genommen (siehe cleanAutoNames) */
const NAMES_CLEANED = 'watcherNamesCleaned';

/** Die Bedingung prüfen: bei neuem Zustand, beim Speichern und beim Abgleich nach dem (Wieder-)Verbinden */
export function createEvaluate(ctx: Ctx, calls: () => Parts) {
  const { deps, store, data, ha, now, log, mem, guarded, seenOf, absorb, remember } = ctx;
  /** Ein Abgleich läuft oder ist eingereiht; frühestens nach 10 s ein neuer Versuch aus Ansicht oder Takt */
  let snapshotPending = false;
  let lastSnapshotTry = 0;

  /** Bedingungen, die Stups am Zustand der Entität prüft (Kalender und Vorhersage fragt der Takt ab) */
  const checksState = (w: Watcher): boolean => w.trigger.kind === 'state' || w.trigger.kind === 'above' || w.trigger.kind === 'below';

  /** Neuer Zustand der beobachteten Entität (live, nach dem Verbinden oder beim Anlegen) */
  async function evaluate(w: Watcher, s: Seen | null): Promise<void> {
    if (!w.active) return;
    if (!s) {
      if (w.status === 'ok') data.setStatus(w.id, 'entity_missing');
      return;
    }
    if (w.status === 'entity_missing') data.setStatus(w.id, 'ok');
    // Termine und Vorhersage werden im Takt abgefragt (pollExternal), nicht über Zustandswechsel
    if (w.trigger.kind === 'calendar_event' || w.trigger.kind === 'forecast') return;
    const nowMs = now().getTime();
    const st = data.getState(w.id);
    remember(w, s, st.lastFireAt);

    if (!conditionMet(w.trigger, s.state)) {
      if (!st.armed || st.metSince) data.patchState(w.id, { armed: true, metSince: null });
      return;
    }
    const metSince = st.metSince ?? metSinceOf(w.trigger.kind, s, nowMs);
    if (!st.metSince) data.patchState(w.id, { metSince });
    if (!st.armed) return;
    if (nowMs - Date.parse(metSince) < minutes(w.trigger.forMin)) return; // wartet noch, der Takt prüft später
    await calls().fire(w);
  }

  /** „Erledigt sich selbst, wenn …": nur bei einem Wechsel im laufenden Betrieb */
  async function checkDone(w: Watcher, d: DoneTrigger, s: Seen): Promise<void> {
    if (!w.active || !conditionMet(d, s.state)) return;
    const open = store.openCardOfWatcher(w.id);
    if (!open) return;
    store.completeCard(open.id, { by: null, source: 'app' });
    data.removeWaiting(open.id);
    data.addRun({ watcherId: w.id, result: 'auto_done', cardId: open.id, note: 'erledigt, weil die Bedingung eingetreten ist' });
    deps.onChange?.();
  }

  /**
   * Nach dem Anlegen oder Ändern: Startzustand prüfen und abonnieren. Beim **Anlegen** (`created`) löst ein Wächter, dessen Bedingung schon
   * erfüllt ist, gleich aus (nach der Wartezeit, gerechnet ab der letzten Änderung des Werts): wer einen Wächter für „Batterie unter 20 %“
   * anlegt, während sie bei 16 % steht, bekommt die Aufgabe. Beim **Ändern** und Wiedereinschalten löst nur ein Pegel selbst aus; bei einem
   * Zustand oder Vorgang bleibt es bei der Rückfrage. Antwort: `MetNow`, wenn die Bedingung schon erfüllt ist, nichts von selbst ausgelöst hat
   * und keine Aufgabe des Wächters offen ist, sonst null.
   */
  async function onSaved(id: string, opts: { created?: boolean } = {}): Promise<MetNow | null> {
    let metNow: MetNow | null = null;
    await guarded('Speichern', async () => {
      const w = data.get(id);
      let states: HaState[];
      try {
        states = await ha.getStates();
      } catch {
        // Home Assistant nicht erreichbar: vorsichtig sein, erst nach einer Zeit ohne erfüllte Bedingung wieder scharf
        data.patchState(id, { armed: false, metSince: null });
        calls().syncSubscriptions();
        return;
      }
      absorb(states);
      mem.statesLoaded = true;
      cleanAutoNames();
      const s = seenOf(w.trigger.entityId);
      if (!s) {
        data.setStatus(id, 'entity_missing');
        data.patchState(id, { armed: true, metSince: null });
      } else {
        remember(w, s, data.getState(id).lastFireAt); // der Stand beim Anlegen: lief schon etwas, ist der Beginn unbekannt
        const met = conditionMet(w.trigger, s.state);
        const nowMs = now().getTime();
        // Ein Pegel (Batterie, Temperatur), der beim ersten Anlegen schon über der Grenze liegt, ist ein Befund: die Aufgabe kommt sofort
        // (nach der Wartezeit, gerechnet ab der letzten Änderung des Werts). Vorgänge und Unbekanntes warten auf den nächsten Wechsel.
        const neverFired = !data.getState(id).lastFireAt;
        const levelNow = met && (w.trigger.kind === 'below' || w.trigger.kind === 'above') && measuresLevel(s, w.trigger.entityId) && neverFired;
        // Beim Anlegen gilt dasselbe für jede Bedingung auf dem Zustand (Zustand, Vorgang, Pegel): erfüllt heißt auslösen
        const auto = levelNow || (opts.created === true && met && w.active && checksState(w) && neverFired);
        const since = met ? metSinceOf(auto ? 'state' : w.trigger.kind, s, nowMs) : null;
        data.patchState(id, { armed: auto || !met, metSince: since });
        if (w.status === 'entity_missing') data.setStatus(id, 'ok');
        if (auto && since && nowMs - Date.parse(since) >= minutes(w.trigger.forMin)) await calls().fire(w);
        // Schon erfüllt und kein automatisches Auslösen: die Oberfläche darf fragen (nur wenn noch keine Aufgabe des Wächters offen ist)
        if (met && !auto && w.active && checksState(w) && !store.openCardOfWatcher(id)) {
          metNow = { entityName: s.name ?? w.trigger.entityId, stateText: stateText(s.state, s.unit), reason: 'already_met' };
        }
      }
      calls().syncSubscriptions();
      deps.onChange?.();
    });
    return metNow;
  }

  /** Nach (Wieder-)Verbinden: Zustände abgleichen, damit ein verpasster Übergang genau einmal auslöst */
  async function snapshot(): Promise<void> {
    snapshotPending = true;
    lastSnapshotTry = now().getTime();
    await guarded('Abgleich', async () => {
      const bySeen = absorb(await ha.getStates());
      for (const w of data.list()) {
        if (!w.active) continue;
        await evaluate(w, bySeen.get(w.trigger.entityId) ?? null);
      }
      mem.statesLoaded = true;
      cleanAutoNames();
      calls().syncSubscriptions();
    }).finally(() => {
      snapshotPending = false;
    });
  }

  /**
   * Nach einem Neustart ist der Abgleich beim Verbinden manchmal gescheitert (Home Assistant war noch beschäftigt): dann
   * kennt Stups keine Zustände und alles stünde als „Entität fehlt", bis jemand einen Wächter öffnet. Darum holt jeder Blick in
   * die Übersicht und der Takt den Abgleich nach, höchstens alle 10 Sekunden.
   */
  function ensureStates(): void {
    if (mem.statesLoaded || snapshotPending) return;
    if (deps.enabled && !deps.enabled()) return;
    if (now().getTime() - lastSnapshotTry < 10_000) return;
    void snapshot();
  }

  /**
   * Einmalig: Namen und Aufgabentitel der Vorlagen, an die frühere Versionen das Gerät gehängt haben („Trockner fertig: Nachfrage mw50gdjw"),
   * verlieren es wieder. Angefasst wird nur ein Text, der genau so aussieht, wie die alte Regel ihn aus dem Namen einer Vorlage und dem Gerät der Entität
   * baute; eigene Namen bleiben, ebenso alles, was nicht sicher passt. Läuft, sobald die Zustände aus Home Assistant da sind (dann ist
   * auch der Friendly Name bekannt), und merkt sich, dass es gelaufen ist.
   */
  function cleanAutoNames(): void {
    if (!mem.statesLoaded || store.rawSetting(NAMES_CLEANED) === '1') return;
    const bases = templateNames();
    const titles = templateCardTitles();
    let changed = 0;
    for (const w of data.list()) {
      const friendly = seenOf(w.trigger.entityId)?.name;
      // auch der Aufgabentitel der Vorlage: sonst hinge zur Laufzeit der Name der Entität ein zweites Mal an
      const name = plainName(w.name, w.trigger.entityId, friendly, bases);
      const title = plainName(w.card.title, w.trigger.entityId, friendly, titles, 200);
      if (name === null && title === null) continue;
      data.setNames(w.id, { name, cardTitle: title });
      changed += 1;
    }
    store.putRawSetting(NAMES_CLEANED, '1');
    if (changed > 0) {
      log.info(`Wächter: bei ${changed} Wächtern das Gerät aus dem Namen genommen`);
      deps.onChange?.();
    }
  }

  return { checksState, evaluate, checkDone, onSaved, snapshot, ensureStates };
}
