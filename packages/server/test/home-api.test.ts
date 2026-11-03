import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const ben = as('ha-ben', 'Ben');
const mia = as('ha-mia', 'Mia');

let app: FastifyInstance;
const get = (who: object) => app.inject({ method: 'GET', url: '/api/home', headers: who as Record<string, string> });

async function build(withWatchers: boolean) {
  const db = openDb(':memory:');
  const store = createStore(db);
  store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
  store.setChild(store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id, { isChild: true });
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  const col = store.getBoardView(b.id).columns[0]!.id;
  const ha = new FakeHa();
  ha.set('sensor.wm', '120');
  const data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => new Date(), timeZone: () => 'Europe/Berlin' });
  data.create(parseWatcher({ name: 'Waschmaschine', trigger: { entityId: 'sensor.wm', kind: 'below', value: 5 }, card: { boardId: b.id, columnId: col, title: 'Aufhängen' }, assign: { mode: 'none' } }));
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async (id: string) => id === 'ha-ben', persons: async () => [] }, ...(withWatchers ? { watchers: engine, watcherData: data } : {}) });
}

describe('GET /api/home', () => {
  beforeEach(() => build(true));

  it('liefert Verbindung und die Wächter mit Phase', async () => {
    const res = await get(ben);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true, lostSince: null, items: [{ name: 'Waschmaschine', phase: 'quiet', nextCard: 'Aufhängen' }] });
  });

  it('ein Kind darf die Seite nicht sehen', async () => {
    expect((await get(mia)).statusCode).toBe(403);
  });
});

describe('GET /api/home ohne Wächter (kein Home Assistant)', () => {
  beforeEach(() => build(false));
  it('antwortet mit „nicht verbunden" statt mit einem Fehler', async () => {
    const res = await get(ben);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: false, lostSince: null, items: [] });
  });
});
