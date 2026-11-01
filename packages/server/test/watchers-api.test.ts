import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef');
const anna = as('ha-anna', 'Anna');

const ENTITY = 'sensor.waschmaschine_leistung';

let app: FastifyInstance;
let store: Store;
let ha: FakeHa;
let boardId: string;
let columnId: string;
let annaId: string;

async function build(withWatchers = true) {
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db);
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  boardId = store.createBoard({ name: 'Haushalt', withPlanned: true }).id;
  columnId = store.getBoardView(boardId).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W' });
  ha.set('binary_sensor.tuer', 'off', '2026-11-04T09:00:00Z', { friendly_name: 'Tür Waschküche' });
  const data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => new Date(), timeZone: () => 'Europe/Berlin' });
  engine.start();
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [], getStates: () => ha.getStates() },
    ...(withWatchers ? { watchers: engine, watcherData: data } : {}),
  });
}

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

const input = (extra: Record<string, unknown> = {}) => ({
  name: 'Waschmaschine fertig',
  trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
  card: { boardId, columnId, title: 'Waschmaschine ausräumen', due: { kind: 'in', minutes: 30 } },
  assign: { mode: 'fixed', personIds: [annaId] },
  ...extra,
});

beforeEach(() => build());

describe('Wächter anlegen und ändern', () => {
  it('nur Administratoren, alle anderen sehen sie nur', async () => {
    expect((await call(anna, 'POST', '/api/watchers', input())).status).toBe(403);
    const created = await call(chef, 'POST', '/api/watchers', input());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Waschmaschine fertig', active: true, status: 'ok', trigger: { forMin: 0, count: 1 } });

    const list = await call(anna, 'GET', '/api/watchers');
    expect(list.body.available).toBe(true);
    expect(list.body.items.map((w: any) => w.name)).toEqual(['Waschmaschine fertig']);

    const id = created.body.id;
    expect((await call(anna, 'PATCH', `/api/watchers/${id}`, { active: false })).status).toBe(403);
    expect((await call(anna, 'DELETE', `/api/watchers/${id}`)).status).toBe(403);
    expect((await call(anna, 'POST', `/api/watchers/${id}/test`)).status).toBe(403);
    expect((await call(anna, 'POST', `/api/watchers/${id}/reset-counter`)).status).toBe(403);
  });

  it('prüft die Eingabe mit verständlichen Meldungen', async () => {
    const bad = (extra: Record<string, unknown>) => call(chef, 'POST', '/api/watchers', input(extra));
    expect((await bad({ name: '' })).body.error).toMatch(/Name/);
    expect((await bad({ trigger: { entityId: 'nope', kind: 'below', value: 5 } })).status).toBe(400);
    expect((await bad({ card: { boardId: 'gibt-es-nicht', columnId, title: 'x' } })).body.error).toMatch(/Board gibt es nicht/);
    expect((await bad({ card: { boardId, columnId: 'falsch', title: 'x' } })).body.error).toMatch(/Spalte/);
    expect((await bad({ card: { boardId, columnId, title: 'x', categoryIds: ['falsch'] } })).body.error).toMatch(/Kategorie/);
    expect((await bad({ assign: { mode: 'fixed', personIds: ['unbekannt'] } })).body.error).toMatch(/Person/);
    expect((await call(chef, 'GET', '/api/watchers')).body.items).toEqual([]);
  });

  it('ändern, pausieren, wieder einschalten, löschen', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input())).body.id;
    const changed = await call(chef, 'PATCH', `/api/watchers/${id}`, { name: 'Spülmaschine fertig', cooldownMin: 20 });
    expect(changed.body).toMatchObject({ name: 'Spülmaschine fertig', cooldownMin: 20, trigger: { entityId: ENTITY } });

    const paused = await call(chef, 'PATCH', `/api/watchers/${id}`, { active: false });
    expect(paused.body.active).toBe(false);
    expect(ha.subs.has(`w:${id}:fire`)).toBe(false);
    const back = await call(chef, 'PATCH', `/api/watchers/${id}`, { active: true });
    expect(back.body.active).toBe(true);
    expect(ha.subs.has(`w:${id}:fire`)).toBe(true);

    expect((await call(chef, 'PATCH', `/api/watchers/${id}`, { trigger: { entityId: 'kaputt' } })).status).toBe(400);
    expect((await call(chef, 'DELETE', `/api/watchers/${id}`)).status).toBe(204);
    expect((await call(chef, 'GET', '/api/watchers')).body.items).toEqual([]);
    expect((await call(chef, 'DELETE', `/api/watchers/${id}`)).status).toBe(404);
  });
});

describe('Testen, Zähler, Läufe', () => {
  it('„Testen" legt eine Karte an, „Zähler zurücksetzen" setzt auf null, die Läufe sind abrufbar', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input({ trigger: { entityId: ENTITY, kind: 'below', value: 5, count: 3 } }))).body.id;
    const tested = await call(chef, 'POST', `/api/watchers/${id}/test`);
    expect(tested.status).toBe(200);
    const cards = store.getBoardView(boardId).cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ title: 'Waschmaschine ausräumen', watcherId: id, assigneeIds: [annaId] });

    const runs = await call(anna, 'GET', `/api/watchers/${id}/runs`);
    expect(runs.body[0]).toMatchObject({ result: 'test', cardId: cards[0]!.id });
    expect((await call(chef, 'POST', `/api/watchers/${id}/reset-counter`)).body.counter).toBe(0);
    expect((await call(chef, 'POST', '/api/watchers/gibt-es-nicht/test')).status).toBe(404);
  });

  it('ein Fehler beim Testen (Board gelöscht) kommt als Meldung zurück', async () => {
    const id = (await call(chef, 'POST', '/api/watchers', input())).body.id;
    store.deleteBoard(boardId);
    const res = await call(chef, 'POST', `/api/watchers/${id}/test`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nicht gefunden/);
  });
});

describe('Entitäten suchen', () => {
  it('nur Administratoren; Suche nach Name oder Kennung, mit Zustand und Einheit', async () => {
    expect((await call(anna, 'GET', '/api/ha/entities?q=wasch')).status).toBe(403);
    const res = await call(chef, 'GET', '/api/ha/entities?q=waschmaschine');
    expect(res.body).toEqual([{ entityId: ENTITY, name: 'Waschmaschine Leistung', state: '120', unit: 'W', domain: 'sensor' }]);
    expect((await call(chef, 'GET', '/api/ha/entities?q=wasch')).body.map((e: any) => e.entityId)).toEqual([ENTITY, 'binary_sensor.tuer']); // Treffer im Namen zuerst
    expect((await call(chef, 'GET', '/api/ha/entities?q=tür')).body.map((e: any) => e.entityId)).toEqual(['binary_sensor.tuer']);
    expect((await call(chef, 'GET', '/api/ha/entities?q=leistung waschmaschine')).body).toHaveLength(1);
  });

  it('filtert nach Art (domain) und liefert höchstens 30', async () => {
    for (let i = 0; i < 40; i += 1) ha.set(`sensor.messwert_${i}`, String(i));
    expect((await call(chef, 'GET', '/api/ha/entities?q=messwert')).body).toHaveLength(30);
    expect((await call(chef, 'GET', '/api/ha/entities?domain=binary_sensor')).body.map((e: any) => e.entityId)).toEqual(['binary_sensor.tuer']);
  });
});

describe('Ohne Verbindung zu Home Assistant', () => {
  beforeEach(() => build(false));

  it('die Liste ist leer und meldet „nicht verfügbar", Schreiben sagt warum nicht', async () => {
    expect((await call(chef, 'GET', '/api/watchers')).body).toEqual({ available: false, items: [] });
    const res = await call(chef, 'POST', '/api/watchers', input());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Home Assistant/);
  });
});
