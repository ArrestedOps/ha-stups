import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { createEventBus, type EventBus } from '../src/events.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const headers = { 'x-remote-user-id': 'ha-rene', 'x-remote-user-name': 'rene', 'x-remote-user-display-name': 'René' };

let app: FastifyInstance;
let store: Store;
let bus: EventBus;
let cleared: string[];
let dashboardsFail: boolean;

beforeEach(async () => {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-10-30T10:00:00Z') });
  store.syncPeople([{ name: 'Rene', notify: ['mobile_app_rene', 'mobile_app_fehlt'] }, { name: 'Conny', notify: [] }]);
  bus = createEventBus();
  cleared = [];
  dashboardsFail = false;
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    bus,
    notifier: { clearFor: async (id: string) => void cleared.push(id) },
    ha: {
      listDashboards: async () => {
        if (dashboardsFail) throw new Error('HA nicht erreichbar');
        return [
          { title: 'Standard-Dashboard', path: '/' },
          { title: 'Handy', path: '/dashboard-handy' },
        ];
      },
      listNotifyServices: async () => ['mobile_app_rene'],
    },
    defaultDashboardPath: '/lovelace/0',
    fetchTitle: async () => null,
    resolveMapsLink: async (url: string) =>
      url.includes('maps.app.goo.gl')
        ? { url: 'https://www.google.com/maps/search/?api=1&query=Irrland+Logistics', title: 'Irrland Logistics' }
        : null,
  });
});

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

async function setup() {
  const b = (await call('POST', '/api/boards', { name: 'Haushalt', withPlanned: false })).body;
  const v = (await call('GET', `/api/boards/${b.id}`)).body;
  return { b, columns: v.columns as { id: string }[] };
}

describe('Maps-Links', () => {
  it('ersetzt einen Google-Kurzlink durch die offizielle Maps-URL und übernimmt den Ortsnamen als Titel', async () => {
    const { b, columns } = await setup();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { title: 'Date', columnId: columns[0]!.id })).body;

    const res = await call('POST', `/api/cards/${card.id}/links`, { url: 'https://maps.app.goo.gl/FxYBCpFddGXcZb8D7?g_st=ic' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      url: 'https://www.google.com/maps/search/?api=1&query=Irrland+Logistics',
      title: 'Irrland Logistics',
      kind: 'maps',
    });
  });

  it('ein selbst eingegebener Titel bleibt, normale Links bleiben unverändert', async () => {
    const { b, columns } = await setup();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { title: 'Date', columnId: columns[0]!.id })).body;

    const own = await call('POST', `/api/cards/${card.id}/links`, { url: 'https://maps.app.goo.gl/x', title: 'Unser Ziel' });
    expect(own.body.title).toBe('Unser Ziel');

    const plain = await call('POST', `/api/cards/${card.id}/links`, { url: 'https://maps.apple.com/?q=Tor' });
    expect(plain.body.url).toBe('https://maps.apple.com/?q=Tor');
  });

  it('weist ungültige Adressen weiterhin ab', async () => {
    const { b, columns } = await setup();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { title: 'Date', columnId: columns[0]!.id })).body;
    expect((await call('POST', `/api/cards/${card.id}/links`, { url: 'javascript:alert(1)' })).status).toBe(400);
  });
});

describe('Push-Übersicht', () => {
  it('zeigt Dienste je Person, wer eine Nachricht bekommt und das Sendeprotokoll', async () => {
    const { b, columns } = await setup();
    const people = (await call('GET', '/api/people')).body as { id: string; name: string }[];
    const rene = people.find((p) => p.name === 'Rene')!;
    const conny = people.find((p) => p.name === 'Conny')!;
    // Die Route rechnet mit der echten Uhr, darum ein Termin relativ zu jetzt (liegt vor dem Ende der 12 Stunden Nachholfrist)
    const due = new Date(Date.now() + 3600_000).toISOString();
    await call('POST', `/api/boards/${b.id}/cards`, { title: 'Ohne Zuständige', columnId: columns[0]!.id, dueAt: due });
    await call('POST', `/api/boards/${b.id}/cards`, { title: 'Für Rene', columnId: columns[0]!.id, dueAt: due, assigneeIds: [rene.id] });
    await call('POST', `/api/boards/${b.id}/cards`, { title: 'Für Conny', columnId: columns[0]!.id, dueAt: due, assigneeIds: [conny.id] });

    const s = (await call('GET', '/api/notifications/status')).body;

    expect(s.people).toEqual([
      { name: 'Rene', services: [{ service: 'mobile_app_rene', exists: true }, { service: 'mobile_app_fehlt', exists: false }] },
      { name: 'Conny', services: [] },
    ]);
    const note = (title: string) => s.upcoming.find((c: any) => c.title === title).note;
    expect(note('Für Rene')).toBeNull();
    expect(note('Ohne Zuständige')).toMatch(/Niemand zuständig/);
    expect(note('Für Conny')).toMatch(/Kein Push-Gerät/);
    expect(s.recent).toEqual([]);
  });
});

describe('Einstellungen und Dashboards', () => {
  it('liefert die Vorgabe aus den Optionen, bis eine Wahl gespeichert ist', async () => {
    const s = (await call('GET', '/api/settings')).body;
    expect(s).toMatchObject({ dashboardPath: null, defaultDashboardPath: '/lovelace/0', effectiveDashboardPath: '/lovelace/0' });
    const put = await call('PUT', '/api/settings', { dashboardPath: '/dashboard-handy', panelPath: '/c552c524_stups' });
    expect(put.body).toMatchObject({ effectiveDashboardPath: '/dashboard-handy', panelPath: '/c552c524_stups' });
    const reset = await call('PUT', '/api/settings', { dashboardPath: null });
    expect(reset.body.effectiveDashboardPath).toBe('/lovelace/0');
  });

  it('lehnt Pfade ab, die nicht mit / beginnen', async () => {
    expect((await call('PUT', '/api/settings', { dashboardPath: 'https://evil.example' })).status).toBe(400);
  });

  it('listet die Dashboards von Home Assistant, bei Fehlern leer', async () => {
    expect((await call('GET', '/api/dashboards')).body.map((d: any) => d.path)).toEqual(['/', '/dashboard-handy']);
    dashboardsFail = true;
    expect((await call('GET', '/api/dashboards')).body).toEqual([]);
  });
});

describe('Kommentare', () => {
  it('legt Kommentare mit Autor an, bearbeitet und löscht sie', async () => {
    const { b, columns } = await setup();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'A' })).body;
    const c = await call('POST', `/api/cards/${card.id}/comments`, { text: 'Bitte bis Freitag' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ authorName: 'Rene', text: 'Bitte bis Freitag' });
    expect((await call('PATCH', `/api/comments/${c.body.id}`, { text: 'bis Donnerstag' })).body.editedAt).not.toBeNull();
    expect((await call('GET', `/api/cards/${card.id}/comments`)).body).toHaveLength(1);
    expect((await call('DELETE', `/api/comments/${c.body.id}`)).status).toBe(204);
    expect((await call('POST', `/api/cards/${card.id}/comments`, { text: ' ' })).status).toBe(400);
  });
});

describe('Karten-Felder', () => {
  it('speichert Vorab-Erinnerung, Nachhaken und Kosten und liefert die Kostensumme', async () => {
    const { b, columns } = await setup();
    const res = await call('POST', `/api/boards/${b.id}/cards`, {
      columnId: columns[0]!.id,
      title: 'Fenster',
      dueAt: '2026-11-01T09:00:00Z',
      remindBeforeMin: 1440,
      overdueNag: true,
      costCents: 420000,
    });
    expect(res.body).toMatchObject({ remindBeforeMin: 1440, overdueNag: true, costCents: 420000 });
    const upd = await call('PATCH', `/api/cards/${res.body.id}`, { costCents: 500000, overdueNag: false });
    expect(upd.body).toMatchObject({ costCents: 500000, overdueNag: false });
    expect((await call('GET', `/api/boards/${b.id}`)).body.costTotalCents).toBe(500000);
  });
});

describe('Live-Sync und Push-Aufräumen', () => {
  it('meldet erfolgreiche Änderungen, aber keine Lesezugriffe und keine Fehler', async () => {
    const seen: number[] = [];
    bus.subscribe((e) => seen.push(e.seq));
    await call('GET', '/api/boards');
    await call('POST', '/api/boards', { name: '  ' }); // 400
    expect(seen).toEqual([]);
    await call('POST', '/api/boards', { name: 'Neu' });
    expect(seen).toEqual([1]);
  });

  it('räumt Push-Nachrichten auf, wenn eine Karte in der App erledigt wird', async () => {
    const { b, columns } = await setup();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'A' })).body;
    await call('POST', `/api/cards/${card.id}/complete`, {});
    expect(cleared).toEqual([card.id]);
    await call('POST', `/api/cards/${card.id}/complete`, {}); // zweites Mal: nichts zu tun
    expect(cleared).toEqual([card.id]);
  });

  it('räumt auch auf, wenn die Karte in die Erledigt-Spalte gezogen wird, aber nicht bei normalem Verschieben', async () => {
    const { b, columns } = await setup();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'A' })).body;
    await call('POST', `/api/cards/${card.id}/move`, { columnId: columns[1]!.id });
    expect(cleared).toEqual([]);
    await call('POST', `/api/cards/${card.id}/move`, { columnId: columns[2]!.id });
    expect(cleared).toEqual([card.id]);
  });
});
