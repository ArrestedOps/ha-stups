import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const ben = as('ha-ben', 'Ben');
let app: FastifyInstance;
let store: Store;

beforeEach(async () => {
  store = createStore(openDb(':memory:'));
  const b = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  const board = store.createBoard({ name: 'Haushalt' });
  const col = store.getBoardView(board.id).columns[0]!.id;
  store.completeCard(store.createCard(board.id, { columnId: col, title: 'Müll', effort: 'large' }, b).id, { by: b, source: 'app' });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async () => false, persons: async () => [] } });
});

describe('GET /api/fairness', () => {
  it('liefert Zahlen je Person und Summe; ohne Angabe gilt die Woche', async () => {
    const res = await app.inject({ url: '/api/fairness', headers: ben });
    expect(res.statusCode).toBe(200);
    const f = res.json();
    expect(f.period).toBe('week');
    expect(f.people.map((p: { name: string }) => p.name)).toEqual(['Ben', 'Anna']);
    expect(f.people[0]).toMatchObject({ done: 1, effort: 3, created: 1 });
    expect(f.total).toMatchObject({ done: 1, effort: 3 });
    expect(Date.parse(f.from)).toBeLessThan(Date.parse(f.to));
  });

  it('Monat, und ungültige Zeiträume werden abgelehnt', async () => {
    expect((await app.inject({ url: '/api/fairness?period=month', headers: ben })).json().period).toBe('month');
    expect((await app.inject({ url: '/api/fairness?period=jahr', headers: ben })).statusCode).toBe(400);
  });

  it('ohne Zugriff (nur freigegebene) 403', async () => {
    store.setAccessMode('selected');
    expect((await app.inject({ url: '/api/fairness', headers: as('ha-fremd', 'Fremd') })).statusCode).toBe(403);
  });
});
