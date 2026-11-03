import type { FastifyInstance } from 'fastify';
import { type ApiKit } from './kit.js';

/** Zuhause: der Zustand der Wächter. Alle Erwachsenen sehen ihn (ein Kind nicht: die Erlaubnisliste verweigert die Route). */
export function registerHomeStateRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps } = k;
  app.get('/api/home', async () => deps.watchers?.homeState() ?? { available: false, lostSince: null, items: [] });
}
