import { personOfEntity } from '../presence.js';
import type { Card } from '../store.js';
import type { Waiting, Watcher } from '../watcher-data.js';
import { WAITING_MARKER } from '../watcher-types.js';
import type { Ctx } from './context.js';
import type { Parts } from './parts.js';
import { dueFor } from './schedule.js';

/** Wer nach der ersten Heimkehr noch dazukommen darf */
const JOIN_WINDOW_MS = 2 * 60_000;
/** So lange wartet eine Aufgabe auf die erste heimkehrende Person */
const WAIT_LIMIT_MS = 24 * 3_600_000;

const stripMarker = (d: string | null): string | null => {
  const t = (d ?? '').replace(WAITING_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
  return t === '' ? null : t;
};

/** „Erste Person, die heimkommt": Aufgaben, die auf eine Heimkehr warten, und der Rückfall nach 24 Stunden */
export function createWaiting(ctx: Ctx, calls: () => Parts) {
  const { deps, store, data, now, timeZone, personStates, peopleOf } = ctx;

  async function assign(row: Waiting, w: Watcher, ids: string[], nowMs: number): Promise<void> {
    const card = store.getCard(row.cardId);
    store.transaction(() => {
      const first = row.firstAssignedAt === null;
      const merged = [...new Set([...card.assigneeIds, ...ids])];
      store.updateCard(card.id, {
        assigneeIds: merged,
        ...(first ? { dueAt: dueFor(w.card, nowMs, timeZone()), description: stripMarker(card.description) } : {}),
      });
      if (first) data.markFirstAssigned(card.id);
      data.markFired(w.id, merged);
      data.addRun({ watcherId: w.id, result: 'assigned', cardId: card.id, assignedTo: ids, note: first ? 'erste Person zu Hause' : 'kurz danach auch zu Hause' });
      calls().armNudge(w, card.id);
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
    calls().syncPresenceSubscription();
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
        store.updateCard(card.id, { assigneeIds: ids, description: stripMarker(card.description), ...(ids.length ? { dueAt: dueFor(w.card, nowMs, timeZone()) } : {}) });
        data.addRun({ watcherId: w.id, result: 'assigned', cardId: card.id, assignedTo: ids, note: 'nach 24 Stunden niemand heimgekommen' });
        if (ids.length > 0) calls().armNudge(w, card.id);
      });
      deps.onChange?.();
      if (ids.length > 0) deps.onAssigned?.(store.getCard(card.id), ids);
    }
  }

  return { arrival, checkWaiting };
}
