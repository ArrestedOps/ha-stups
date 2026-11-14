import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData, type WatcherData } from '../src/watcher-data.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

/** Mehrere Wächter auf einmal: bearbeiten, löschen, Treffer ausblenden, gemeinsam einrichten (alles oder nichts) */
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef');
const anna = as('ha-anna', 'Anna');
const tom = as('ha-tom', 'Tom');
const kid = as('ha-kid', 'Kid');

const BAT_A = 'sensor.a_batterie';
const BAT_B = 'sensor.b_batterie';
const BAT_C = 'sensor.c_batterie';
const CAL = 'calendar.muell';

let app: FastifyInstance;
let store: Store;
let data: WatcherData;
let ha: FakeHa;
let boardId: string;
let columnId: string;
let board2: { id: string; col: string };
let secret: { id: string; col: string };
let annaId: string;
let tomId: string;

async function build() {
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db);
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  tomId = store.addPerson({ haUserId: 'ha-tom', name: 'Tom' }).id;
  const kidId = store.addPerson({ haUserId: 'ha-kid', name: 'Kid' }).id;
  store.setChild(kidId, { isChild: true });
  store.setPermissions(tomId, ['watchers']);
  const colOf = (id: string) => store.getBoardView(id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  boardId = store.createBoard({ name: 'Haushalt', withPlanned: true }).id;
  columnId = colOf(boardId);
  const b2 = store.createBoard({ name: 'Garten', withPlanned: true }).id;
  board2 = { id: b2, col: colOf(b2) };
  // nur Tom sieht dieses Board (Anna nicht): eine Zuteilung an Anna ist dort ungültig
  const s = store.createBoard({ name: 'Büro', visibility: 'selected', ownerId: tomId, memberIds: [], withPlanned: true }).id;
  secret = { id: s, col: colOf(s) };
  for (const e of [BAT_A, BAT_B, BAT_C]) ha.set(e, '40', '2026-11-04T09:00:00Z', { friendly_name: `Gerät ${e.slice(7, 8).toUpperCase()} Battery`, device_class: 'battery', unit_of_measurement: '%' });
  ha.set(CAL, 'off', '2026-11-04T09:00:00Z', { friendly_name: 'Müll' });
  data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => new Date('2026-11-04T12:00:00Z'), timeZone: () => 'Europe/Berlin' });
  engine.start();
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [], getStates: () => ha.getStates(), getHistory: (e: string, a: string, b: string) => ha.getHistory(e, a, b) },
    now: () => new Date('2026-11-04T12:00:00Z'),
    watchers: engine,
    watcherData: data,
  });
}

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

const battery = (entityId: string, extra: Record<string, unknown> = {}) => ({
  name: 'Batterie schwach',
  trigger: { entityId, kind: 'below', value: 20, forMin: 10 },
  card: { boardId, columnId, title: 'Batterie wechseln', description: 'Neue Zellen im Schrank' },
  assign: { mode: 'rotation_present' },
  done: { entityId, kind: 'above', value: 50 },
  ...extra,
});
const create = async (input: object, who: object = chef): Promise<string> => {
  const res = await call(who, 'POST', '/api/watchers', input);
  expect(res.status).toBe(201);
  return res.body.id;
};
const list = async () => (await call(chef, 'GET', '/api/watchers')).body.items as any[];
const one = async (id: string) => (await list()).find((w) => w.id === id);
const fixed = (...personIds: string[]) => ({ mode: 'fixed', personIds, fallback: 'next', waitFallback: 'none', fallbackPersonId: null });

beforeEach(() => build());

describe('POST /api/watchers/bulk', () => {
  it('Zuteilung für beide setzen, Namen bleiben', async () => {
    const a = await create(battery(BAT_A, { name: 'Batterie A' }));
    const b = await create(battery(BAT_B, { name: 'Batterie B' }));
    const res = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { assign: fixed(annaId) } });
    expect(res.status).toBe(200);
    expect(res.body.items.map((w: any) => w.id)).toEqual([a, b]);
    for (const w of await list()) expect(w.assign).toMatchObject({ mode: 'fixed', personIds: [annaId] });
    expect((await one(a)).name).toBe('Batterie A');
    expect((await one(b)).name).toBe('Batterie B');
    expect((await one(a)).card).toMatchObject({ title: 'Batterie wechseln', description: 'Neue Zellen im Schrank' });
  });

  it('Schwelle bei gleicher Art: Wert ändert sich, Entität und „von selbst erledigen" bleiben', async () => {
    const a = await create(battery(BAT_A));
    const b = await create(battery(BAT_B));
    const res = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { trigger: { value: 15 }, done: { value: 60 } } });
    expect(res.status).toBe(200);
    expect(await one(a)).toMatchObject({ trigger: { entityId: BAT_A, value: 15 }, done: { entityId: BAT_A, value: 60 } });
    expect(await one(b)).toMatchObject({ trigger: { entityId: BAT_B, value: 15 }, done: { entityId: BAT_B, value: 60 } });
  });

  it('pausieren und fortsetzen: Abos folgen', async () => {
    const a = await create(battery(BAT_A));
    const b = await create(battery(BAT_B));
    expect(ha.subs.has(`w:${a}:fire`)).toBe(true);
    const off = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { active: false } });
    expect(off.status).toBe(200);
    expect((await list()).map((w) => w.active)).toEqual([false, false]);
    expect(ha.subs.has(`w:${a}:fire`)).toBe(false);
    expect(ha.subs.has(`w:${b}:fire`)).toBe(false);
    await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { active: true } });
    expect(ha.subs.has(`w:${a}:fire`)).toBe(true);
    expect(ha.subs.has(`w:${b}:fire`)).toBe(true);
  });

  it('Review 1: gemischte Auswahl mit Schwelle ergibt 400, nichts ändert sich', async () => {
    const a = await create(battery(BAT_A));
    const c = await create({
      name: 'Tonnen',
      trigger: { entityId: CAL, kind: 'calendar_event', leadMin: 720 },
      card: { boardId, columnId, title: 'Tonnen rausstellen' },
      assign: { mode: 'rotation_present' },
    });
    const before = await list();
    const res = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, c], patch: { trigger: { value: 10 } } });
    expect(res.status).toBe(400);
    expect(await list()).toEqual(before);
    // Gemeinsame Felder gehen bei derselben Auswahl
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, c], patch: { cooldownMin: 30 } })).status).toBe(200);
    expect((await list()).map((w) => w.cooldownMin)).toEqual([30, 30]);
  });

  it('Review 1b: zwei Schwellen mit verschiedener Einheit gelten als gemischt', async () => {
    ha.set('sensor.leistung', '5', '2026-11-04T09:00:00Z', { friendly_name: 'Leistung', unit_of_measurement: 'W' });
    const a = await create(battery(BAT_A));
    const w = await create({ name: 'Leistung', trigger: { entityId: 'sensor.leistung', kind: 'below', value: 5, forMin: 3 }, card: { boardId, columnId, title: 'x' }, assign: { mode: 'none' } });
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, w], patch: { trigger: { value: 10 } } })).status).toBe(400);
  });

  it('Review 2: ist einer nach dem Patch ungültig, ändert sich keiner', async () => {
    const a = await create(battery(BAT_A));
    const b = await create(battery(BAT_B, { card: { boardId: secret.id, columnId: secret.col, title: 'Batterie wechseln' }, assign: { mode: 'fixed', personIds: [tomId] } }), tom);
    const before = await list();
    // Anna sieht das Büro-Board nicht: für Wächter b ist die Zuteilung ungültig, für a wäre sie es
    const res = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { assign: fixed(annaId), cooldownMin: 99 } });
    expect(res.status).toBe(400);
    expect(await list()).toEqual(before);
  });

  it('Review 2b: Board ändern, die Spalte gehört nicht dazu: 400, nichts geändert', async () => {
    const a = await create(battery(BAT_A));
    const b = await create(battery(BAT_B));
    const before = await list();
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { card: { boardId: board2.id } } })).status).toBe(400);
    expect(await list()).toEqual(before);
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { card: { boardId: board2.id, columnId: board2.col } } })).status).toBe(200);
    expect((await list()).map((w) => w.card.boardId)).toEqual([board2.id, board2.id]);
  });

  it('Review 3: eine unbekannte Kennung ergibt 404, nichts geändert', async () => {
    const a = await create(battery(BAT_A));
    const before = await list();
    const res = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, 'gibt-es-nicht'], patch: { cooldownMin: 45 } });
    expect(res.status).toBe(404);
    expect(await list()).toEqual(before);
  });

  it('Review 5: Wächter ohne Zuständige behält Zuteilung und Status bei einem Patch ohne assign', async () => {
    const a = await create(battery(BAT_A, { assign: fixed(annaId) }));
    const b = await create(battery(BAT_B));
    // wie nach „die Person ist nicht mehr im Board": feste Zuteilung ohne Personen, Merker gesetzt
    const w0 = data.get(a);
    data.update(a, { ...w0, assign: { ...w0.assign, personIds: [] } }, false);
    data.setStatus(a, 'assignees_missing');
    const res = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { category: 'Akkus', cooldownMin: 45 } });
    expect(res.status).toBe(200);
    const w = await one(a);
    expect(w).toMatchObject({ category: 'Akkus', cooldownMin: 45, status: 'assignees_missing' });
    expect(w.assign).toMatchObject({ mode: 'fixed', personIds: [] });
    // nur die Kategorie: ebenfalls unberührt
    await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { category: 'Andere' } });
    expect(await one(a)).toMatchObject({ category: 'Andere', status: 'assignees_missing' });
    // mit neuer Zuteilung fällt der Status weg
    await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, b], patch: { assign: fixed(tomId) } });
    expect(await one(a)).toMatchObject({ status: 'ok' });
  });

  it('Stupsen einer offenen Aufgabe folgt der neuen Regel', async () => {
    const a = await create(battery(BAT_A, { nudge: { afterMin: 30, everyMin: null, max: 1 } }));
    await call(chef, 'POST', `/api/watchers/${a}/test`);
    const card = store.getBoardView(boardId).cards[0]!;
    expect(store.openCardOfWatcher(a)?.id).toBe(card.id);
    const res = await call(chef, 'POST', '/api/watchers/bulk', { ids: [a], patch: { nudge: { afterMin: 60, everyMin: null, max: 1 } } });
    expect(res.status).toBe(200);
    expect((await one(a)).nudge).toMatchObject({ afterMin: 60 });
  });

  it('prüft die Kennungen und den Patch', async () => {
    const a = await create(battery(BAT_A));
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [], patch: { active: false } })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [a, a], patch: { active: false } })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: 'x', patch: { active: false } })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [a], patch: {} })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: [a], patch: { name: 'neu' } })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk', { ids: Array.from({ length: 501 }, (_, i) => `w${i}`), patch: { active: false } })).status).toBe(400);
  });

  it('Rechte: nur Administratoren und wer „watchers" darf; Kinder nie', async () => {
    const a = await create(battery(BAT_A));
    const body = { ids: [a], patch: { cooldownMin: 20 } };
    expect((await call(anna, 'POST', '/api/watchers/bulk', body)).status).toBe(403);
    expect((await call(kid, 'POST', '/api/watchers/bulk', body)).status).toBe(403);
    expect((await call(tom, 'POST', '/api/watchers/bulk', body)).status).toBe(200);
    expect((await one(a)).cooldownMin).toBe(20);
  });
});

describe('POST /api/watchers/bulk-delete', () => {
  it('löscht alle Ausgewählten auf einmal und meldet die Abos ab', async () => {
    const a = await create(battery(BAT_A));
    const b = await create(battery(BAT_B));
    const c = await create(battery(BAT_C));
    const res = await call(chef, 'POST', '/api/watchers/bulk-delete', { ids: [a, b] });
    expect(res.status).toBe(204);
    expect((await list()).map((w) => w.id)).toEqual([c]);
    expect(ha.subs.has(`w:${a}:fire`)).toBe(false);
    expect(ha.subs.has(`w:${c}:fire`)).toBe(true);
  });

  it('eine unbekannte Kennung ergibt 404, nichts wird gelöscht', async () => {
    const a = await create(battery(BAT_A));
    const b = await create(battery(BAT_B));
    expect((await call(chef, 'POST', '/api/watchers/bulk-delete', { ids: [a, 'gibt-es-nicht', b] })).status).toBe(404);
    expect(await list()).toHaveLength(2);
  });

  it('prüft die Kennungen; Rechte wie beim Einzellöschen', async () => {
    const a = await create(battery(BAT_A));
    expect((await call(chef, 'POST', '/api/watchers/bulk-delete', { ids: [] })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk-delete', { ids: [a, a] })).status).toBe(400);
    expect((await call(anna, 'POST', '/api/watchers/bulk-delete', { ids: [a] })).status).toBe(403);
    expect((await call(kid, 'POST', '/api/watchers/bulk-delete', { ids: [a] })).status).toBe(403);
    expect(await list()).toHaveLength(1);
    expect((await call(tom, 'POST', '/api/watchers/bulk-delete', { ids: [a] })).status).toBe(204);
    expect(await list()).toHaveLength(0);
  });
});

describe('POST /api/watchers/suggestions/hide-many', () => {
  const hits = [BAT_A, BAT_B, BAT_C].map((entityId) => ({ templateId: 'battery', entityId }));
  const suggestions = async () => (await call(chef, 'GET', '/api/watchers/suggestions')).body;

  it('blendet mehrere Treffer aus: sie stehen unter „hidden", nicht unter „items"', async () => {
    const res = await call(chef, 'POST', '/api/watchers/suggestions/hide-many', { hits });
    expect(res.status).toBe(204);
    const s = await suggestions();
    expect(s.items.filter((x: any) => x.templateId === 'battery')).toEqual([]);
    expect(s.hidden.map((x: any) => x.entityId).sort()).toEqual([BAT_A, BAT_B, BAT_C]);
  });

  it('ein ungültiger Treffer ergibt 400, nichts wird ausgeblendet', async () => {
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide-many', { hits: [hits[0], { templateId: 'gibtsnicht', entityId: BAT_B }] })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide-many', { hits: [hits[0], { templateId: 'battery', entityId: 'kaputt' }] })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide-many', { hits: [] })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/suggestions/hide-many', { hits: 'x' })).status).toBe(400);
    expect((await suggestions()).hidden).toEqual([]);
  });

  it('Rechte: Administratoren und „watchers", Kinder nie; doppelte Treffer sind harmlos', async () => {
    expect((await call(anna, 'POST', '/api/watchers/suggestions/hide-many', { hits })).status).toBe(403);
    expect((await call(kid, 'POST', '/api/watchers/suggestions/hide-many', { hits })).status).toBe(403);
    expect((await call(tom, 'POST', '/api/watchers/suggestions/hide-many', { hits: [hits[0], hits[0]] })).status).toBe(204);
    expect((await suggestions()).hidden).toHaveLength(1);
  });
});

describe('POST /api/watchers/bulk-create', () => {
  const base = (extra: Record<string, unknown> = {}) => battery(BAT_A, { assign: fixed(annaId), ...extra });
  const devices = (...ids: string[]) => ids.map((entityId) => ({ entityId }));

  it('legt je Gerät einen Wächter an: eigene Entität (auch beim Erledigen), gleiches Board, gleiche Zuteilung, gleicher Name', async () => {
    const res = await call(chef, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A, BAT_B, BAT_C) });
    expect(res.status).toBe(201);
    expect(res.body.skipped).toEqual([]);
    expect(res.body.created).toHaveLength(3);
    const all = await list();
    expect(all.map((w) => w.trigger.entityId)).toEqual([BAT_A, BAT_B, BAT_C]);
    expect(all.map((w) => w.done.entityId)).toEqual([BAT_A, BAT_B, BAT_C]);
    for (const w of all) {
      expect(w).toMatchObject({ name: 'Batterie schwach', card: { boardId, columnId, title: 'Batterie wechseln' }, assign: { mode: 'fixed', personIds: [annaId] }, trigger: { value: 20, forMin: 10 }, done: { value: 50 } });
      expect(ha.subs.has(`w:${w.id}:fire`)).toBe(true);
    }
  });

  it('Review 4: eine Entität, die schon beobachtet wird, wird übersprungen und gemeldet, die übrigen entstehen', async () => {
    await create(battery(BAT_B));
    const res = await call(chef, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A, BAT_B, BAT_C) });
    expect(res.status).toBe(201);
    expect(res.body.skipped).toEqual([BAT_B]);
    expect(res.body.created.map((w: any) => w.trigger.entityId)).toEqual([BAT_A, BAT_C]);
    expect(await list()).toHaveLength(3);
    // noch einmal (Doppelklick, zweiter Tab): alles übersprungen, nichts Neues
    const again = await call(chef, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A, BAT_B, BAT_C) });
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ created: [], skipped: [BAT_A, BAT_B, BAT_C] });
    expect(await list()).toHaveLength(3);
  });

  it('doppelte Geräte in der Anfrage zählen einmal', async () => {
    const res = await call(chef, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A, BAT_A, BAT_B) });
    expect(res.body.created).toHaveLength(2);
  });

  it('ein ungültiger Entwurf ergibt 400, es entsteht keiner', async () => {
    const wrongBoard = base({ card: { boardId: 'gibt-es-nicht', columnId, title: 'x' } });
    expect((await call(chef, 'POST', '/api/watchers/bulk-create', { base: wrongBoard, devices: devices(BAT_A, BAT_B) })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk-create', { base: base({ name: '' }), devices: devices(BAT_A) })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A, 'kaputt') })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk-create', { base: base(), devices: [] })).status).toBe(400);
    expect((await call(chef, 'POST', '/api/watchers/bulk-create', { base: 'x', devices: devices(BAT_A) })).status).toBe(400);
    expect(await list()).toEqual([]);
  });

  it('ohne Angabe zählt die Fairness wie das Board; ein Wert im Entwurf geht vor', async () => {
    const b = store.createBoard({ name: 'Ohne Zählung', countsForFairness: false, withPlanned: true });
    const col = store.getBoardView(b.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
    await call(chef, 'POST', '/api/watchers/bulk-create', { base: base({ card: { boardId: b.id, columnId: col, title: 'x' } }), devices: devices(BAT_A) });
    await call(chef, 'POST', '/api/watchers/bulk-create', { base: base({ card: { boardId: b.id, columnId: col, title: 'x' }, countsForFairness: true }), devices: devices(BAT_B) });
    expect((await list()).map((w) => w.countsForFairness)).toEqual([false, true]);
  });

  it('eine Batterie, die schon leer ist, löst gleich eine Aufgabe aus (wie beim Einzelanlegen)', async () => {
    ha.set(BAT_C, '3');
    await call(chef, 'POST', '/api/watchers/bulk-create', { base: base({ trigger: { entityId: BAT_A, kind: 'below', value: 20, forMin: 0 } }), devices: devices(BAT_A, BAT_C) });
    expect(store.getBoardView(boardId).cards).toHaveLength(1);
  });

  it('Rechte: nicht für Mitglieder ohne „watchers" und nicht für Kinder', async () => {
    expect((await call(anna, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A) })).status).toBe(403);
    expect((await call(kid, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A) })).status).toBe(403);
    expect((await call(tom, 'POST', '/api/watchers/bulk-create', { base: base(), devices: devices(BAT_A) })).status).toBe(201);
  });
});
