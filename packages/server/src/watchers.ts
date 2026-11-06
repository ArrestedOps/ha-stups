import { watcherIcon } from './watcher-icons.js';
import { cardTitleOf, plainName, subjectOf, templateCardTitles, templateNames } from './watcher-names.js';
import { ConflictError, ForbiddenError } from './errors.js';
import type { HaState } from './ha.js';
import { t } from './i18n/index.js';
import { isBusy } from './busy.js';
import { isRunning, measuresLevel, phaseOf, type HomeItem, type HomePhase, type HomeState, type PhaseMemory } from './home.js';
import { categoryOfWatcher } from './watcher-categories.js';
import { orderView, type OrderView } from './assignment-order.js';
import { personOfEntity, presenceOf, type PresenceMap } from './presence.js';
import { stateText } from './state-text.js';
import { fromLocal, toLocal } from './recurrence.js';
import type { Card, Store, User } from './store.js';
import type { Waiting, Watcher, WatcherData } from './watcher-data.js';
import {
  conditionMet,
  SUGGEST_WAIT_MIN,
  WAITING_MARKER,
  type AssignRule,
  type CardTemplate,
  type DoneTrigger,
  type TriggerKind,
  type WatchTrigger,
} from './watcher-types.js';

/** Was die Auswertung von Home Assistant braucht (HaClient bringt es mit, die Tests setzen eine Attrappe ein) */
export interface WatcherHa {
  subscribe(key: string, payload: Record<string, unknown>, onEvent: (event: Record<string, any>) => void, onResult?: (ok: boolean, error?: string) => void): () => void;
  unsubscribe(key: string): void;
  getStates(): Promise<HaState[]>;
  onConnected(cb: () => void): void;
  activeSubscriptions?(): string[];
  /** Termine eines Kalenders (start/end als ISO-Text oder nur Datum) */
  getCalendarEvents?(entityId: string, fromIso: string, toIso: string): Promise<{ title: string; start: string; end: string; uid?: string; recurrenceId?: string }[]>;
  /** Stündliche Vorhersage einer Wetter-Entität */
  getForecast?(entityId: string): Promise<{ datetime: string; condition?: string; precipitation?: number; precipitation_probability?: number }[]>;
  /** Steht die Verbindung, und seit wann fehlt sie? (ohne Angabe gilt sie als stehend) */
  connection?(): { connected: boolean; lostSince: string | null };
}

export interface WatcherDeps {
  store: Store;
  data: WatcherData;
  ha: WatcherHa;
  now: () => Date;
  timeZone: () => string;
  /** false = ausgeschaltet (Beta): keine Auswertung, keine Karten. Vorgabe: an */
  enabled?: () => boolean;
  /** Zeitlimit für eine Abfrage von Kalender oder Vorhersage in Millisekunden (Vorgabe 20 Sekunden) */
  pollTimeoutMs?: number;
  /** Karte ist (jetzt) jemandem zugewiesen: hier geht die Push-Nachricht raus */
  onAssigned?: (card: Card, userIds: string[]) => void;
  /** Die Karte ist nach der eingestellten Zeit noch offen: an die Zuständigen erinnern */
  onNudge?: (card: Card, userIds: string[]) => void;
  /** "Erst vorschlagen": die Karte ist noch niemandem zugewiesen, diese Personen (zu Hause) werden gefragt, wer sie übernimmt */
  onSuggest?: (card: Card, userIds: string[]) => void;
  /** Der Vorschlag ist vorbei (übernommen oder Rückfall): die Frage bei den anderen wegräumen */
  onSuggestClosed?: (card: Card) => void;
  /** Etwas hat sich geändert (Live-Sync) */
  onChange?: () => void;
  log?: { info(m: string): void; warn(m: string): void };
}

/** Wer nach der ersten Heimkehr noch dazukommen darf */
const JOIN_WINDOW_MS = 2 * 60_000;
/** Kalender und Vorhersage werden höchstens so oft abgefragt */
const POLL_MS = 30 * 60_000;
/** Nach einem Fehlversuch geht es nach so langer Zeit weiter */
const POLL_RETRY_MS = 5 * 60_000;
/** So lange wartet eine Karte auf die erste heimkehrende Person */
const WAIT_LIMIT_MS = 24 * 3_600_000;
const TEST_NOTE = 'Test';
/** Merker in den Einstellungen: die alten Gerätenamen sind aus den Namen genommen (siehe cleanAutoNames) */
const NAMES_CLEANED = 'watcherNamesCleaned';

interface Seen {
  state: string;
  lastChanged: string | null;
  name?: string;
  unit?: string;
  /** Für das Symbol der Karte (watcher-icons.ts) */
  deviceClass?: string;
  icon?: string;
}

const minutes = (n: number) => n * 60_000;

/**
 * Die Bedingung gilt beim Speichern schon, aber der Wächter löst nicht von selbst aus (Zustand, Vorgang, Unbekanntes): die Oberfläche
 * fragt dann, ob die Karte jetzt entstehen soll. `stateText` ist der Zustand in Worten („aus", „412 W").
 */
export interface MetNow {
  entityName: string;
  stateText: string;
  reason: 'already_met';
}

export function createWatchers(deps: WatcherDeps) {
  const { store, data, ha, now, timeZone } = deps;
  const log = deps.log ?? { info: () => undefined, warn: () => undefined };

  /** Personen, aus denen dieser Wächter wählen darf: die, die das Board seiner Karten sehen (auf einem privaten Board nur der Besitzer) */
  function peopleOf(w: Pick<Watcher, 'card'>): User[] {
    const seeing = new Set(store.boardPeopleIds(w.card.boardId));
    return store.people().filter((p) => seeing.has(p.id));
  }

  /** Zuletzt gesehene Zustände beobachteter Entitäten */
  const seen = new Map<string, Seen>();
  /** Abos, die gerade angelegt sind (Schlüssel → Beschreibung des Auslösers, um Änderungen zu erkennen) */
  const subscribed = new Map<string, string>();
  let persons: HaState[] = [];
  let personsAt = 0;
  /** Die Zustände aus Home Assistant sind einmal geladen (Abgleich oder Speichern): erst dann gilt eine fehlende Entität als fehlend */
  let statesLoaded = false;
  /** Ein Abgleich läuft oder ist eingereiht; frühestens nach 10 s ein neuer Versuch aus Ansicht oder Takt */
  let snapshotPending = false;
  let lastSnapshotTry = 0;
  /** Was für „Zuhause" gemerkt wird (Beginn eines laufenden Vorgangs) */
  const memory = new Map<string, PhaseMemory>();
  /** Nächste Termine von Kalender-Wächtern (Stufe 6), je Wächter */
  const nextEvents = new Map<string, { title: string; at: string }>();
  /** Wann Kalender und Vorhersage je Wächter zuletzt abgefragt wurden */
  const lastPoll = new Map<string, number>();

  // ---------- Warteschlange: eine Auswertung nach der anderen ----------

  let chain: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  }
  /** Wartet, bis alles Eingereihte abgearbeitet ist (für Tests und sauberes Beenden) */
  const idle = (): Promise<void> => chain.then(() => undefined);

  function guarded(what: string, fn: () => Promise<void> | void): Promise<void> {
    return enqueue(async () => {
      // Ausgeschaltet (Beta): alle Auswertungen, der Takt und die Heimkehr fallen weg; der Abgleich beim Einschalten holt den Stand nach
      if (deps.enabled && !deps.enabled()) return;
      try {
        await fn();
      } catch (err) {
        log.warn(`Wächter: ${what}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  // ---------- Hilfen ----------

  const seenOf = (entityId: string): Seen | null => seen.get(entityId) ?? null;

  function toSeen(s: { state?: unknown; last_changed?: unknown; attributes?: Record<string, any> } | null | undefined): Seen | null {
    if (!s || typeof s.state !== 'string') return null;
    const name = s.attributes?.friendly_name;
    const unit = s.attributes?.unit_of_measurement;
    const deviceClass = s.attributes?.device_class;
    const icon = s.attributes?.icon;
    return {
      state: s.state,
      lastChanged: typeof s.last_changed === 'string' ? s.last_changed : null,
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof unit === 'string' ? { unit } : {}),
      ...(typeof deviceClass === 'string' ? { deviceClass } : {}),
      ...(typeof icon === 'string' ? { icon } : {}),
    };
  }

  /** Seit wann gilt die Bedingung? Beim Zustandswechsel genau seit dem Wechsel, sonst ab jetzt */
  function metSinceOf(kind: TriggerKind, s: Seen, nowMs: number): string {
    const changed = s.lastChanged ? Date.parse(s.lastChanged) : NaN;
    return new Date(kind === 'state' && Number.isFinite(changed) ? Math.min(changed, nowMs) : nowMs).toISOString();
  }

  async function personStates(maxAgeMs = 15_000): Promise<HaState[]> {
    if (now().getTime() - personsAt < maxAgeMs && persons.length > 0) return persons;
    const states = await ha.getStates();
    for (const s of states) {
      const v = toSeen(s);
      if (v) seen.set(s.entity_id, v);
    }
    persons = states.filter((s) => s.entity_id.startsWith('person.'));
    personsAt = now().getTime();
    return persons;
  }

  /** Wer ist zu Hause? Zuordnung über den Benutzer der HA-Person, sonst über den Namen */
  async function presence(): Promise<PresenceMap> {
    return presenceOf(store.people(), await personStates());
  }

  // ---------- Zuhause: läuft gerade? ----------

  const memoryOf = (id: string): PhaseMemory => {
    let m = memory.get(id);
    if (!m) memory.set(id, (m = { runningSince: null, touched: false }));
    return m;
  };

  /** Merkt sich bei jeder Beobachtung, ob der Vorgang läuft und seit wann */
  function remember(w: Watcher, s: Seen | null, lastFireAt: string | null): void {
    const m = memoryOf(w.id);
    if (s && w.trigger.kind === 'above' && conditionMet(w.trigger, s.state)) m.touched = true;
    const running = isRunning(w.trigger, s, lastFireAt, m.touched);
    // Ein Beginn gilt nur, wenn Stups ihn erlebt hat (vorher war es ruhig); beim Start mitten im Vorgang bleibt er unbekannt
    if (running && !m.runningSince && m.sawQuiet) m.runningSince = now().toISOString();
    else if (!running) {
      m.runningSince = null;
      m.sawQuiet = true;
    }
  }

  // ---------- Zuweisung ----------

  interface Decision {
    ids: string[];
    waiting: boolean;
    /** zuletzt gewählte Person für die Rotation */
    last?: string;
    /** "Erst vorschlagen": diese Personen fragen, wer übernimmt (die Karte entsteht ohne Zuständige) */
    suggest?: string[];
  }

  /** Nächste Person nach `last` in der Reihenfolge des Kreises; mit `only` nur unter diesen */
  function nextOf(pool: string[], last: string | null, only?: Set<string>): string | undefined {
    if (pool.length === 0) return undefined;
    const start = last ? pool.indexOf(last) : -1;
    for (let i = 1; i <= pool.length; i += 1) {
      const id = pool[(start + i + pool.length) % pool.length]!;
      if (!only || only.has(id)) return id;
    }
    return undefined;
  }

  /** Wer `busy` ist („wenig Zeit"), wird bei Rotationen übersprungen; sind alle im Kreis beschäftigt, gilt die normale Reihenfolge */
  function rotate(pool: string[], last: string | null, busy: Set<string>, only?: Set<string>): string | undefined {
    const free = pool.filter((id) => !busy.has(id));
    return nextOf(pool, last, only ? new Set([...only].filter((id) => !busy.has(id))) : new Set(free)) ?? nextOf(pool, last, only);
  }

  /** Der Rückfall des Wächters (wenn niemand zu Hause ist oder sich niemand zum Übernehmen meldet) */
  function fallbackOf(rule: AssignRule, pool: string[], eligible: Set<string>, last: string | null, busy: Set<string>): Decision {
    if (rule.fallback === 'all') return { ids: pool, waiting: false };
    if (rule.fallback === 'none') return { ids: [], waiting: false };
    if (rule.fallback === 'fixed') {
      return { ids: rule.fallbackPersonId && eligible.has(rule.fallbackPersonId) ? [rule.fallbackPersonId] : [], waiting: false };
    }
    const next = rotate(pool, last, busy);
    return next ? { ids: [next], waiting: false, last: next } : { ids: [], waiting: false };
  }

  function decide(rule: AssignRule, people: User[], home: Set<string>, last: string | null, busy: Set<string> = new Set()): Decision {
    const eligible = new Set(people.map((p) => p.id));
    const order = rule.personIds.length > 0 ? rule.personIds : people.map((p) => p.id);
    const pool = order.filter((id) => eligible.has(id));
    const fallback = (): Decision => fallbackOf(rule, pool, eligible, last, busy);
    const present = new Set(pool.filter((id) => home.has(id)));

    switch (rule.mode) {
      case 'none':
        return { ids: [], waiting: false };
      case 'fixed':
        return { ids: pool, waiting: false };
      case 'rotation': {
        const next = rotate(pool, last, busy);
        return next ? { ids: [next], waiting: false, last: next } : { ids: [], waiting: false };
      }
      case 'suggest': {
        // Gefragt werden alle Erwachsenen, die zu Hause sind; ist niemand da, greift sofort der Rückfall
        const ask = pool.filter((id) => present.has(id) && !people.find((p) => p.id === id)?.isChild);
        return ask.length > 0 ? { ids: [], waiting: false, suggest: ask } : fallback();
      }
      case 'all_present':
        return present.size > 0 ? { ids: pool.filter((id) => present.has(id)), waiting: false } : fallback();
      case 'rotation_present':
      case 'first_home': {
        if (present.size > 0) {
          const next = rotate(pool, last, busy, present);
          return next ? { ids: [next], waiting: false, last: next } : { ids: [], waiting: false };
        }
        return rule.mode === 'first_home' ? { ids: [], waiting: true } : fallback();
      }
    }
  }

  // ---------- Fälligkeit und Spalte ----------

  function dueFor(t: CardTemplate, nowMs: number): string | null {
    if (t.due.kind === 'none') return null;
    if (t.due.kind === 'in') return new Date(nowMs + minutes(t.due.minutes)).toISOString();
    const tz = timeZone();
    const l = toLocal(nowMs, tz);
    const base = new Date(Date.UTC(l.y, l.m - 1, l.d + (t.due.day === 'tomorrow' ? 1 : 0)));
    const [h, mi] = t.due.time.split(':').map(Number) as [number, number];
    return new Date(
      fromLocal({ y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), h, mi, s: 0 }, tz),
    ).toISOString();
  }

  /** „Geplant" nimmt nur Karten mit Termin nach heute; sonst die erste offene Spalte */
  function columnFor(t: CardTemplate, dueAt: string | null, nowMs: number): string {
    const cols = store.getBoardView(t.boardId).columns;
    const chosen = cols.find((c) => c.id === t.columnId);
    if (!chosen) throw new Error('Die Spalte gibt es nicht mehr');
    if (!chosen.isPlanned) return chosen.id;
    const future = dueAt !== null && Date.parse(dueAt) >= tomorrowStart(nowMs);
    return future ? chosen.id : (cols.find((c) => !c.isDone && !c.isPlanned)?.id ?? chosen.id);
  }

  function tomorrowStart(nowMs: number): number {
    const tz = timeZone();
    const l = toLocal(nowMs, tz);
    const next = new Date(Date.UTC(l.y, l.m - 1, l.d + 1));
    return fromLocal({ y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate(), h: 0, mi: 0, s: 0 }, tz);
  }

  // ---------- Zähler ----------

  /** Aktueller Zählerstand; wurde seit dem Zählen eine Karte des Wächters erledigt, beginnt er von vorn */
  function counterOf(id: string): number {
    const st = data.getState(id);
    if (st.counter > 0 && st.counterSince && store.watcherCardCompletedSince(id, st.counterSince)) {
      data.patchState(id, { counter: 0, counterSince: null });
      return 0;
    }
    return st.counter;
  }

  // ---------- Auslösen ----------

  function note(w: Watcher, counter: number): string | undefined {
    return w.trigger.count > 1 ? `${counter} Auslösungen seit dem letzten Zurücksetzen` : undefined;
  }

  async function fire(w: Watcher, test = false): Promise<void> {
    const nowMs = now().getTime();
    const nowIso = new Date(nowMs).toISOString();
    const st = data.getState(w.id);

    if (!test) {
      // Sperrzeit (gilt auch für den Zähler)
      if (st.lastFireAt && nowMs - Date.parse(st.lastFireAt) < minutes(w.cooldownMin)) {
        data.patchState(w.id, { armed: false });
        data.addRun({ watcherId: w.id, result: 'cooldown', note: `Sperrzeit ${w.cooldownMin} Min.` });
        deps.onChange?.();
        return;
      }
      data.patchState(w.id, { armed: false, lastFireAt: nowIso });
      memoryOf(w.id).touched = false;

      // Zähler: erst beim N-ten Mal
      let counter = 0;
      if (w.trigger.count > 1) {
        counter = counterOf(w.id) + 1;
        data.patchState(w.id, { counter, counterSince: counter === 1 ? nowIso : (st.counterSince ?? nowIso) });
        if (counter < w.trigger.count) {
          data.addRun({ watcherId: w.id, result: 'counted', note: `${counter} von ${w.trigger.count}` });
          deps.onChange?.();
          return;
        }
      }

      // keine Doppelkarten
      const open = store.openCardOfWatcher(w.id);
      if (open && w.dedupe) {
        data.addRun({ watcherId: w.id, result: 'retriggered', cardId: open.id, note: note(w, counter) });
        data.markFired(w.id, w.lastAssignees);
        deps.onChange?.();
        return;
      }
    }

    await createCard(w, nowMs, test);
  }

  /** Symbol der Karte: das der Vorlage (von Hand), sonst das der beobachteten Entität (automatisch), sonst keins (Standard) */
  function cardIconFor(w: Watcher): { icon?: string; iconColor?: string | null; iconSource?: 'auto' | 'manual' } {
    if (w.card.icon) return { icon: w.card.icon, iconColor: w.card.iconColor ?? null, iconSource: 'manual' };
    const s = seenOf(w.trigger.entityId);
    const icon = watcherIcon({ entityId: w.trigger.entityId, deviceClass: s?.deviceClass, icon: s?.icon, name: s?.name });
    return icon ? { icon, iconColor: w.card.iconColor ?? null, iconSource: 'auto' } : w.card.iconColor ? { iconColor: w.card.iconColor } : {};
  }

  async function createCard(w: Watcher, nowMs: number, test: boolean, dedupeKey: string | null = null, runNote?: string): Promise<void> {
    // Keine gültigen Zuständigen mehr: der Wächter bleibt aktiv, legt aber nichts an, bis neue Zuständige gespeichert sind
    if (w.status === 'assignees_missing') {
      if (test) throw new ConflictError(t('Der Wächter braucht neue Zuständige, darum entsteht keine Karte.'));
      // Ein Hinweis im Protokoll genügt (nicht bei jedem Takt einer)
      if (data.runs(w.id, 1)[0]?.result !== 'no_assignees') {
        data.addRun({ watcherId: w.id, result: 'no_assignees', note: 'Keine Karte angelegt: braucht neue Zuständige' });
        deps.onChange?.();
      }
      return;
    }
    const people = peopleOf(w);
    const needsPresence = w.assign.mode === 'rotation_present' || w.assign.mode === 'all_present' || w.assign.mode === 'first_home' || w.assign.mode === 'suggest';
    const home = needsPresence ? (await presence()).home : new Set<string>();
    const busy = new Set(people.filter((p) => isBusy(p.busyUntil, nowMs, timeZone())).map((p) => p.id));
    const decision = decide(w.assign, people, home, data.getState(w.id).lastPerson, busy);

    let card: Card;
    try {
      const dueAt = decision.waiting ? null : dueFor(w.card, nowMs);
      const description = [w.card.description, decision.waiting ? WAITING_MARKER : null, test ? `(${TEST_NOTE})` : null]
        .filter(Boolean)
        .join('\n\n');
      card = store.transaction(() => {
        const created = store.createCard(
          w.card.boardId,
          {
            columnId: columnFor(w.card, dueAt, nowMs),
            title: cardTitleOf(w.card.title, w.trigger.kind, subjectOf(seenOf(w.trigger.entityId), w.trigger.entityId)),
            description: description || null,
            priority: w.card.priority,
            dueAt,
            assigneeIds: decision.ids,
            categoryIds: w.card.categoryIds,
            ...cardIconFor(w),
          },
          null,
        );
        store.setCardOrigin(created.id, { watcherId: w.id, dedupeKey });
        if (decision.waiting) data.addWaiting(created.id, w.id);
        if (decision.suggest) data.addSuggest(created.id, w.id);
        if (decision.last) data.patchState(w.id, { lastPerson: decision.last });
        data.markFired(w.id, decision.ids);
        data.addRun({
          watcherId: w.id,
          result: test ? 'test' : decision.waiting ? 'waiting' : decision.suggest ? 'suggested' : 'created',
          cardId: created.id,
          assignedTo: decision.ids,
          note: runNote ?? (w.trigger.count > 1 && !test ? note(w, data.getState(w.id).counter) : undefined),
        });
        return created;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Board oder Spalte gibt es nicht mehr: der Wächter pausiert und sagt warum
      if (/nicht gefunden|gibt es nicht mehr/i.test(message)) {
        data.setStatus(w.id, 'target_missing');
        data.setActive(w.id, false);
        unsubscribeWatcher(w.id);
      }
      data.addRun({ watcherId: w.id, result: 'error', note: message });
      deps.onChange?.();
      throw err;
    }
    if (decision.waiting) syncPresenceSubscription();
    deps.onChange?.();
    if (decision.suggest) deps.onSuggest?.(card, decision.suggest);
    else if (decision.ids.length > 0) deps.onAssigned?.(card, decision.ids);
  }

  // ---------- Bedingung prüfen ----------

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
    await fire(w);
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

  // ---------- Abos ----------

  function unsubscribeWatcher(id: string): void {
    for (const key of [`w:${id}:fire`, `w:${id}:done`]) {
      ha.unsubscribe(key);
      subscribed.delete(key);
    }
  }

  const stateOfEvent = (ev: Record<string, any>): Seen | null => toSeen(ev.variables?.trigger?.to_state);

  function subscribeWatcher(w: Watcher): void {
    const t = w.trigger;
    const fireKey = `w:${w.id}:fire`;
    const fireSig = `${t.entityId}`;
    if (subscribed.get(fireKey) !== fireSig) {
      subscribed.set(fireKey, fireSig);
      ha.subscribe(fireKey, { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: t.entityId } }, (ev) => {
        const s = stateOfEvent(ev);
        if (s) seen.set(t.entityId, s);
        void guarded(`Auslöser „${w.name}"`, () => evaluate(data.get(w.id), s));
      });
    }
    const doneKey = `w:${w.id}:done`;
    if (w.done) {
      const d = w.done;
      const sig = `${d.entityId}|${d.kind}|${d.to}|${d.value}`;
      if (subscribed.get(doneKey) !== sig) {
        subscribed.set(doneKey, sig);
        ha.subscribe(doneKey, { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: d.entityId } }, (ev) => {
          const s = stateOfEvent(ev);
          if (s) void guarded(`Erledigen „${w.name}"`, () => checkDone(data.get(w.id), d, s));
        });
      }
    } else if (subscribed.has(doneKey)) {
      ha.unsubscribe(doneKey);
      subscribed.delete(doneKey);
    }
  }

  /** Abos an den aktuellen Stand der Wächter anpassen (nach Anlegen, Ändern, Löschen, Pausieren) */
  function syncSubscriptions(): void {
    const active = data.list().filter((w) => w.active);
    const wanted = new Set(active.map((w) => w.id));
    for (const key of [...subscribed.keys()]) {
      const id = key.split(':')[1]!;
      if (key.startsWith('w:') && !wanted.has(id)) {
        ha.unsubscribe(key);
        subscribed.delete(key);
      }
    }
    for (const w of active) subscribeWatcher(w);
    syncPresenceSubscription();
  }

  // ---------- Kalender und Vorhersage (im Takt abgefragt) ----------

  /** Ein Datum ohne Uhrzeit (ganztägiger Termin) beginnt um Mitternacht Ortszeit */
  function eventMs(value: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return m ? fromLocal({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), h: 0, mi: 0, s: 0 }, timeZone()) : Date.parse(value);
  }

  type CalendarEvents = Awaited<ReturnType<NonNullable<typeof ha.getCalendarEvents>>>;
  type ForecastItems = Awaited<ReturnType<NonNullable<typeof ha.getForecast>>>;

  /** Nur die Abfrage (Netz), ohne Zugriff auf die Warteschlange: ein langsames Home Assistant hält nichts anderes auf */
  const fetchCalendar = (w: Watcher, nowMs: number): Promise<CalendarEvents> | null =>
    ha.getCalendarEvents ? ha.getCalendarEvents(w.trigger.entityId, new Date(nowMs).toISOString(), new Date(nowMs + 7 * 86_400_000).toISOString()) : null;

  async function applyCalendar(w: Watcher, nowMs: number, events: CalendarEvents): Promise<void> {
    const lead = minutes(w.trigger.leadMin ?? 720);
    const upcoming = events
      .map((e) => ({ ...e, startMs: eventMs(e.start), endMs: eventMs(e.end) }))
      .filter((e) => Number.isFinite(e.startMs) && Number.isFinite(e.endMs) && e.endMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);
    let next: { title: string; at: string } | null = null;
    for (const e of upcoming) {
      // Der Schlüssel ist die Kennung des Termins (nicht Titel oder Beginn: wer sie ändert, bekäme sonst eine zweite Karte).
      // Ohne Kennung (und für Karten aus früheren Versionen) gilt der alte Schlüssel aus Beginn und Titel.
      const legacyKey = `cal:${w.id}:${new Date(e.startMs).toISOString()}:${e.title}`;
      const key = e.uid ? `cal:${w.id}:uid:${e.uid}${e.recurrenceId ? `:${e.recurrenceId}` : ''}` : legacyKey;
      if (store.hasCardWithDedupeKey(key) || store.hasCardWithDedupeKey(legacyKey)) continue; // dieser Termin hat seine Karte schon (auch erledigt oder im Papierkorb)
      if (e.startMs - lead <= nowMs) {
        data.patchState(w.id, { lastFireAt: new Date(nowMs).toISOString() });
        await createCard(w, nowMs, false, key);
      } else if (!next) {
        next = { title: e.title, at: new Date(e.startMs).toISOString() };
      }
    }
    if (next) nextEvents.set(w.id, next);
    else nextEvents.delete(w.id);
  }

  /** Regnet es in der Vorhersage? Condition „rainy" und Verwandte, oder eine Wahrscheinlichkeit ab 50 %, oder spürbarer Niederschlag */
  const RAINY = new Set(['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy', 'hail']);

  const fetchForecast = (w: Watcher): Promise<ForecastItems> | null => (ha.getForecast ? ha.getForecast(w.trigger.entityId) : null);

  async function applyForecast(w: Watcher, nowMs: number, items: ForecastItems): Promise<void> {
    const hours = w.trigger.forecast?.hours ?? 3;
    const wet = items.some((i) => {
      const at = Date.parse(i.datetime);
      if (!Number.isFinite(at) || at < nowMs - 30 * 60_000 || at > nowMs + hours * 3_600_000) return false;
      return (typeof i.condition === 'string' && RAINY.has(i.condition)) || (i.precipitation_probability ?? 0) >= 50 || (i.precipitation ?? 0) >= 0.3;
    });
    // wie bei Zuständen: erst wieder scharf, wenn es einmal trocken war; Sperrzeit und Doppelkarten-Regel gelten wie sonst
    const st = data.getState(w.id);
    if (!wet) {
      if (!st.armed || st.metSince) data.patchState(w.id, { armed: true, metSince: null });
      return;
    }
    if (!st.metSince) data.patchState(w.id, { metSince: new Date(nowMs).toISOString() });
    if (st.armed) await fire(w);
  }

  /** Zeitlimit für eine Abfrage von Kalender oder Vorhersage */
  const pollTimeoutMs = deps.pollTimeoutMs ?? 20_000;

  function withTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Zeitüberschreitung')), pollTimeoutMs);
    });
    return Promise.race([p, limit]).finally(() => clearTimeout(timer));
  }

  /**
   * Fragt Kalender und Vorhersage ab, höchstens alle 30 Minuten je Wächter; nach einem Fehler nach 5 Minuten wieder.
   * Die Abfragen laufen parallel und außerhalb der Warteschlange (mit Zeitlimit); nur das Auswerten der Antworten geht durch sie.
   */
  async function fetchExternal(nowMs: number): Promise<{ w: Watcher; result: PromiseSettledResult<CalendarEvents | ForecastItems | null> }[]> {
    const due = data.list().filter((w) => {
      const kind = w.trigger.kind;
      if (!w.active || (kind !== 'calendar_event' && kind !== 'forecast')) return false;
      if (nowMs - (lastPoll.get(w.id) ?? -Infinity) < POLL_MS) return false;
      lastPoll.set(w.id, nowMs);
      return true;
    });
    const results = await Promise.allSettled(
      due.map(async (w) => {
        const pending: Promise<CalendarEvents | ForecastItems> | null = w.trigger.kind === 'calendar_event' ? fetchCalendar(w, nowMs) : fetchForecast(w);
        return pending ? await withTimeout(pending) : null;
      }),
    );
    return due.map((w, i) => ({ w, result: results[i]! }));
  }

  // ---------- Heimkehr ----------

  let presenceSig = '';
  function syncPresenceSubscription(): void {
    const waiting = data.listWaiting();
    if (waiting.length === 0) {
      if (presenceSig) ha.unsubscribe('presence');
      presenceSig = '';
      return;
    }
    const entities = persons.map((p) => p.entity_id).sort();
    const sig = entities.join(',');
    if (entities.length === 0 || sig === presenceSig) return;
    presenceSig = sig;
    ha.subscribe('presence', { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: entities, to: 'home' } }, (ev) => {
      const entityId = ev.variables?.trigger?.entity_id;
      if (typeof entityId === 'string') void guarded('Heimkehr', () => arrival(entityId));
    });
  }

  const stripMarker = (d: string | null): string | null => {
    const t = (d ?? '').replace(WAITING_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
    return t === '' ? null : t;
  };

  async function assign(row: Waiting, w: Watcher, ids: string[], nowMs: number): Promise<void> {
    const card = store.getCard(row.cardId);
    store.transaction(() => {
      const first = row.firstAssignedAt === null;
      const merged = [...new Set([...card.assigneeIds, ...ids])];
      store.updateCard(card.id, {
        assigneeIds: merged,
        ...(first ? { dueAt: dueFor(w.card, nowMs), description: stripMarker(card.description) } : {}),
      });
      if (first) data.markFirstAssigned(card.id);
      data.markFired(w.id, merged);
      data.addRun({ watcherId: w.id, result: 'assigned', cardId: card.id, assignedTo: ids, note: first ? 'erste Person zu Hause' : 'kurz danach auch zu Hause' });
    });
    deps.onChange?.();
    deps.onAssigned?.(store.getCard(card.id), ids);
  }

  /** Eine Person ist heimgekommen */
  async function arrival(entityId: string): Promise<void> {
    const nowMs = now().getTime();
    const states = await personStates(0);
    const entity = states.find((s) => s.entity_id === entityId);
    const people = store.people();
    const who = personOfEntity(entity, people);
    if (!who) return;

    for (const row of data.listWaiting()) {
      let w: Watcher;
      let card: Card;
      try {
        w = data.get(row.watcherId);
        card = store.getCard(row.cardId);
      } catch {
        data.removeWaiting(row.cardId);
        continue;
      }
      if (card.completedAt) {
        data.removeWaiting(row.cardId);
        continue;
      }
      if (row.firstAssignedAt === null && card.assigneeIds.length > 0) {
        data.removeWaiting(row.cardId); // von Hand zugewiesen
        continue;
      }
      if (row.firstAssignedAt !== null && nowMs - Date.parse(row.firstAssignedAt) > JOIN_WINDOW_MS) {
        data.removeWaiting(row.cardId);
        continue;
      }
      const inCircle = w.assign.personIds.length === 0 || w.assign.personIds.includes(who.id);
      if (!inCircle || card.assigneeIds.includes(who.id) || !store.canSeeBoard(who.id, card.boardId)) continue;
      await assign(row, w, [who.id], nowMs);
    }
    syncPresenceSubscription();
  }

  /** Nach 24 Stunden ohne Heimkehr: Rückfall; abgelaufene Fristen aufräumen */
  function checkWaiting(nowMs: number): void {
    for (const row of data.listWaiting()) {
      if (row.firstAssignedAt !== null) {
        if (nowMs - Date.parse(row.firstAssignedAt) > JOIN_WINDOW_MS) data.removeWaiting(row.cardId);
        continue;
      }
      if (nowMs - Date.parse(row.since) < WAIT_LIMIT_MS) continue;
      let w: Watcher;
      let card: Card;
      try {
        w = data.get(row.watcherId);
        card = store.getCard(row.cardId);
      } catch {
        data.removeWaiting(row.cardId);
        continue;
      }
      data.removeWaiting(row.cardId);
      if (card.completedAt || card.assigneeIds.length > 0) continue;
      const people = peopleOf(w);
      const ids =
        w.assign.waitFallback === 'all'
          ? people.filter((p) => w.assign.personIds.length === 0 || w.assign.personIds.includes(p.id)).map((p) => p.id)
          : w.assign.waitFallback === 'fixed' && w.assign.fallbackPersonId && people.some((p) => p.id === w.assign.fallbackPersonId)
            ? [w.assign.fallbackPersonId]
            : [];
      store.transaction(() => {
        store.updateCard(card.id, { assigneeIds: ids, description: stripMarker(card.description), ...(ids.length ? { dueAt: dueFor(w.card, nowMs) } : {}) });
        data.addRun({ watcherId: w.id, result: 'assigned', cardId: card.id, assignedTo: ids, note: 'nach 24 Stunden niemand heimgekommen' });
      });
      deps.onChange?.();
      if (ids.length > 0) deps.onAssigned?.(store.getCard(card.id), ids);
    }
  }

  // ---------- Anlegen und Abgleich ----------

  /** Bedingungen, die Stups am Zustand der Entität prüft (Kalender und Vorhersage fragt der Takt ab) */
  const checksState = (w: Watcher): boolean => w.trigger.kind === 'state' || w.trigger.kind === 'above' || w.trigger.kind === 'below';

  /**
   * Nach dem Anlegen oder Ändern: Startzustand prüfen (kein Auslösen, wenn die Bedingung schon erfüllt ist, außer bei Pegeln) und
   * abonnieren. Antwort: `MetNow`, wenn die Bedingung schon erfüllt ist, nichts von selbst ausgelöst hat und keine Karte des Wächters
   * offen ist, sonst null.
   */
  async function onSaved(id: string): Promise<MetNow | null> {
    let metNow: MetNow | null = null;
    await guarded('Speichern', async () => {
      const w = data.get(id);
      let states: HaState[];
      try {
        states = await ha.getStates();
      } catch {
        // Home Assistant nicht erreichbar: vorsichtig sein, erst nach einer Zeit ohne erfüllte Bedingung wieder scharf
        data.patchState(id, { armed: false, metSince: null });
        syncSubscriptions();
        return;
      }
      for (const x of states) {
        const v = toSeen(x);
        if (v) seen.set(x.entity_id, v);
      }
      persons = states.filter((x) => x.entity_id.startsWith('person.'));
      personsAt = now().getTime();
      statesLoaded = true;
      cleanAutoNames();
      const s = seenOf(w.trigger.entityId);
      if (!s) {
        data.setStatus(id, 'entity_missing');
        data.patchState(id, { armed: true, metSince: null });
      } else {
        remember(w, s, data.getState(id).lastFireAt); // der Stand beim Anlegen: lief schon etwas, ist der Beginn unbekannt
        const met = conditionMet(w.trigger, s.state);
        const nowMs = now().getTime();
        // Ein Pegel (Batterie, Temperatur), der beim ersten Anlegen schon über der Grenze liegt, ist ein Befund: die Karte kommt sofort
        // (nach der Wartezeit, gerechnet ab der letzten Änderung des Werts). Vorgänge und Unbekanntes warten auf den nächsten Wechsel.
        const levelNow = met && (w.trigger.kind === 'below' || w.trigger.kind === 'above') && measuresLevel(s, w.trigger.entityId) && !data.getState(id).lastFireAt;
        const since = met ? metSinceOf(levelNow ? 'state' : w.trigger.kind, s, nowMs) : null;
        data.patchState(id, { armed: levelNow || !met, metSince: since });
        if (w.status === 'entity_missing') data.setStatus(id, 'ok');
        if (levelNow && since && nowMs - Date.parse(since) >= minutes(w.trigger.forMin)) await fire(w);
        // Schon erfüllt und kein automatisches Auslösen: die Oberfläche darf fragen (nur wenn noch keine Karte des Wächters offen ist)
        if (met && !levelNow && w.active && checksState(w) && !store.openCardOfWatcher(id)) {
          metNow = { entityName: s.name ?? w.trigger.entityId, stateText: stateText(s.state, s.unit), reason: 'already_met' };
        }
      }
      syncSubscriptions();
      deps.onChange?.();
    });
    return metNow;
  }

  /** Nach (Wieder-)Verbinden: Zustände abgleichen, damit ein verpasster Übergang genau einmal auslöst */
  async function snapshot(): Promise<void> {
    snapshotPending = true;
    lastSnapshotTry = now().getTime();
    await guarded('Abgleich', async () => {
      const states = await ha.getStates();
      const bySeen = new Map<string, Seen>();
      for (const x of states) {
        const v = toSeen(x);
        if (v) {
          bySeen.set(x.entity_id, v);
          seen.set(x.entity_id, v);
        }
      }
      persons = states.filter((x) => x.entity_id.startsWith('person.'));
      personsAt = now().getTime();
      for (const w of data.list()) {
        if (!w.active) continue;
        await evaluate(w, bySeen.get(w.trigger.entityId) ?? null);
      }
      statesLoaded = true;
      cleanAutoNames();
      syncSubscriptions();
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
    if (statesLoaded || snapshotPending) return;
    if (deps.enabled && !deps.enabled()) return;
    if (now().getTime() - lastSnapshotTry < 10_000) return;
    void snapshot();
  }

  /** „Nach X Minuten stupsen, wenn noch offen": einmal je Karte, gerechnet ab dem Anlegen bzw. der Zuweisung */
  function checkNudges(nowMs: number): void {
    for (const w of data.list()) {
      if (!w.active || w.nudgeAfterMin === null) continue;
      const card = store.openCardOfWatcher(w.id);
      if (!card || card.assigneeIds.length === 0) continue;
      const runs = data.runsOfCard(card.id);
      const start = [...runs].reverse().find((r) => r.result === 'created' || r.result === 'assigned');
      if (!start || runs.some((r) => r.result === 'nudged' && r.at >= start.at)) continue;
      if (nowMs - Date.parse(start.at) < minutes(w.nudgeAfterMin)) continue;
      data.addRun({ watcherId: w.id, result: 'nudged', cardId: card.id, assignedTo: card.assigneeIds, note: `nach ${w.nudgeAfterMin} Min.` });
      deps.onChange?.();
      deps.onNudge?.(card, card.assigneeIds);
    }
  }

  /** Personen, die gerade zu Hause sind (auch für Automationen über stups_create_card) */
  async function presentPersonIds(): Promise<string[]> {
    return [...(await presence()).home];
  }

  /** Takt (alle 30 Sekunden): Wartezeiten abwarten, Rückfall nach 24 Stunden. Ein Fehler bei einem Wächter hält die anderen nicht auf. */
  async function tick(): Promise<void> {
    if (deps.enabled && !deps.enabled()) return;
    ensureStates();
    const nowMs = now().getTime();
    const fetched = await fetchExternal(nowMs); // Netz: außerhalb der Warteschlange
    await guarded('Takt', async () => {
      const each = async (what: string, fn: () => Promise<void> | void): Promise<void> => {
        try {
          await fn();
        } catch (err) {
          log.warn(`Wächter: ${what}: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      for (const { w, result } of fetched) {
        if (result.status === 'rejected') {
          lastPoll.set(w.id, nowMs - POLL_MS + POLL_RETRY_MS);
          log.warn(`Wächter „${w.name}": Abfrage von ${w.trigger.entityId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
          continue;
        }
        if (result.value === null) continue;
        await each(`Abfrage „${w.name}"`, async () => {
          try {
            if (w.trigger.kind === 'calendar_event') await applyCalendar(w, nowMs, result.value as CalendarEvents);
            else await applyForecast(w, nowMs, result.value as ForecastItems);
          } catch (err) {
            lastPoll.set(w.id, nowMs - POLL_MS + POLL_RETRY_MS);
            throw err;
          }
        });
      }
      for (const w of data.list()) {
        if (!w.active) continue;
        await each(`Takt „${w.name}"`, async () => {
          const st = data.getState(w.id);
          if (!st.armed || !st.metSince) return;
          const s = seenOf(w.trigger.entityId);
          if (!s || !conditionMet(w.trigger, s.state)) return;
          if (nowMs - Date.parse(st.metSince) >= minutes(w.trigger.forMin)) await fire(w);
        });
      }
      await each('Warten', () => checkWaiting(nowMs));
      await each('Vorschläge', () => checkSuggestions(nowMs));
      await each('Stupsen', () => checkNudges(nowMs));
    });
  }

  function start(): void {
    ha.onConnected(() => void snapshot());
    syncSubscriptions();
  }

  /** „Testen": legt die Karte einmal sofort an, ohne Sperrzeit, Zähler und Doppelkarten-Regel */
  async function test(id: string): Promise<void> {
    await enqueue(async () => {
      await fire(data.get(id), true);
    });
  }

  /**
   * „Ja, Karte erstellen" nach dem Speichern: legt die Karte über den normalen Weg an (Zuweisung, Fälligkeit, Spalte), aber nur, wenn
   * die Bedingung weiterhin gilt und keine Karte des Wächters offen ist. Sperrzeit und Zähler gelten hier nicht: Der Mensch hat die
   * Karte ausdrücklich gewollt, ein Schweigen wäre unverständlich. Keine Testkarte, im Lauf steht der Anlass.
   */
  async function fireNow(id: string): Promise<void> {
    await enqueue(async () => {
      const w = data.get(id);
      if (w.status === 'assignees_missing') throw new ConflictError(t('Der Wächter braucht neue Zuständige, darum entsteht keine Karte.'));
      // Der Mensch hat vielleicht eine Weile überlegt: den Stand frisch holen (ohne Verbindung gilt der zuletzt gesehene)
      try {
        for (const x of await ha.getStates()) {
          const v = toSeen(x);
          if (v) seen.set(x.entity_id, v);
        }
      } catch {
        // der zuletzt gesehene Zustand genügt
      }
      const s = seenOf(w.trigger.entityId);
      if (!w.active || !checksState(w) || !s || !conditionMet(w.trigger, s.state)) {
        throw new ConflictError(t('Die Bedingung ist nicht mehr erfüllt, darum entsteht keine Karte.'));
      }
      if (store.openCardOfWatcher(id)) throw new ConflictError(t('Zu diesem Wächter gibt es schon eine offene Karte.'));
      const nowMs = now().getTime();
      data.patchState(id, { armed: false, lastFireAt: new Date(nowMs).toISOString() });
      memoryOf(id).touched = false;
      await createCard(w, nowMs, false, null, 'beim Anlegen, auf Nachfrage');
    });
  }

  function resetCounter(id: string): void {
    data.get(id);
    data.patchState(id, { counter: 0, counterSince: null });
    deps.onChange?.();
  }

  /**
   * Die Reihenfolge für „An wen" im Editor: der Kreis, wer als Nächstes dran ist, wer zu Hause ist. Rechnet mit `decide` wie die echte
   * Zuweisung, speichert und schaltet aber nichts weiter. `watcherId` liefert die zuletzt gewählte Person (Rotation); für einen Entwurf
   * ohne Wächter beginnt der Kreis vorn.
   */
  async function order(rule: AssignRule, watcherId: string | null, boardId: string | null = null): Promise<OrderView> {
    // Nur die Personen des Boards (der gespeicherte Wächter bringt sein Board mit, ein Entwurf nennt es)
    const board = boardId ?? (watcherId ? (data.list().find((x) => x.id === watcherId)?.card.boardId ?? null) : null);
    const seeing = board ? new Set(store.boardPeopleIds(board)) : null;
    const people = store.people().filter((p) => !seeing || seeing.has(p.id));
    const present = new Map<string, boolean | null>();
    let home = new Set<string>();
    try {
      const map = await presence();
      home = map.home;
      for (const p of people) present.set(p.id, map.entityOf.has(p.id) ? map.home.has(p.id) : null);
    } catch {
      // Home Assistant antwortet nicht: Anwesenheit unbekannt, die Reihenfolge gibt es trotzdem
    }
    const nowMs = now().getTime();
    const busy = new Set(people.filter((p) => isBusy(p.busyUntil, nowMs, timeZone())).map((p) => p.id));
    const last = watcherId && data.list().some((w) => w.id === watcherId) ? data.getState(watcherId).lastPerson : null;
    const d = decide(rule, people, home, last, busy);
    return orderView({ rule, people, present, nextId: d.last ?? null });
  }

  /**
   * Einmalig: Namen und Kartentitel der Vorlagen, an die frühere Versionen das Gerät gehängt haben („Trockner fertig: Nachfrage mw50gdjw"),
   * verlieren es wieder. Angefasst wird nur ein Text, der genau so aussieht, wie die alte Regel ihn aus dem Namen einer Vorlage und dem Gerät der Entität
   * baute; eigene Namen bleiben, ebenso alles, was nicht sicher passt. Läuft, sobald die Zustände aus Home Assistant da sind (dann ist
   * auch der Friendly Name bekannt), und merkt sich, dass es gelaufen ist.
   */
  function cleanAutoNames(): void {
    if (!statesLoaded || store.rawSetting(NAMES_CLEANED) === '1') return;
    const bases = templateNames();
    const titles = templateCardTitles();
    let changed = 0;
    for (const w of data.list()) {
      const friendly = seenOf(w.trigger.entityId)?.name;
      // auch der Kartentitel der Vorlage: sonst hinge zur Laufzeit der Name der Entität ein zweites Mal an
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

  /** Für die Oberfläche: Wächter mit Zustand, Zählerstand, Abo und letztem Lauf */
  function view() {
    ensureStates();
    const active = new Set(ha.activeSubscriptions?.() ?? []);
    const waiting = new Set(data.listWaiting().map((x) => x.cardId));
    return data.list().map((w) => {
      const st = data.getState(w.id);
      const open = store.openCardOfWatcher(w.id);
      return {
        ...w,
        armed: st.armed,
        counter: w.trigger.count > 1 ? counterOf(w.id) : 0,
        subscribed: w.active ? active.has(`w:${w.id}:fire`) : false,
        lastRun: data.runs(w.id, 1)[0] ?? null,
        /** zuletzt gesehener Zustand der beobachteten Entität */
        entityState: seenOf(w.trigger.entityId)?.state ?? null,
        entityName: seenOf(w.trigger.entityId)?.name ?? null,
        entityUnit: seenOf(w.trigger.entityId)?.unit ?? null,
        /** das Gerät unter dem Namen (siehe watcher-names.ts) */
        subject: subjectOf(seenOf(w.trigger.entityId), w.trigger.entityId),
        /** Kategorie, die Stups für diesen Wächter vorschlüge (für „Kategorien vorschlagen" bei Wächtern ohne) */
        suggestedCategory: categoryOfWatcher(w, seenOf(w.trigger.entityId)),
        /** die offene Karte dieses Wächters, falls es eine gibt */
        openCard: open ? { id: open.id, title: open.title, boardId: open.boardId, assigneeIds: open.assigneeIds, waiting: waiting.has(open.id) } : null,
      };
    });
  }

  // ---------- Erst vorschlagen: Übernehmen und Rückfall ----------

  /** Die erste Person, die auf „Übernehmen" tippt, bekommt die Karte; jede weitere erfährt, wer schneller war */
  function claim(cardId: string, userId: string): Promise<{ ok: true }> {
    return enqueue(async () => {
      const card = store.getCard(cardId);
      const row = data.getSuggest(cardId);
      const user = store.userById(userId);
      if (!user || !user.isPerson) throw new ForbiddenError(t('Das dürfen nur Personen in Stups'));
      if (user.isChild) throw new ForbiddenError(t('Das darf ein Kind nicht'));
      if (!row || card.completedAt || card.assigneeIds.length > 0) {
        const taken = card.assigneeIds[0] ? store.userById(card.assigneeIds[0])?.displayName : undefined;
        throw new ConflictError(taken ? t('{name} hat die Karte schon übernommen', { name: taken }) : t('Die Karte ist nicht mehr offen'));
      }
      store.transaction(() => {
        store.updateCard(card.id, { assigneeIds: [userId] });
        data.removeSuggest(cardId);
        data.markFired(row.watcherId, [userId]);
        data.addRun({ watcherId: row.watcherId, result: 'claimed', cardId, assignedTo: [userId] });
      });
      deps.onChange?.();
      deps.onSuggestClosed?.(store.getCard(cardId));
      return { ok: true };
    });
  }

  /** Nach 30 Minuten ohne „Übernehmen" greift der Rückfall des Wächters; Vorschläge zu erledigten oder schon vergebenen Karten verfallen */
  function checkSuggestions(nowMs: number): void {
    for (const row of data.listSuggest()) {
      let w: Watcher;
      let card: Card;
      try {
        w = data.get(row.watcherId);
        card = store.getCard(row.cardId);
      } catch {
        data.removeSuggest(row.cardId);
        continue;
      }
      if (card.completedAt || card.assigneeIds.length > 0) {
        data.removeSuggest(row.cardId);
        continue;
      }
      if (nowMs - Date.parse(row.since) < minutes(SUGGEST_WAIT_MIN)) continue;
      const people = peopleOf(w);
      const eligible = new Set(people.map((p) => p.id));
      const pool = (w.assign.personIds.length > 0 ? w.assign.personIds : people.map((p) => p.id)).filter((id) => eligible.has(id));
      const busy = new Set(people.filter((p) => isBusy(p.busyUntil, nowMs, timeZone())).map((p) => p.id));
      const decision = fallbackOf(w.assign, pool, eligible, data.getState(w.id).lastPerson, busy);
      store.transaction(() => {
        if (decision.ids.length > 0) store.updateCard(card.id, { assigneeIds: decision.ids });
        data.removeSuggest(row.cardId);
        if (decision.last) data.patchState(w.id, { lastPerson: decision.last });
        data.addRun({ watcherId: w.id, result: 'suggest_fallback', cardId: card.id, assignedTo: decision.ids, note: `nach ${SUGGEST_WAIT_MIN} Min. niemand gemeldet` });
      });
      deps.onChange?.();
      deps.onSuggestClosed?.(store.getCard(card.id));
      if (decision.ids.length > 0) deps.onAssigned?.(store.getCard(card.id), decision.ids);
    }
  }

  // ---------- Weitergeben ----------

  /**
   * Eine Karte vom Haus an die nächste Person der Rotation dieses Wächters weitergeben: derselbe Kreis und dieselbe Anwesenheitsregel
   * wie beim Zuweisen, ohne Personen mit „wenig Zeit" und ohne die, die die Karte schon haben. Die Rotation rückt nicht weiter
   * (wer weitergibt, bleibt beim nächsten Mal dran), und es zählt nicht als erledigt. Gibt es niemanden, bleibt die Karte: `{ to: null }`.
   */
  function pass(cardId: string, byUserId: string): Promise<{ to: string | null }> {
    return enqueue(async () => {
      const card = store.getCard(cardId);
      if (card.completedAt) throw new ConflictError(t('Die Karte ist schon erledigt'));
      if (!card.watcherId) throw new ConflictError(t('Nur Karten vom Haus lassen sich weitergeben'));
      if (!card.assigneeIds.includes(byUserId)) throw new ForbiddenError(t('Die Karte ist dir nicht zugewiesen'));
      let w: Watcher;
      try {
        w = data.get(card.watcherId);
      } catch {
        throw new ConflictError(t('Den Wächter dieser Karte gibt es nicht mehr'));
      }
      const people = peopleOf(w);
      const rule = w.assign;
      const eligible = new Set(people.map((p) => p.id));
      const pool = (rule.personIds.length > 0 ? rule.personIds : people.map((p) => p.id)).filter((id) => eligible.has(id));
      let needsPresence = ['rotation_present', 'all_present', 'first_home', 'suggest'].includes(rule.mode);
      let home = new Set<string>();
      if (needsPresence) {
        try {
          home = presenceOf(people, await personStates(0)).home; // frisch abfragen: das ist eine Handlung der Person
        } catch {
          needsPresence = false; // Home Assistant antwortet nicht: lieber weitergeben als gar nicht
        }
      }
      const nowMs = now().getTime();
      const busy = new Set(people.filter((p) => isBusy(p.busyUntil, nowMs, timeZone())).map((p) => p.id));
      const candidates = new Set(pool.filter((id) => id !== byUserId && !card.assigneeIds.includes(id) && !busy.has(id) && (!needsPresence || home.has(id))));
      const next = nextOf(pool, byUserId, candidates);
      if (!next) return { to: null };
      store.transaction(() => {
        store.updateCard(card.id, { assigneeIds: [...card.assigneeIds.filter((id) => id !== byUserId), next] });
        data.addRun({ watcherId: w.id, result: 'passed', cardId: card.id, assignedTo: [next], note: `von ${people.find((p) => p.id === byUserId)?.displayName ?? '?'}` });
      });
      deps.onChange?.();
      deps.onAssigned?.(store.getCard(card.id), [next]);
      return { to: next };
    });
  }

  /** Für den Reiter „Wächter": jeder Wächter (auch ein ausgeschalteter) mit seiner Phase (siehe home.ts) */
  function homeState(): HomeState {
    ensureStates();
    const link = ha.connection?.() ?? { connected: true, lostSince: null };
    const nowIso = now().toISOString();
    const items: HomeItem[] = [];
    for (const w of data.list()) {
      const s = seenOf(w.trigger.entityId);
      const st = data.getState(w.id);
      const open = store.openCardOfWatcher(w.id);
      const counter = w.trigger.count > 1 ? counterOf(w.id) : 0;
      const nextEvent = w.active ? (nextEvents.get(w.id) ?? null) : null;
      // Ein ausgeschalteter Wächter läuft nie „gerade" und zählt nicht „bald"; nur seine noch offene Karte wartet weiter auf jemanden
      let phase: HomePhase;
      let since: string | null;
      if (w.active) {
        remember(w, s, st.lastFireAt);
        ({ phase, since } = phaseOf({
          watcher: w,
          seen: s,
          lastFireAt: st.lastFireAt,
          counter,
          openCard: open ? { id: open.id, createdAt: open.createdAt } : null,
          memory: memoryOf(w.id),
          nextEvent,
          nowIso,
        }));
      } else {
        ({ phase, since } = open ? { phase: 'waiting' as const, since: open.createdAt } : { phase: 'quiet' as const, since: null });
      }
      items.push({
        watcherId: w.id,
        name: w.name,
        subject: subjectOf(s, w.trigger.entityId),
        entity: s?.name?.trim() || w.trigger.entityId,
        value: s && s.state !== '' && s.state !== 'unknown' && s.state !== 'unavailable' ? `${s.state}${s.unit ? ` ${s.unit}` : ''}` : null,
        phase,
        since,
        progress: w.active && w.trigger.count > 1 && counter > 0 ? { n: counter, of: w.trigger.count } : null,
        nextCard: w.card.title,
        entityMissing: statesLoaded && (w.status === 'entity_missing' || s === null),
        status: w.status,
        openCard: open ? { id: open.id, title: open.title, boardId: open.boardId, assigneeIds: open.assigneeIds, createdAt: open.createdAt } : null,
        nextEvent,
        active: w.active,
        category: w.category,
        trigger: w.trigger,
        entityUnit: s?.unit ?? null,
        lastFiredAt: w.lastFiredAt,
        lastAssigneeIds: w.lastAssignees,
        assign: { mode: w.assign.mode, personIds: w.assign.personIds },
      });
    }
    return { available: link.connected, lostSince: link.lostSince, items };
  }

  /** Die letzten Läufe über alle Wächter (für den Reiter „Wächter") */
  function activity(limit = 20) {
    const byId = new Map(data.list().map((w) => [w.id, w]));
    return data.recentRuns(limit).map((r) => {
      const w = byId.get(r.watcherId);
      return { ...r, subject: w ? subjectOf(seenOf(w.trigger.entityId), w.trigger.entityId) : null };
    });
  }

  return { start, presentPersonIds, order, onSaved, syncSubscriptions, snapshot, tick, test, fireNow, resetCounter, view, homeState, pass, claim, activity, idle, arrival, counterOf, evaluate: (id: string, s: Seen | null) => guarded('Auswerten', () => evaluate(data.get(id), s)) };
}

export type Watchers = ReturnType<typeof createWatchers>;
export type { WatchTrigger };
