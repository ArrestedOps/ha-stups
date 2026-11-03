import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const ben = as('ha-ben', 'Ben');
const mia = as('ha-mia', 'Mia');

let app: FastifyInstance;

beforeEach(async () => {
  const store = createStore(openDb(':memory:'), { now: () => new Date('2026-11-04T09:00:00Z'), timeZone: () => 'Europe/Berlin' });
  const benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  const miaId = store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id;
  store.setChild(miaId, { isChild: true });
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  const col = store.getBoardView(b.id).columns[0]!.id;
  store.createCard(b.id, { columnId: col, title: 'Müll raus', assigneeIds: [benId], dueAt: '2026-11-04T17:00:00Z' }, benId);
  store.createCard(b.id, { columnId: col, title: 'Zimmer', assigneeIds: [miaId], dueAt: '2026-11-04T17:00:00Z' }, benId);
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async (id: string) => id === 'ha-ben', persons: async () => [] } });
});

describe('GET /api/today', () => {
  it('liefert „Für dich" und „Bei den anderen" der angemeldeten Person', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/today', headers: ben as Record<string, string> });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { mine: { title: string }[]; house: unknown[]; others: { open: number }[] };
    expect(body.mine.map((c) => c.title)).toEqual(['Müll raus']);
    expect(body.house).toEqual([]);
    expect(body.others).toHaveLength(1);
  });

  it('ein Kind darf die Route und sieht nur das Seine', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/today', headers: mia as Record<string, string> });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { mine: { title: string }[]; others: unknown[] };
    expect(body.mine.map((c) => c.title)).toEqual(['Zimmer']);
    expect(body.others).toEqual([]);
  });
});
