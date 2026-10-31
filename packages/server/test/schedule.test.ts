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
  it('liefert Karten mit Termin aus allen Boards, nach Termin sortiert, mit Boardname und -farbe', () => {
    add(haushalt, colH, 'B', '2026-11-06T10:00:00Z');
    add(umbau, colU, 'A', '2026-11-05T10:00:00Z');
    add(haushalt, colH, 'ohne Termin', null);
    const list = store.listSchedule({});
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
    const r = store.listSchedule({ from: '2026-11-04T10:00:00Z', to: '2026-11-06T10:00:00Z' });
    expect(r.map((c) => c.title)).toEqual(['genau von', 'mittendrin']);
  });

  it('ohne Untergrenze kommt auch alles Überfällige', () => {
    add(haushalt, colH, 'alt', '2026-09-01T10:00:00Z');
    add(haushalt, colH, 'spät', '2027-05-01T10:00:00Z');
    expect(store.listSchedule({ to: '2026-12-01T00:00:00Z' }).map((c) => c.title)).toEqual(['alt']);
  });

  it('filtert nach Boards', () => {
    add(haushalt, colH, 'H', '2026-11-05T10:00:00Z');
    add(umbau, colU, 'U', '2026-11-05T11:00:00Z');
    expect(store.listSchedule({ boardIds: [umbau] }).map((c) => c.title)).toEqual(['U']);
    expect(store.listSchedule({ boardIds: [haushalt, umbau] })).toHaveLength(2);
  });

  it('erledigte Karten nur auf Wunsch, gelöschte, archivierte und Karten gelöschter Boards nie', () => {
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

    expect(store.listSchedule({}).map((c) => c.title)).toEqual(['offen']);
    expect(store.listSchedule({ includeDone: true }).map((c) => c.title)).toEqual(['erledigt', 'offen']);
  });

  it('übernimmt Zuständige und offene Stupse der Karte', () => {
    const c = add(haushalt, colH, 'X', '2026-11-05T10:00:00Z', { assigneeIds: [rene.id] });
    expect(store.listSchedule({})[0]).toMatchObject({ id: c.id, assigneeIds: [rene.id] });
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
