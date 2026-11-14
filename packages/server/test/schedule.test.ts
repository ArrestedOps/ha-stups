import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

let now: Date;
let store: Store;
let rene: { id: string };
let haushalt: string;
let umbau: string;
let colH: string;
let colU: string;

beforeEach(() => {
  now = new Date('2026-11-04T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => 'Europe/Berlin' });
  store.syncPeople([{ name: 'Rene' }]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'Rene' });
  haushalt = store.createBoard({ name: 'Haushalt', color: 'blue' }).id;
  umbau = store.createBoard({ name: 'Umbau' }).id;
  colH = store.getBoardView(haushalt).columns[0]!.id;
  colU = store.getBoardView(umbau).columns[0]!.id;
});

const add = (board: string, col: string, title: string, dueAt: string | null, extra: object = {}) =>
  store.createCard(board, { columnId: col, title, dueAt, ...extra }, rene.id);

describe('Termine über alle Boards (Agenda und Kalender)', () => {
  it('liefert Aufgaben mit Termin aus allen Boards, nach Termin sortiert, mit Boardname und -farbe', () => {
    add(haushalt, colH, 'B', '2026-11-06T10:00:00Z');
    add(umbau, colU, 'A', '2026-11-05T10:00:00Z');
    add(haushalt, colH, 'ohne Termin', null);
    const list = store.listSchedule({ viewer: null });
    expect(list.map((c) => [c.title, c.boardName, c.boardColor])).toEqual([
      ['A', 'Umbau', null],
      ['B', 'Haushalt', 'blue'],
    ]);
    expect(list[0]).toMatchObject({ dueAt: '2026-11-05T10:00:00.000Z', assigneeIds: [], openNudges: [] });
  });

  it('der Zeitraum gilt für den Termin, von ist eingeschlossen, bis ausgeschlossen', () => {
    add(haushalt, colH, 'vorher', '2026-11-04T09:59:00Z');
    add(haushalt, colH, 'genau von', '2026-11-04T10:00:00Z');
    add(haushalt, colH, 'mittendrin', '2026-11-05T10:00:00Z');
    add(haushalt, colH, 'genau bis', '2026-11-06T10:00:00Z');
    const r = store.listSchedule({ viewer: null, from: '2026-11-04T10:00:00Z', to: '2026-11-06T10:00:00Z' });
    expect(r.map((c) => c.title)).toEqual(['genau von', 'mittendrin']);
  });

  it('ohne Untergrenze kommt auch alles Überfällige', () => {
    add(haushalt, colH, 'alt', '2026-09-01T10:00:00Z');
    add(haushalt, colH, 'spät', '2027-05-01T10:00:00Z');
    expect(store.listSchedule({ viewer: null, to: '2026-12-01T00:00:00Z' }).map((c) => c.title)).toEqual(['alt']);
  });

  it('filtert nach Boards', () => {
    add(haushalt, colH, 'H', '2026-11-05T10:00:00Z');
    add(umbau, colU, 'U', '2026-11-05T11:00:00Z');
    expect(store.listSchedule({ viewer: null, boardIds: [umbau] }).map((c) => c.title)).toEqual(['U']);
    expect(store.listSchedule({ viewer: null, boardIds: [haushalt, umbau] })).toHaveLength(2);
  });

  it('erledigte Aufgaben nur auf Wunsch, gelöschte, archivierte und Aufgaben gelöschter Boards nie', () => {
    const done = add(haushalt, colH, 'erledigt', '2026-11-05T10:00:00Z');
    store.completeCard(done.id, { by: rene.id, source: 'app' });
    const gone = add(haushalt, colH, 'gelöscht', '2026-11-05T11:00:00Z');
    store.deleteCard(gone.id);
    const arch = add(haushalt, colH, 'archiviert', '2026-11-05T12:00:00Z');
    store.completeCard(arch.id, { by: rene.id, source: 'app' });
    store.setArchived(arch.id, true);
    add(umbau, colU, 'offen', '2026-11-05T13:00:00Z');
    const old = store.createBoard({ name: 'Alt' });
    store.createCard(old.id, { columnId: store.getBoardView(old.id).columns[0]!.id, title: 'im toten Board', dueAt: '2026-11-05T14:00:00Z' }, rene.id);
    store.deleteBoard(old.id);

    expect(store.listSchedule({ viewer: null }).map((c) => c.title)).toEqual(['offen']);
    expect(store.listSchedule({ viewer: null, includeDone: true }).map((c) => c.title)).toEqual(['erledigt', 'offen']);
  });

  it('übernimmt Zuständige und offene Stupse der Aufgabe', () => {
    const c = add(haushalt, colH, 'X', '2026-11-05T10:00:00Z', { assigneeIds: [rene.id] });
    expect(store.listSchedule({ viewer: null })[0]).toMatchObject({ id: c.id, assigneeIds: [rene.id] });
  });
});

describe('Zuletzt erledigt (nach dem Datum der Erledigung, nicht nach der Fälligkeit)', () => {
  it('completedSince liefert heute Erledigtes, ob vor einem Monat fällig, ohne Termin oder in der Zukunft; Älteres nicht', () => {
    const lang = add(haushalt, colH, 'vor drei Wochen fällig', '2026-10-14T10:00:00Z');
    const undated = add(umbau, colU, 'ohne Termin', null);
    const spaeter = add(haushalt, colH, 'erst nächsten Monat fällig', '2026-12-10T10:00:00Z');
    const offen = add(haushalt, colH, 'noch offen', '2026-11-01T10:00:00Z');
    const alt = add(haushalt, colH, 'vor zehn Tagen erledigt', '2026-10-25T10:00:00Z');
    now = new Date('2026-10-25T10:00:00Z');
    store.completeCard(alt.id, { by: rene.id, source: 'app' });
    now = new Date('2026-11-04T10:00:00Z');
    for (const c of [lang, undated, spaeter]) store.completeCard(c.id, { by: rene.id, source: 'app' });

    const weekAgo = '2026-10-28T10:00:00.000Z';
    const titles = store.listSchedule({ viewer: null, completedSince: weekAgo }).map((c) => c.title);
    expect(titles.sort()).toEqual(['erst nächsten Monat fällig', 'ohne Termin', 'vor drei Wochen fällig']);
    expect(titles).not.toContain(offen.title);
    expect(titles).not.toContain(alt.title);
  });

  it('completedSince respektiert Sichtbarkeit, Papierkorb und Archiv und kennt die Boardauswahl', () => {
    const a = add(haushalt, colH, 'sichtbar', null);
    const b = add(umbau, colU, 'im Umbau', null);
    const gone = add(haushalt, colH, 'gelöscht', null);
    const arch = add(haushalt, colH, 'archiviert', null);
    for (const c of [a, b, gone, arch]) store.completeCard(c.id, { by: rene.id, source: 'app' });
    store.deleteCard(gone.id);
    store.setArchived(arch.id, true);
    const priv = store.createBoard({ name: 'Privat', visibility: 'private', ownerId: rene.id });
    const p = store.createCard(priv.id, { columnId: store.getBoardView(priv.id).columns[0]!.id, title: 'geheim', dueAt: null }, rene.id);
    store.completeCard(p.id, { by: rene.id, source: 'app' });

    const since = '2026-10-28T10:00:00.000Z';
    expect(store.listSchedule({ viewer: null, completedSince: since }).map((c) => c.title).sort()).toEqual(['im Umbau', 'sichtbar']);
    expect(store.listSchedule({ viewer: rene.id, completedSince: since }).map((c) => c.title).sort()).toEqual(['geheim', 'im Umbau', 'sichtbar']);
    expect(store.listSchedule({ viewer: null, completedSince: since, boardIds: [umbau] }).map((c) => c.title)).toEqual(['im Umbau']);
  });

  it('GET /api/schedule?completedSince= nimmt nur Datum mit Uhrzeit an', async () => {
    const app: FastifyInstance = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async () => true, persons: async () => [] } });
    const h = { 'x-remote-user-id': 'ha-rene', 'x-remote-user-name': 'rene', 'x-remote-user-display-name': 'Rene' };
    const c = add(haushalt, colH, 'ohne Termin', null);
    store.completeCard(c.id, { by: rene.id, source: 'app' });
    const ok = await app.inject({ method: 'GET', url: '/api/schedule?completedSince=2026-10-28T10:00:00.000Z', headers: h });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { title: string }[]).map((x) => x.title)).toEqual(['ohne Termin']);
    const bad = await app.inject({ method: 'GET', url: '/api/schedule?completedSince=gestern', headers: h });
    expect(bad.statusCode).toBe(400);
  });
});

describe('Aufgaben ohne Termin (Filter „Ohne Termin")', () => {
  it('undated liefert nur offene Aufgaben ohne Termin aus sichtbaren Boards, nach Anlage sortiert', () => {
    add(haushalt, colH, 'mit Termin', '2026-11-05T10:00:00Z');
    add(haushalt, colH, 'erste', null);
    now = new Date('2026-11-04T11:00:00Z');
    add(umbau, colU, 'zweite', null);
    const done = add(umbau, colU, 'fertig', null);
    store.completeCard(done.id, { by: rene.id, source: 'app' });
    expect(store.listSchedule({ viewer: null, undated: true }).map((c) => c.title)).toEqual(['erste', 'zweite']);
    expect(store.listSchedule({ viewer: null, undated: true, includeDone: true }).map((c) => c.title)).toEqual(['erste', 'zweite']);
    expect(store.listSchedule({ viewer: null, undated: true, boardIds: [umbau] }).map((c) => c.title)).toEqual(['zweite']);
    // ohne den Schalter bleibt alles beim Alten: nur Aufgaben mit Termin
    expect(store.listSchedule({ viewer: null }).map((c) => c.title)).toEqual(['mit Termin']);
  });
});

describe('GET /api/schedule', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store });
  });
  const get = async (url: string) => {
    const res = await app.inject({ url, headers: { 'x-remote-user-id': 'ha-rene', 'x-remote-user-name': 'rene', 'x-remote-user-display-name': 'Rene' } });
    return { status: res.statusCode, body: res.json() as any };
  };

  it('liefert die Termine, mit Zeitraum und Boards', async () => {
    add(haushalt, colH, 'H', '2026-11-05T10:00:00Z');
    add(umbau, colU, 'U', '2026-11-20T10:00:00Z');
    const all = await get('/api/schedule');
    expect(all.status).toBe(200);
    expect(all.body.map((c: { title: string }) => c.title)).toEqual(['H', 'U']);

    const r = await get(`/api/schedule?to=2026-11-10T00:00:00Z&boards=${haushalt}`);
    expect(r.body.map((c: { title: string }) => c.title)).toEqual(['H']);
  });

  it('undated=1 liefert die Aufgaben ohne Termin', async () => {
    add(haushalt, colH, 'H', '2026-11-05T10:00:00Z');
    add(umbau, colU, 'offen ohne Termin', null);
    const r = await get('/api/schedule?undated=1');
    expect(r.status).toBe(200);
    expect(r.body.map((c: { title: string }) => c.title)).toEqual(['offen ohne Termin']);
  });

  it('erledigte nur mit done=1', async () => {
    const c = add(haushalt, colH, 'fertig', '2026-11-05T10:00:00Z');
    store.completeCard(c.id, { by: rene.id, source: 'app' });
    expect((await get('/api/schedule')).body).toEqual([]);
    expect((await get('/api/schedule?done=1')).body).toHaveLength(1);
  });

  it('prüft die Zeitangaben', async () => {
    expect((await get('/api/schedule?from=gestern')).status).toBe(400);
    expect((await get('/api/schedule?to=2026-13-45')).status).toBe(400);
  });
});

describe('listSchedule: Seiten kommen aus der Datenbank, in genau der Reihenfolge der ganzen Liste', () => {
  /** Gleiche Termine, verschiedene Anlagezeiten, ein gleicher Zeitpunkt (nur die Kennung entscheidet), Aufgaben ohne Termin */
  function seedTies() {
    add(haushalt, colH, 'B', '2026-11-06T10:00:00Z');
    add(haushalt, colH, 'A', '2026-11-05T10:00:00Z');
    now = new Date('2026-11-04T11:00:00Z');
    add(umbau, colU, 'A später angelegt', '2026-11-05T10:00:00Z');
    add(umbau, colU, 'C', '2026-11-07T10:00:00Z');
    now = new Date('2026-11-04T12:00:00Z');
    for (const t of ['x1', 'x2', 'x3']) add(haushalt, colH, `gleich ${t}`, '2026-11-05T10:00:00Z'); // gleicher Termin und gleiche Anlagezeit
    for (const t of ['o1', 'o2']) add(umbau, colU, `offen ${t}`, null);
  }
  const expectedOrder = (list: { dueAt: string | null; createdAt: string; id: string }[]) =>
    [...list].sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((c) => c.id);

  it('die Seiten ergeben zusammen genau die ganze Liste, und die Reihenfolge ist Termin, Anlage, Kennung', () => {
    seedTies();
    const whole = store.listSchedule({ viewer: null });
    expect(whole.map((c) => c.id)).toEqual(expectedOrder(whole));
    const pages: string[] = [];
    for (let offset = 0; offset < whole.length + 3; offset += 3) pages.push(...store.listSchedule({ viewer: null, limit: 3, offset }).map((c) => c.id));
    expect(pages).toEqual(whole.map((c) => c.id));
    expect(store.listSchedule({ viewer: null, limit: 3, offset: whole.length })).toEqual([]);
  });

  it('countSchedule zählt dieselben Aufgaben wie die ganze Liste, unabhängig von Seite und Grenze', () => {
    seedTies();
    expect(store.countSchedule({ viewer: null })).toBe(store.listSchedule({ viewer: null }).length);
    expect(store.countSchedule({ viewer: null, limit: 2, offset: 4 })).toBe(store.listSchedule({ viewer: null }).length);
    expect(store.countSchedule({ viewer: null, undated: true })).toBe(2);
    expect(store.countSchedule({ viewer: null, boardIds: [umbau] })).toBe(store.listSchedule({ viewer: null, boardIds: [umbau] }).length);
  });

  it('„Zuletzt erledigt": die zuletzt erledigte Aufgabe zuerst, bei gleicher Zeit nach Kennung, auch seitenweise', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((t) => add(haushalt, colH, t, null));
    for (const [i, c] of cards.entries()) {
      now = new Date(`2026-11-04T10:0${i < 3 ? i : 2}:00Z`); // c, d, e gleichzeitig erledigt
      store.completeCard(c.id, { by: rene.id, source: 'app' });
    }
    const whole = store.listSchedule({ viewer: null, completedSince: '2026-11-04T00:00:00.000Z' });
    const expected = [...whole].sort((a, b) => b.completedAt!.localeCompare(a.completedAt!) || a.id.localeCompare(b.id)).map((c) => c.id);
    expect(whole.map((c) => c.id)).toEqual(expected);
    const paged = [0, 2, 4].flatMap((offset) => store.listSchedule({ viewer: null, completedSince: '2026-11-04T00:00:00.000Z', limit: 2, offset }).map((c) => c.id));
    expect(paged).toEqual(expected);
  });
});

describe('GET /api/schedule: Seiten statt stilles Abschneiden', () => {
  let app: FastifyInstance;
  const reneH = { 'x-remote-user-id': 'ha-rene', 'x-remote-user-name': 'rene', 'x-remote-user-display-name': 'Rene' };
  beforeEach(async () => {
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async (id: string) => id === 'ha-rene', persons: async () => [] } });
  });
  const get = async (url: string, headers: Record<string, string> = reneH) => {
    const res = await app.inject({ url, headers });
    return { status: res.statusCode, titles: res.statusCode === 200 ? (res.json() as { title: string }[]).map((c) => c.title) : [], total: res.headers['x-total-count'], body: res.json() as any };
  };
  const seed = (n: number) => {
    for (let i = 1; i <= n; i++) add(haushalt, colH, `K${i}`, `2026-11-${String(i + 4).padStart(2, '0')}T10:00:00Z`);
  };

  it('jede Antwort nennt mit x-total-count, wie viele Aufgaben es insgesamt gibt, auch ohne limit', async () => {
    seed(5);
    const r = await get('/api/schedule');
    expect(r.titles).toHaveLength(5);
    expect(r.total).toBe('5');
  });

  it('limit und offset liefern lückenlose, überschneidungsfreie Seiten in derselben Reihenfolge', async () => {
    seed(5);
    const pages = [await get('/api/schedule?limit=2&offset=0'), await get('/api/schedule?limit=2&offset=2'), await get('/api/schedule?limit=2&offset=4'), await get('/api/schedule?limit=2&offset=6')];
    expect(pages.map((p) => p.titles)).toEqual([['K1', 'K2'], ['K3', 'K4'], ['K5'], []]);
    expect(pages.every((p) => p.total === '5')).toBe(true);
  });

  it('ungültige Werte sind ein 400-Fehler, nie ein stilles Abschneiden', async () => {
    seed(1);
    for (const q of ['limit=0', 'limit=abc', 'limit=2001', 'limit=-1', 'offset=-1', 'offset=1.5', 'offset=abc']) {
      expect((await get(`/api/schedule?${q}`)).status, q).toBe(400);
    }
  });

  it('ein Kind: der Kinderfilter dünnt eine Seite aus, aber x-total-count zählt vor dem Filter, damit der Client weiterblättert und nichts verliert', async () => {
    const mia = store.addPerson({ haUserId: 'ha-mia', name: 'Mia' });
    store.setChild(mia.id, { isChild: true, childScope: 'assigned' });
    for (const i of [1, 2, 3]) add(haushalt, colH, `fremd${i}`, `2026-11-0${i}T10:00:00Z`);
    add(umbau, colU, 'Mias Aufgabe', '2026-11-20T10:00:00Z', { assigneeIds: [mia.id] });
    const miaH = { 'x-remote-user-id': 'ha-mia', 'x-remote-user-name': 'Mia', 'x-remote-user-display-name': 'Mia' };
    const p0 = await get('/api/schedule?limit=2&offset=0', miaH);
    const p1 = await get('/api/schedule?limit=2&offset=2', miaH);
    expect(p0.titles).toEqual([]); // die Seite ist roh voll, nach dem Filter leer
    expect(p0.total).toBe('4');
    expect(p1.titles).toEqual(['Mias Aufgabe']);
  });
});

describe('Kategorien der Aufgaben in der Terminliste (Aufgaben zeigt sie in der Zeile)', () => {
  it('jede Aufgabe bringt ihre Kategorien mit Name und Farbe mit, in der Reihenfolge der Aufgabe; ohne Kategorie eine leere Liste', () => {
    const putzen = store.addCategory(haushalt, { name: 'Putzen', color: 'blue' });
    const familie = store.addCategory(haushalt, { name: 'Familie', color: 'pink' });
    add(haushalt, colH, 'mit zwei', '2026-11-05T10:00:00Z', { categoryIds: [familie.id, putzen.id] });
    add(haushalt, colH, 'ohne', '2026-11-06T10:00:00Z');
    const list = store.listSchedule({ viewer: null });
    const two = list.find((c) => c.title === 'mit zwei')!;
    expect(two.categories.map((c) => c.id)).toEqual(two.categoryIds); // gleiche Reihenfolge wie an der Aufgabe
    expect(two.categories).toHaveLength(2);
    expect(two.categories).toEqual(expect.arrayContaining([
      { id: familie.id, name: 'Familie', color: 'pink' },
      { id: putzen.id, name: 'Putzen', color: 'blue' },
    ]));
    expect(list.find((c) => c.title === 'ohne')!.categories).toEqual([]);
  });

  it('eine gelöschte Kategorie erscheint nicht mehr', () => {
    const putzen = store.addCategory(haushalt, { name: 'Putzen', color: 'blue' });
    add(haushalt, colH, 'K', '2026-11-05T10:00:00Z', { categoryIds: [putzen.id] });
    store.deleteCategory(putzen.id);
    expect(store.listSchedule({ viewer: null }).find((c) => c.title === 'K')!.categories).toEqual([]);
  });
});
