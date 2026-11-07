import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { createEventBus } from '../src/events.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name: string) => ({ 'x-remote-user-id': `ha-${id}`, 'x-remote-user-name': id, 'x-remote-user-display-name': name });
const rene = as('rene', 'René');
const conny = as('conny', 'Conny');

let app: FastifyInstance;
let store: Store;

beforeEach(async () => {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-10-30T10:00:00Z') });
  store.syncPeople([{ name: 'Rene', notify: [] }, { name: 'Conny', notify: [] }]);
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, bus: createEventBus(), overdueNagTime: '19:15', fetchTitle: async () => null });
});

async function call(h: Record<string, string>, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: h, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

describe('Nachhaken in der API', () => {
  it('ist persönlich: GET und PATCH liefern nur das eigene, andere sehen und überschreiben es nicht', async () => {
    const b = (await call(rene, 'POST', '/api/boards', { name: 'Haushalt', withPlanned: false })).body;
    const v = (await call(rene, 'GET', `/api/boards/${b.id}`)).body;
    const card = (await call(rene, 'POST', `/api/boards/${b.id}/cards`, { columnId: v.columns[0].id, title: 'Müll', dueAt: '2026-11-01T09:00:00Z' })).body;
    expect(card.reminder).toBeNull();

    const spec = { anchor: 'due', afterMin: 1440, everyMin: 1440, max: 3, atTime: '09:00' };
    const set = await call(rene, 'PATCH', `/api/cards/${card.id}`, { reminder: spec });
    expect(set.body.reminder).toEqual(spec);
    expect((await call(rene, 'GET', `/api/cards/${card.id}`)).body.reminder).toEqual(spec);
    expect((await call(conny, 'GET', `/api/cards/${card.id}`)).body.reminder).toBeNull();

    // Conny stellt ihr eigenes ein: Renés bleibt, wie es ist
    const own = { anchor: 'created', afterMin: 60, everyMin: null, max: 1, atTime: null };
    expect((await call(conny, 'PATCH', `/api/cards/${card.id}`, { reminder: own })).body.reminder).toEqual(own);
    expect((await call(rene, 'GET', `/api/cards/${card.id}`)).body.reminder).toEqual(spec);
    expect((await call(conny, 'PATCH', `/api/cards/${card.id}`, { reminder: null })).body.reminder).toBeNull();
    expect((await call(rene, 'GET', `/api/cards/${card.id}`)).body.reminder).toEqual(spec);

    expect((await call(rene, 'PATCH', `/api/cards/${card.id}`, { reminder: { afterMin: 1 } })).status).toBe(400);
    expect((await call(rene, 'GET', '/api/settings')).body.overdueNagTime).toBe('19:15');
  });
});
