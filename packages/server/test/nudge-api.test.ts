import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({
  'x-remote-user-id': id,
  'x-remote-user-name': name,
  'x-remote-user-display-name': name,
});
const anna = as('ha-anna', 'Anna');
const chef = as('ha-chef', 'Chef'); // Administrator, aber keine Person
const fremd = as('ha-fremd', 'Fremd'); // keine Person

let app: FastifyInstance;
let store: Store;
let cardId: string;
let annaId: string;
let benId: string;
let ticks: number;

beforeEach(async () => {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-11-04T10:00:00Z'), timeZone: () => 'Europe/Berlin' });
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  store.setNotifyServices(annaId, ['mobile_app_anna']);
  store.setNotifyServices(benId, ['mobile_app_ben']);
  const b = store.createBoard({ name: 'Haushalt' });
  cardId = store.createCard(b.id, { columnId: store.getBoardView(b.id).columns[0]!.id, title: 'Mülltonne raus', assigneeIds: [benId] }, annaId).id;

  ticks = 0;
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    notifier: { clearFor: async () => undefined, tick: async () => void (ticks += 1) as unknown as number },
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [], listNotifyServices: async () => ['mobile_app_anna', 'mobile_app_ben'] },
  });
});

async function call(who: object, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

describe('POST /api/cards/:id/nudge', () => {
  it('stupst die gewählte Person und stößt die Zustellung an', async () => {
    const r = await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'think' });
    expect(r.status).toBe(201);
    expect(r.body.sent).toEqual([{ nudgeId: expect.any(String), to: benId, status: 'sent', deliverAt: '2026-11-04T10:00:00.000Z' }]);
    expect(r.body.skipped).toEqual([]);
    await new Promise((res) => setTimeout(res, 5));
    expect(ticks).toBe(1);

    const board = (await call(anna, 'GET', `/api/boards/${store.listBoards(null)[0]!.id}`)).body;
    expect(board.cards[0].openNudges).toEqual([{ id: r.body.sent[0].nudgeId, fromId: annaId, toId: benId, delivered: false }]);
  });

  it('die Sperrzeit gilt auf dem Server: 409 mit dem Zeitpunkt, ab wann es wieder geht', async () => {
    await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'think' });
    const r = await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'today' });
    expect(r.status).toBe(409);
    expect(r.body.skipped).toEqual([{ to: benId, reason: 'rate', retryAt: '2026-11-04T10:30:00.000Z' }]);
    expect(r.body.error).toMatch(/stupsen/i);
  });

  it('prüft die Eingaben', async () => {
    expect((await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId] })).status).toBe(400);
    expect((await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [], template: 'think' })).status).toBe(400);
    expect((await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], text: 'x'.repeat(121) })).status).toBe(400);
    expect((await call(anna, 'POST', '/api/cards/gibt-es-nicht/nudge', { to: [benId], template: 'think' })).status).toBe(404);
  });

  it('wer keine Person ist, kann nicht stupsen (auch kein Administrator ohne Person)', async () => {
    expect((await call(chef, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'think' })).status).toBe(403);
    expect((await call(fremd, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'think' })).status).toBe(403);
  });

  it('niemand lässt sich an eine entfernte oder ausgeblendete Person stupsen', async () => {
    store.removePerson(benId);
    const r = await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'think' });
    expect(r.status).toBe(409);
    expect(r.body.skipped).toEqual([{ to: benId, reason: 'no_person', retryAt: null }]);
  });

  it('bei „nur freigegebene" kommt eine entfernte Person gar nicht erst an die API', async () => {
    store.setAccessMode('selected');
    store.removePerson(annaId);
    expect((await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'think' })).status).toBe(403);
  });
});

describe('GET /api/cards/:id/nudges', () => {
  it('liefert die Auswahl mit Vorauswahl, Gründen und der Schnellauswahl', async () => {
    const r = (await call(anna, 'GET', `/api/cards/${cardId}/nudges`)).body;
    expect(r.canNudge).toBe(true);
    expect(r.maxText).toBe(120);
    expect(r.templates).toMatchObject({ think: 'Denkst du dran?' });
    expect(r.people).toEqual([
      { id: benId, name: 'Ben', color: expect.any(String), selectable: true, reason: null, retryAt: null, deliverAt: null, preselected: true },
    ]);
  });

  it('wer keine Person ist, bekommt keine Auswahl', async () => {
    const r = (await call(fremd, 'GET', `/api/cards/${cardId}/nudges`)).body;
    expect(r).toMatchObject({ canNudge: false, people: [] });
  });
});

describe('Ruhezeit einstellen', () => {
  it('jede Person stellt ihre eigene Ruhezeit ein, für andere nur ein Administrator', async () => {
    const own = await call(anna, 'PATCH', `/api/access/people/${annaId}`, { quietStart: '21:00', quietEnd: '06:30' });
    expect(own.status).toBe(200);
    expect(own.body.nudgeQuiet).toEqual({ start: '21:00', end: '06:30', off: false });

    expect((await call(anna, 'PATCH', `/api/access/people/${benId}`, { quietOff: true })).status).toBe(403);
    const byAdmin = await call(chef, 'PATCH', `/api/access/people/${benId}`, { quietOff: true });
    expect(byAdmin.body.nudgeQuiet.off).toBe(true);
    expect((await call(anna, 'PATCH', `/api/access/people/${annaId}`, { quietStart: 'früh' })).status).toBe(400);
  });
});

describe('Push-Übersicht', () => {
  it('zeigt Stupse mit ihrem Stand', async () => {
    await call(anna, 'POST', `/api/cards/${cardId}/nudge`, { to: [benId], template: 'think' });
    const s = (await call(anna, 'GET', '/api/notifications/status')).body;
    expect(s.nudges).toEqual([
      { title: 'Mülltonne raus', from: 'Anna', to: 'Ben', at: '2026-11-04T10:00:00.000Z', deliverAt: '2026-11-04T10:00:00.000Z', state: 'offen' },
    ]);
  });
});
