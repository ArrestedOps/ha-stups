import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

// Kategorien und Ein-/Ausschalten in der Ansicht „Wächter"
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef');
const anna = as('ha-anna', 'Anna');
const mia = as('ha-mia', 'Mia');

const ENTITY = 'sensor.waschmaschine_leistung';
let app: FastifyInstance;
let store: Store;
let ha: FakeHa;
let boardId: string;
let columnId: string;
let annaId: string;
let t: number;

async function build() {
  t = Date.parse('2026-11-04T10:00:00Z');
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db);
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  store.setChild(store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id, { isChild: true });
  boardId = store.createBoard({ name: 'Haushalt', withPlanned: true }).id;
  columnId = store.getBoardView(boardId).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W', device_class: 'power' });
  ha.set('sensor.tuer_batterie', '80', '2026-11-04T09:00:00Z', { friendly_name: 'Tür Batterie', unit_of_measurement: '%', device_class: 'battery' });
  ha.set('calendar.abfall', 'off', '2026-11-04T09:00:00Z', { friendly_name: 'Müllabfuhr' });
  const data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => new Date(t), timeZone: () => 'Europe/Berlin' });
  engine.start();
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [], getStates: () => ha.getStates(), getHistory: (e: string, a: string, b: string) => ha.getHistory(e, a, b) },
    now: () => new Date(t),
    watchers: engine,
    watcherData: data,
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
  cooldownMin: 0,
  ...extra,
});
const create = async (extra: Record<string, unknown> = {}) => (await call(chef, 'POST', '/api/watchers', input(extra))).body;

beforeEach(() => build());

describe('Kategorie beim Anlegen und Ändern', () => {
  it('Anlegen mit Kategorie, die Sicht liefert sie; zu lang ist ein Fehler', async () => {
    const w = await create({ category: ' Haushaltsgeräte ' });
    expect(w).toMatchObject({ category: 'Haushaltsgeräte', active: true });
    expect((await call(chef, 'GET', '/api/watchers')).body.items[0]).toMatchObject({ category: 'Haushaltsgeräte', active: true });
    const bad = await call(chef, 'POST', '/api/watchers', input({ category: 'x'.repeat(41) }));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Kategorie/);
  });

  it('gleiche Namen ohne Beachtung der Groß-/Kleinschreibung werden zusammengelegt', async () => {
    await create({ category: 'Garten' });
    expect((await create({ category: 'GARTEN' })).category).toBe('Garten');
  });

  it('nur die Kategorie ändern: Recht „watchers", Mitglied ohne Recht und Kind bekommen 403; null entfernt sie', async () => {
    const w = await create({ category: 'Garten' });
    expect((await call(anna, 'PATCH', `/api/watchers/${w.id}`, { category: 'Keller' })).status).toBe(403);
    expect((await call(mia, 'PATCH', `/api/watchers/${w.id}`, { category: 'Keller' })).status).toBe(403);
    const r = await call(chef, 'PATCH', `/api/watchers/${w.id}`, { category: 'Keller' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ category: 'Keller', name: 'Waschmaschine fertig' });
    expect((await call(chef, 'PATCH', `/api/watchers/${w.id}`, { category: null })).body.category).toBeNull();
    store.setPermissions(annaId, ['watchers']);
    expect((await call(anna, 'PATCH', `/api/watchers/${w.id}`, { category: 'Bad' })).body.category).toBe('Bad');
    expect((await call(chef, 'PATCH', `/api/watchers/${w.id}`, { category: 'y'.repeat(50) })).status).toBe(400);
  });

  it('das Ändern anderer Felder lässt die Kategorie stehen', async () => {
    const w = await create({ category: 'Garten' });
    expect((await call(chef, 'PATCH', `/api/watchers/${w.id}`, { name: 'Neu' })).body).toMatchObject({ name: 'Neu', category: 'Garten' });
  });
});

describe('Schalter aktiv/aus', () => {
  it('ohne Recht 403, mit Recht und als Administrator geht es, die Sicht zeigt es', async () => {
    const w = await create();
    expect((await call(anna, 'PATCH', `/api/watchers/${w.id}`, { active: false })).status).toBe(403);
    expect((await call(chef, 'PATCH', `/api/watchers/${w.id}`, { active: false })).body.active).toBe(false);
    expect((await call(anna, 'GET', '/api/home')).body.items[0]).toMatchObject({ active: false, phase: 'quiet' });
    store.setPermissions(annaId, ['watchers']);
    expect((await call(anna, 'PATCH', `/api/watchers/${w.id}`, { active: true })).body.active).toBe(true);
    expect((await call(anna, 'GET', '/api/home')).body.items[0]).toMatchObject({ active: true });
  });

  it('ein ausgeschalteter Wächter löst nicht aus, ein wieder eingeschalteter schon', async () => {
    const w = await create();
    await call(chef, 'PATCH', `/api/watchers/${w.id}`, { active: false });
    expect(ha.subs.has(`w:${w.id}:fire`)).toBe(false);
    ha.set(ENTITY, '2');
    expect(store.getBoardView(boardId).cards).toHaveLength(0);
    await call(chef, 'PATCH', `/api/watchers/${w.id}`, { active: true });
    expect(ha.subs.has(`w:${w.id}:fire`)).toBe(true);
  });
});

describe('Vorschläge für die Kategorie', () => {
  it('Vorlagen nennen ihre Kategorie (Vorlagen ohne Wächter nicht)', async () => {
    const list = (await call(chef, 'GET', '/api/watchers/templates')).body as { id: string; kind: string; category: string | null }[];
    expect(list.find((x) => x.id === 'battery')!.category).toBe('Batterien');
    expect(list.find((x) => x.id === 'washer')!.category).toBe('Haushaltsgeräte');
    expect(list.find((x) => x.id === 'bins')!.category).toBe('Müll & Abfall');
    expect(list.filter((x) => x.kind === 'recurring').every((x) => x.category === null)).toBe(true);
  });

  it('die Entitätssuche nennt je Entität einen Vorschlag', async () => {
    const found = (await call(chef, 'GET', '/api/ha/entities?q=')).body as { entityId: string; category: string }[];
    const cat = (id: string) => found.find((e) => e.entityId === id)!.category;
    expect(cat('sensor.tuer_batterie')).toBe('Batterien');
    expect(cat(ENTITY)).toBe('Haushaltsgeräte');
    expect(cat('calendar.abfall')).toBe('Müll & Abfall');
  });
});

describe('Sammelknopf „Kategorien vorschlagen"', () => {
  it('setzt nur bei Wächtern ohne Kategorie den Vorschlag und meldet die Zahl; vorhandene bleiben', async () => {
    const mine = await create({ name: 'Eigene', category: 'Meine Kategorie' });
    const wm = await create({ name: 'Waschmaschine fertig' });
    const bat = await create({ name: 'Batterie schwach: Tür', trigger: { entityId: 'sensor.tuer_batterie', kind: 'below', value: 20, forMin: 0 } });
    const r = await call(chef, 'POST', '/api/watchers/suggest-categories');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ updated: 2 });
    const items = (await call(chef, 'GET', '/api/watchers')).body.items as { id: string; category: string }[];
    const cat = (id: string) => items.find((w) => w.id === id)!.category;
    expect(cat(mine.id)).toBe('Meine Kategorie');
    expect(cat(wm.id)).toBe('Haushaltsgeräte');
    expect(cat(bat.id)).toBe('Batterien');
    // zweiter Lauf: nichts mehr zu tun
    expect((await call(chef, 'POST', '/api/watchers/suggest-categories')).body).toEqual({ updated: 0 });
  });

  it('der Vorschlag nimmt eine schon vorhandene Schreibweise (zusammenlegen)', async () => {
    await create({ name: 'A', category: 'haushaltsgeräte' });
    const wm = await create({ name: 'Waschmaschine fertig' });
    await call(chef, 'POST', '/api/watchers/suggest-categories');
    expect((await call(chef, 'GET', '/api/watchers')).body.items.find((w: any) => w.id === wm.id).category).toBe('haushaltsgeräte');
  });

  it('nur mit Recht „watchers"', async () => {
    await create();
    expect((await call(anna, 'POST', '/api/watchers/suggest-categories')).status).toBe(403);
    expect((await call(mia, 'POST', '/api/watchers/suggest-categories')).status).toBe(403);
    store.setPermissions(annaId, ['watchers']);
    expect((await call(anna, 'POST', '/api/watchers/suggest-categories')).body).toEqual({ updated: 1 });
  });
});
