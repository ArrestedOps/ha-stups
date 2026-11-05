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
const chef = as('ha-chef', 'Chef'); // Administrator in Home Assistant
const anna = as('ha-anna', 'Anna'); // Person, kein Administrator
const fremd = as('ha-fremd', 'Fremd'); // kein Eintrag

let app: FastifyInstance;
let store: Store;
let haAdmins: string[];

beforeEach(async () => {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-10-30T10:00:00Z') });
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  haAdmins = ['ha-chef'];
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: {
      isAdmin: async (id: string) => haAdmins.includes(id),
      persons: async () => [
        { name: 'Anna', userId: 'ha-anna' },
        { name: 'Ben', userId: 'ha-ben' },
        { name: 'Gast', userId: null },
      ],
    },
    ha: {
      listDashboards: async () => [],
      listNotifyServices: async () => ['mobile_app_anna', 'mobile_app_ben', 'persistent_notification', 'notify'],
    },
  });
});

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

describe('Wer bin ich', () => {
  it('meldet Rolle und Zugriffsmodus', async () => {
    const me = await call(chef, 'GET', '/api/me');
    expect(me.body).toMatchObject({ isAdmin: true, allowed: true, accessMode: 'everyone', user: { name: 'Chef' } });
    expect((await call(anna, 'GET', '/api/me')).body).toMatchObject({ isAdmin: false, allowed: true });
    expect((await call(anna, 'GET', '/api/me')).body.people.map((p: any) => p.name)).toEqual(['Anna']);
  });
});

describe('Sperre bei „nur freigegebene"', () => {
  beforeEach(() => {
    store.setAccessMode('selected');
  });

  it('lässt Fremde nicht an die Daten, sagt ihnen aber über /api/me, warum', async () => {
    const boards = await call(fremd, 'GET', '/api/boards');
    expect(boards.status).toBe(403);
    expect(boards.body.error).toMatch(/Zugriff/);
    expect((await call(fremd, 'GET', '/api/people')).status).toBe(403);
    expect((await call(fremd, 'POST', '/api/boards', { name: 'x' })).status).toBe(403);

    const me = await call(fremd, 'GET', '/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ allowed: false, isAdmin: false, people: [], accessMode: 'selected' });
    expect(store.listBoards()).toEqual([]);
  });

  it('Personen und Administratoren kommen hinein', async () => {
    expect((await call(anna, 'GET', '/api/boards')).status).toBe(200);
    expect((await call(chef, 'GET', '/api/boards')).status).toBe(200);
  });

  it('der Wartende erscheint beim Administrator und kommt nach dem Freigeben hinein', async () => {
    await call(fremd, 'GET', '/api/me');
    const before = (await call(chef, 'GET', '/api/access')).body;
    expect(before.pending.map((p: any) => p.name)).toEqual(['Fremd']);

    const add = await call(chef, 'POST', '/api/access/people', { haUserId: 'ha-fremd', name: 'Fremd' });
    expect(add.status).toBe(201);
    expect((await call(fremd, 'GET', '/api/boards')).status).toBe(200);
    expect((await call(chef, 'GET', '/api/access')).body.pending).toEqual([]);
  });
});

describe('Personen & Zugriff lesen', () => {
  it('zeigt Mitgliedern die Liste, aber keine Verwaltungsdaten', async () => {
    const r = (await call(anna, 'GET', '/api/access')).body;
    expect(r).toMatchObject({ mode: 'everyone', isAdmin: false, pending: [], haPersons: [] });
    expect(r.people).toMatchObject([{ name: 'Anna', isAdmin: false, notifyServices: [] }]);
    expect(r.services).toEqual(['mobile_app_anna', 'mobile_app_ben']);
  });

  it('zeigt Administratoren, wer in Home Assistant noch fehlt', async () => {
    const r = (await call(chef, 'GET', '/api/access')).body;
    expect(r.isAdmin).toBe(true);
    expect(r.haPersons).toEqual([
      { name: 'Ben', userId: 'ha-ben' },
      { name: 'Gast', userId: null },
    ]);
  });

  it('kennzeichnet Personen, die in Home Assistant Administrator sind', async () => {
    haAdmins.push('ha-anna');
    const r = (await call(chef, 'GET', '/api/access')).body;
    expect(r.people[0].isAdmin).toBe(true);
  });
});

describe('Personen & Zugriff ändern', () => {
  it('nur Administratoren ändern den Modus', async () => {
    expect((await call(anna, 'PUT', '/api/access/mode', { mode: 'selected' })).status).toBe(403);
    expect(store.getAccessMode()).toBe('everyone');
    const r = await call(chef, 'PUT', '/api/access/mode', { mode: 'selected' });
    expect(r.body).toEqual({ mode: 'selected' });
    expect((await call(chef, 'PUT', '/api/access/mode', { mode: 'quatsch' })).status).toBe(400);
  });

  it('nur Administratoren fügen Personen hinzu, benennen und entfernen sie', async () => {
    expect((await call(anna, 'POST', '/api/access/people', { name: 'Ben' })).status).toBe(403);
    const ben = (await call(chef, 'POST', '/api/access/people', { haUserId: 'ha-ben', name: 'Ben' })).body;
    expect(ben).toMatchObject({ name: 'Ben', isPerson: true });

    expect((await call(anna, 'PATCH', `/api/access/people/${ben.id}`, { displayName: 'Bärchen' })).status).toBe(403);
    const renamed = await call(chef, 'PATCH', `/api/access/people/${ben.id}`, { displayName: 'Bärchen' });
    expect(renamed.body.displayName).toBe('Bärchen');

    expect((await call(anna, 'DELETE', `/api/access/people/${ben.id}`)).status).toBe(403);
    expect((await call(chef, 'DELETE', `/api/access/people/${ben.id}`)).status).toBe(204);
    expect(store.people().map((p) => p.name)).toEqual(['Anna']);
    expect((await call(chef, 'DELETE', '/api/access/people/gibt-es-nicht')).status).toBe(404);
  });

  it('jeder wählt die Push-Geräte für sich selbst, Fremde nur der Administrator', async () => {
    const annaId = store.people()[0]!.id;
    const ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });

    const own = await call(anna, 'PATCH', `/api/access/people/${annaId}`, { notifyServices: ['mobile_app_anna'] });
    expect(own.status).toBe(200);
    expect(own.body.notifyServices).toEqual(['mobile_app_anna']);

    expect((await call(anna, 'PATCH', `/api/access/people/${ben.id}`, { notifyServices: ['mobile_app_ben'] })).status).toBe(403);
    expect((await call(chef, 'PATCH', `/api/access/people/${ben.id}`, { notifyServices: ['mobile_app_ben'] })).status).toBe(200);
    expect((await call(chef, 'PATCH', `/api/access/people/${ben.id}`, { notifyServices: 'kaputt' })).status).toBe(400);
  });
});

describe('Verwaltet in der Add-on-Konfiguration', () => {
  beforeEach(() => {
    store.applyManagedPeople([{ name: 'Anna', notify: ['mobile_app_anna'] }], 'selected');
  });

  it('meldet, dass es verwaltet ist', async () => {
    expect((await call(chef, 'GET', '/api/access')).body).toMatchObject({ managed: true, mode: 'selected' });
  });

  it('Zugriff, Personen und Geräte sind in der App gesperrt (409), auch für Administratoren', async () => {
    const annaId = store.people()[0]!.id;
    const mode = await call(chef, 'PUT', '/api/access/mode', { mode: 'everyone' });
    expect(mode.status).toBe(409);
    expect(mode.body.error).toMatch(/Konfiguration/);
    expect((await call(chef, 'POST', '/api/access/people', { name: 'Ben' })).status).toBe(409);
    expect((await call(chef, 'DELETE', `/api/access/people/${annaId}`)).status).toBe(409);
    expect((await call(chef, 'PATCH', `/api/access/people/${annaId}`, { notifyServices: ['mobile_app_x'] })).status).toBe(409);
    expect(store.getAccessMode()).toBe('selected');
    expect(store.people().map((p) => [p.name, p.notifyServices])).toEqual([['Anna', ['mobile_app_anna']]]);
  });

  it('Anzeigename und Ruhezeit bleiben änderbar', async () => {
    const annaId = store.people()[0]!.id;
    expect((await call(chef, 'PATCH', `/api/access/people/${annaId}`, { displayName: 'Anni' })).status).toBe(200);
    expect((await call(anna, 'PATCH', `/api/access/people/${annaId}`, { quietOff: true })).status).toBe(200);
  });
});

describe('Einstellungen mit Wirkung auf alle', () => {
  it('das Dashboard ändert nur ein Administrator, der Panel-Pfad kommt von jedem Gerät', async () => {
    expect((await call(anna, 'PUT', '/api/settings', { dashboardPath: '/dashboard-handy' })).status).toBe(403);
    expect((await call(anna, 'PUT', '/api/settings', { panelPath: '/abc_stups' })).status).toBe(200);
    expect((await call(chef, 'PUT', '/api/settings', { dashboardPath: '/dashboard-handy' })).status).toBe(200);
    expect(store.getSettings()).toEqual({ dashboardPath: '/dashboard-handy', panelPath: '/abc_stups', defaultDueTime: '09:00', dailySummaryTime: null });
  });

  it('die Uhrzeit der Tageszusammenfassung ändert nur ein Administrator', async () => {
    expect((await call(anna, 'PUT', '/api/settings', { dailySummaryTime: '07:15' })).status).toBe(403);
    expect(store.getSettings().dailySummaryTime).toBeNull();
    expect((await call(chef, 'PUT', '/api/settings', { dailySummaryTime: '07:15' })).status).toBe(200);
    expect(store.getSettings().dailySummaryTime).toBe('07:15');
  });

  it('die Standard-Uhrzeit für Termine ändert nur ein Administrator', async () => {
    expect((await call(anna, 'PUT', '/api/settings', { defaultDueTime: '07:30' })).status).toBe(403);
    expect(store.getSettings().defaultDueTime).toBe('09:00');
    expect((await call(chef, 'PUT', '/api/settings', { defaultDueTime: '07:30' })).status).toBe(200);
    expect(store.getSettings().defaultDueTime).toBe('07:30');
  });
});

describe('Push-Übersicht', () => {
  it('nutzt die Geräte aus der Datenbank und meldet fehlende Dienste', async () => {
    const annaId = store.people()[0]!.id;
    store.setNotifyServices(annaId, ['mobile_app_anna', 'mobile_app_weg']);
    const b = store.createBoard({ name: 'B' });
    const col = store.getBoardView(b.id).columns[0]!;
    store.createCard(b.id, { columnId: col.id, title: 'Bad', dueAt: new Date(Date.now() + 3600_000).toISOString(), assigneeIds: [annaId] }, null);

    const s = (await call(anna, 'GET', '/api/notifications/status')).body;
    expect(s.people).toEqual([
      {
        name: 'Anna',
        services: [
          { service: 'mobile_app_anna', exists: true },
          { service: 'mobile_app_weg', exists: false },
        ],
      },
    ]);
    expect(s.upcoming[0]).toMatchObject({ title: 'Bad', assignees: ['Anna'], note: null });

    store.setNotifyServices(annaId, []);
    expect((await call(anna, 'GET', '/api/notifications/status')).body.upcoming[0].note).toMatch(/Push-Gerät/);
  });
});
