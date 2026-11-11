import { orderView, type OrderView } from '../assignment-order.js';
import { isBusy } from '../busy.js';
import { phaseOf, type HomeItem, type HomePhase, type HomeState } from '../home.js';
import { categoryOfWatcher } from '../watcher-categories.js';
import { subjectOf } from '../watcher-names.js';
import type { AssignRule } from '../watcher-types.js';
import { decide } from './assign.js';
import type { Ctx } from './context.js';
import type { Parts } from './parts.js';

/** Was die Oberfläche liest: die Liste der Wächter, der Reiter „Wächter", die letzten Läufe, die Reihenfolge im Editor */
export function createViews(ctx: Ctx, calls: () => Parts) {
  const { store, data, ha, now, timeZone, mem, seenOf, presence, remember, memoryOf, counterOf } = ctx;

  /** Personen, die gerade zu Hause sind (auch für Automationen über stups_create_card) */
  async function presentPersonIds(): Promise<string[]> {
    return [...(await presence()).home];
  }

  /** Für die Oberfläche: Wächter mit Zustand, Zählerstand, Abo und letztem Lauf */
  function view() {
    calls().ensureStates();
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
        /** Bei `target_missing`: Board archiviert oder gelöscht (sonst null) */
        pausedBy: w.status === 'target_missing' ? store.targetGone(w.card.boardId) : null,
        /** die offene Karte dieses Wächters, falls es eine gibt */
        openCard: open ? { id: open.id, title: open.title, boardId: open.boardId, assigneeIds: open.assigneeIds, waiting: waiting.has(open.id) } : null,
      };
    });
  }

  /** Für den Reiter „Wächter": jeder Wächter (auch ein ausgeschalteter) mit seiner Phase (siehe home.ts) */
  function homeState(): HomeState {
    calls().ensureStates();
    const link = ha.connection?.() ?? { connected: true, lostSince: null };
    const nowIso = now().toISOString();
    const items: HomeItem[] = [];
    for (const w of data.list()) {
      const s = seenOf(w.trigger.entityId);
      const st = data.getState(w.id);
      const open = store.openCardOfWatcher(w.id);
      const counter = w.trigger.count > 1 ? counterOf(w.id) : 0;
      const nextEvent = w.active ? (mem.nextEvents.get(w.id) ?? null) : null;
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
        entityMissing: mem.statesLoaded && (w.status === 'entity_missing' || s === null),
        status: w.status,
        pausedBy: w.status === 'target_missing' ? store.targetGone(w.card.boardId) : null,
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

  return { presentPersonIds, view, homeState, activity, order };
}
