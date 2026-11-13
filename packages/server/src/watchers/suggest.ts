import { isBusy } from '../busy.js';
import { ConflictError, ForbiddenError } from '../errors.js';
import { t } from '../i18n/index.js';
import { presenceOf } from '../presence.js';
import type { Card } from '../store.js';
import type { Watcher } from '../watcher-data.js';
import { SUGGEST_WAIT_MIN } from '../watcher-types.js';
import { fallbackOf, nextOf } from './assign.js';
import type { Ctx } from './context.js';
import { minutes } from './schedule.js';

/** „Erst vorschlagen" (Übernehmen, Rückfall nach 30 Minuten) und „Weitergeben" einer Aufgabe vom Haus */
export function createSuggest(ctx: Ctx) {
  const { deps, store, data, now, timeZone, enqueue, peopleOf, personStates } = ctx;

  /** Die erste Person, die auf „Übernehmen" tippt, bekommt die Aufgabe; jede weitere erfährt, wer schneller war */
  function claim(cardId: string, userId: string): Promise<{ ok: true }> {
    return enqueue(async () => {
      const card = store.getCard(cardId);
      const row = data.getSuggest(cardId);
      const user = store.userById(userId);
      if (!user || !user.isPerson) throw new ForbiddenError(t('Das dürfen nur Personen in Stups'));
      if (user.isChild) throw new ForbiddenError(t('Das darf ein Kind nicht'));
      if (!row || card.completedAt || card.assigneeIds.length > 0) {
        const taken = card.assigneeIds[0] ? store.userById(card.assigneeIds[0])?.displayName : undefined;
        throw new ConflictError(taken ? t('{name} hat die Aufgabe schon übernommen', { name: taken }) : t('Die Aufgabe ist nicht mehr offen'));
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

  /** Nach 30 Minuten ohne „Übernehmen" greift der Rückfall des Wächters; Vorschläge zu erledigten oder schon vergebenen Aufgaben verfallen */
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

  /**
   * Eine Aufgabe vom Haus an die nächste Person der Rotation dieses Wächters weitergeben: derselbe Kreis und dieselbe Anwesenheitsregel
   * wie beim Zuweisen, ohne Personen mit „wenig Zeit" und ohne die, die die Aufgabe schon haben. Die Rotation rückt nicht weiter
   * (wer weitergibt, bleibt beim nächsten Mal dran), und es zählt nicht als erledigt. Gibt es niemanden, bleibt die Aufgabe: `{ to: null }`.
   */
  function pass(cardId: string, byUserId: string): Promise<{ to: string | null }> {
    return enqueue(async () => {
      const card = store.getCard(cardId);
      if (card.completedAt) throw new ConflictError(t('Die Aufgabe ist schon erledigt'));
      if (!card.watcherId) throw new ConflictError(t('Nur Aufgaben vom Haus lassen sich weitergeben'));
      if (!card.assigneeIds.includes(byUserId)) throw new ForbiddenError(t('Die Aufgabe ist dir nicht zugewiesen'));
      let w: Watcher;
      try {
        w = data.get(card.watcherId);
      } catch {
        throw new ConflictError(t('Den Wächter dieser Aufgabe gibt es nicht mehr'));
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

  return { claim, checkSuggestions, pass };
}
