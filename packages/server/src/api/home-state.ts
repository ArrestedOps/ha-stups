import type { FastifyInstance } from 'fastify';
import { type ApiKit } from './kit.js';

/** Zuhause: der Zustand der Wächter. Alle Erwachsenen sehen ihn (ein Kind nicht: die Erlaubnisliste verweigert die Route). */
export function registerHomeStateRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store } = k;
  // Eine offene Aufgabe aus einem Board, das die Person nicht sieht, taucht hier nicht auf
  app.get('/api/home', async (req) => {
    const state = deps.watchers?.homeState() ?? { available: false, lostSince: null, items: [] };
    const me = req.user?.id ?? null;
    return { ...state, items: state.items.map((i) => (i.openCard && !store.canSeeBoard(me, i.openCard.boardId) ? { ...i, openCard: null } : i)) };
  });
}
