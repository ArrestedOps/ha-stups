import { isBusy } from '../busy.js';
import { ConflictError } from '../errors.js';
import { t } from '../i18n/index.js';
import type { Card } from '../store.js';
import { watcherIcon } from '../watcher-icons.js';
import { cardTitleOf, subjectOf } from '../watcher-names.js';
import type { Watcher } from '../watcher-data.js';
import { conditionMet, WAITING_MARKER } from '../watcher-types.js';
import { decide } from './assign.js';
import type { Ctx } from './context.js';
import type { Parts } from './parts.js';
import { columnFor, dueFor, minutes } from './schedule.js';
import { toSeen } from './seen.js';

const TEST_NOTE = 'Test';

/** Auslösen und die Karte anlegen: Sperrzeit, Zähler, Doppelkarten-Regel, Zuweisung, Fälligkeit, Spalte */
export function createCards(ctx: Ctx, calls: () => Parts) {
  const { deps, store, data, ha, now, timeZone, mem, enqueue, peopleOf, seenOf, presence, memoryOf, counterOf } = ctx;

  function note(w: Watcher, counter: number): string | undefined {
    return w.trigger.count > 1 ? `${counter} Auslösungen seit dem letzten Zurücksetzen` : undefined;
  }

  /**
   * Stupsen, wenn noch offen: Die Regel des Wächters wird eine Erinnerung der Karte an die jeweils Zuständigen (gezählt ab dem Anlegen bzw.
   * Zuweisen; der Planer in notifications.ts sendet sie und beendet sie mit der Erledigung).
   */
  function armNudge(w: Watcher, cardId: string): void {
    store.setReminder(cardId, null, w.nudge ? { anchor: 'created', afterMin: w.nudge.afterMin, everyMin: w.nudge.everyMin, max: w.nudge.max, atTime: null } : null);
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
      const dueAt = decision.waiting ? null : dueFor(w.card, nowMs, timeZone());
      const description = [w.card.description, decision.waiting ? WAITING_MARKER : null, test ? `(${TEST_NOTE})` : null]
        .filter(Boolean)
        .join('\n\n');
      card = store.transaction(() => {
        const created = store.createCard(
          w.card.boardId,
          {
            columnId: columnFor(store, w.card, dueAt, nowMs, timeZone()),
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
        if (!test && !decision.waiting && !decision.suggest) armNudge(w, created.id);
        return created;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Board oder Spalte gibt es nicht mehr: der Wächter pausiert und sagt warum
      if (/nicht gefunden|gibt es nicht mehr/i.test(message)) {
        data.setStatus(w.id, 'target_missing');
        data.setActive(w.id, false);
        calls().unsubscribeWatcher(w.id);
      }
      data.addRun({ watcherId: w.id, result: 'error', note: message });
      deps.onChange?.();
      throw err;
    }
    if (decision.waiting) calls().syncPresenceSubscription();
    deps.onChange?.();
    if (decision.suggest) deps.onSuggest?.(card, decision.suggest);
    else if (decision.ids.length > 0) deps.onAssigned?.(card, decision.ids);
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
          if (v) mem.seen.set(x.entity_id, v);
        }
      } catch {
        // der zuletzt gesehene Zustand genügt
      }
      const s = seenOf(w.trigger.entityId);
      if (!w.active || !calls().checksState(w) || !s || !conditionMet(w.trigger, s.state)) {
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

  return { fire, createCard, armNudge, test, fireNow, resetCounter };
}
