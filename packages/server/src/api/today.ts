import type { FastifyInstance } from 'fastify';
import { type ApiKit } from './kit.js';

/** Die Startseite „Heute": für die angemeldete Person (auch ein Kind, das nur seine eigenen Aufgaben sieht) */
export function registerTodayRoutes(app: FastifyInstance, k: ApiKit): void {
  const { store } = k;
  app.get('/api/today', async (req) => store.today(req.user!.id));
}
