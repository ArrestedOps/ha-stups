import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import type { HaState } from '../src/ha.js';
import { createHousePush } from '../src/house.js';
import { HouseFailure } from '../src/house-drivers.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const admin = as('ha-admin', 'Admin');
const member = as('ha-ben', 'Ben');

const STATES = [
  { entity_id: 'media_player.kinderzimmer', state: 'idle', attributes: { friendly_name: 'Kinderzimmer' } },
  { entity_id: 'media_player.buero', state: 'off', attributes: { friendly_name: 'Büro' } },
  { entity_id: 'light.flur', state: 'off', attributes: { friendly_name: 'Flur' } },
  { entity_id: 'tts.piper', state: 'unknown', attributes: { friendly_name: 'Piper' } },
  { entity_id: 'person.ben', state: 'home', attributes: { friendly_name: 'Ben', user_id: 'ha-ben' } },
  { entity_id: 'sensor.egal', state: '1', attributes: {} },
] as HaState[];

let app: FastifyInstance;
let store: Store;
let benId: string;
let spoken: string[];
let synced: number;
let haDown: boolean;
let failing: HouseFailure | null;

const withHouse = async (houseOn = true) => {
  store = createStore(openDb(':memory:'));
  benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  store.addPerson({ haUserId: 'ha-admin', name: 'Admin' });
  spoken = [];
  synced = 0;
  haDown = false;
  failing = null;
  const push = createHousePush({
    store,
    drivers: {
      speak: async (_c, text) => {
        if (failing) throw failing;
        spoken.push(text);
      },
      light: async () => {
        if (failing) throw failing;
      },
    },
    presence: { homeOf: async () => 'home' },
    now: () => new Date('2026-11-03T12:00:00Z'),
    timeZone: () => 'Europe/Berlin',
  });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id) => id === 'ha-admin', persons: async () => [] },
    ha: {
      listDashboards: async () => [],
      getStates: async () => {
        if (haDown) throw new Error('offline');
        return STATES;
      },
    },
    ...(houseOn
      ? {
          house: {
            push,
            sync: async () => void (synced += 1),
            entityOwners: async () => new Map([['person.ben', benId]]),
          },
        }
      : {}),
  });
};

const call = (who: object, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: who as Record<string, string>, ...(payload ? { payload } : {}) });

describe('Haus-Kanäle: Zugriff', () => {
  beforeEach(async () => withHouse());

  it('nur Administratoren', async () => {
    for (const [method, url] of [
      ['GET', '/api/house/channels'],
      ['POST', '/api/house/channels'],
      ['PATCH', '/api/house/channels/x'],
      ['DELETE', '/api/house/channels/x'],
      ['POST', '/api/house/channels/x/test'],
      ['GET', '/api/house/entities'],
      ['PUT', '/api/house/settings'],
    ] as const) {
      expect((await call(member, method, url, method === 'GET' || method === 'DELETE' ? undefined : {})).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('ohne Home Assistant (kein house) gibt es die Routen nicht nutzbar: 404', async () => {
    await withHouse(false);
    expect((await call(admin, 'GET', '/api/house/channels')).statusCode).toBe(404);
    expect((await call(admin, 'GET', '/api/house/entities')).statusCode).toBe(404);
  });
});

describe('Haus-Kanäle: anlegen, lesen, ändern, löschen', () => {
  beforeEach(async () => withHouse());

  const create = async (over: Record<string, unknown> = {}) =>
    call(admin, 'POST', '/api/house/channels', { userId: benId, type: 'speak', entityId: 'media_player.kinderzimmer', ...over });

  it('legt einen Kanal an (Vorgaben), listet ihn mit Ergebnis und Sprachdienst, gleicht das Abonnement ab', async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    const channel = res.json();
    expect(channel).toMatchObject({ userId: benId, type: 'speak', entityId: 'media_player.kinderzimmer', kinds: ['nudge'], whenAway: 'skip', waitMinutes: 120, enabled: true });
    expect(synced).toBe(1);

    const list = (await call(admin, 'GET', '/api/house/channels')).json();
    expect(list.channels).toEqual([{ ...channel, status: null }]);
    expect(list.tts).toBeNull();
    expect(list.unmatched).toEqual([]); // Ben hat eine Person in Home Assistant
  });

  it('weist Personen ohne passende Person in Home Assistant aus (Hinweis in der Oberfläche)', async () => {
    const anna = store.addPerson({ haUserId: null, name: 'Anna' }).id;
    await call(admin, 'POST', '/api/house/channels', { userId: anna, type: 'light', entityId: 'light.flur' });
    const list = (await call(admin, 'GET', '/api/house/channels')).json();
    expect(list.unmatched).toEqual([anna]);
  });

  it('ändert Angaben und löscht', async () => {
    const id = (await create()).json().id as string;
    const res = await call(admin, 'PATCH', `/api/house/channels/${id}`, { kinds: ['nudge', 'due'], whenAway: 'wait', waitMinutes: 30, volume: 50, enabled: false, name: 'Zimmer' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ kinds: ['nudge', 'due'], whenAway: 'wait', waitMinutes: 30, volume: 50, enabled: false, name: 'Zimmer' });
    expect((await call(admin, 'DELETE', `/api/house/channels/${id}`)).statusCode).toBe(204);
    expect((await call(admin, 'DELETE', `/api/house/channels/${id}`)).statusCode).toBe(404);
    expect(synced).toBe(3);
  });

  it('prüft: Typ, Format, Domäne, vorhanden in Home Assistant, Person', async () => {
    expect((await create({ type: 'tablet' })).statusCode).toBe(400);
    expect((await create({ entityId: 'kein gueltiger name' })).statusCode).toBe(400);
    expect((await create({ entityId: 'light.flur' })).statusCode).toBe(400); // Lampe als Ansage
    const missing = await create({ entityId: 'media_player.gibt_es_nicht' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatch(/gibt es in Home Assistant nicht/);
    expect((await create({ userId: 'gibt-es-nicht' })).statusCode).toBe(404);
    expect((await create({ kinds: ['zeitung'] })).statusCode).toBe(400);
    expect(store.houseChannels()).toEqual([]);
    expect(synced).toBe(0);
  });

  it('ist Home Assistant nicht erreichbar, lässt sich nichts anlegen (409), aber Löschen geht', async () => {
    const id = (await create()).json().id as string;
    haDown = true;
    expect((await create()).statusCode).toBe(409);
    expect((await call(admin, 'PATCH', `/api/house/channels/${id}`, { entityId: 'media_player.buero' })).statusCode).toBe(409);
    expect((await call(admin, 'PATCH', `/api/house/channels/${id}`, { enabled: false })).statusCode).toBe(200); // ohne neue Entität nicht nötig
    expect((await call(admin, 'DELETE', `/api/house/channels/${id}`)).statusCode).toBe(204);
  });

  it('eine geänderte Entität wird ebenfalls geprüft', async () => {
    const id = (await create()).json().id as string;
    expect((await call(admin, 'PATCH', `/api/house/channels/${id}`, { entityId: 'media_player.buero' })).statusCode).toBe(200);
    expect((await call(admin, 'PATCH', `/api/house/channels/${id}`, { entityId: 'media_player.nein' })).statusCode).toBe(400);
  });
});

describe('Push-Übersicht', () => {
  beforeEach(async () => withHouse());

  it('zeigt die Kanäle mit dem letzten Ergebnis, ohne Home Assistant null', async () => {
    store.setHouseTts('tts.piper');
    const id = (await call(admin, 'POST', '/api/house/channels', { userId: benId, type: 'speak', entityId: 'media_player.kinderzimmer', name: 'Kinderzimmer' })).json().id as string;
    await call(admin, 'POST', `/api/house/channels/${id}/test`);
    const status = (await call(admin, 'GET', '/api/notifications/status')).json();
    expect(status.house).toEqual([expect.objectContaining({ person: 'Ben', name: 'Kinderzimmer', type: 'speak', enabled: true, kinds: ['nudge'], status: expect.objectContaining({ result: 'delivered' }) })]);

    await withHouse(false);
    expect((await call(admin, 'GET', '/api/notifications/status')).json().house).toBeNull();
  });
});

describe('Entitäten und Sprachdienst', () => {
  beforeEach(async () => withHouse());

  it('bietet Lautsprecher, Lampen und Sprachdienste zur Auswahl, nach Namen sortiert, sonst nichts', async () => {
    const res = (await call(admin, 'GET', '/api/house/entities')).json();
    expect(res).toEqual({
      speakers: [
        { entityId: 'media_player.buero', name: 'Büro' },
        { entityId: 'media_player.kinderzimmer', name: 'Kinderzimmer' },
      ],
      lights: [{ entityId: 'light.flur', name: 'Flur' }],
      tts: [{ entityId: 'tts.piper', name: 'Piper' }],
    });
  });

  it('wählt den Sprachdienst, prüft ihn und kann ihn abwählen', async () => {
    expect((await call(admin, 'PUT', '/api/house/settings', { tts: 'tts.piper' })).json()).toEqual({ tts: 'tts.piper' });
    expect(store.getHouseTts()).toBe('tts.piper');
    expect((await call(admin, 'GET', '/api/house/channels')).json().tts).toBe('tts.piper');
    expect((await call(admin, 'PUT', '/api/house/settings', { tts: 'tts.gibt_es_nicht' })).statusCode).toBe(400);
    expect((await call(admin, 'PUT', '/api/house/settings', { tts: 'media_player.buero' })).statusCode).toBe(400);
    expect((await call(admin, 'PUT', '/api/house/settings', { tts: null })).json()).toEqual({ tts: null });
    expect(store.getHouseTts()).toBeNull();
  });
});

describe('Test-Knopf', () => {
  beforeEach(async () => withHouse());

  const channel = async () => (await call(admin, 'POST', '/api/house/channels', { userId: benId, type: 'speak', entityId: 'media_player.kinderzimmer' })).json().id as string;

  it('spricht den Testsatz und meldet „delivered"', async () => {
    store.setHouseTts('tts.piper');
    const id = await channel();
    const res = await call(admin, 'POST', `/api/house/channels/${id}/test`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: 'delivered' });
    expect(spoken).toEqual(['Das ist ein Test von Stups.']);
    // und das Ergebnis steht danach in der Liste
    const list = (await call(admin, 'GET', '/api/house/channels')).json();
    expect(list.channels[0].status).toMatchObject({ result: 'delivered' });
  });

  it('Fehler kommen mit Kennung und verständlichem Text in der Sprache der Anfrage', async () => {
    const id = await channel();
    failing = new HouseFailure('no_tts');
    const de = (await call(admin, 'POST', `/api/house/channels/${id}/test`)).json();
    expect(de).toMatchObject({ result: 'error', error: { code: 'no_tts' } });
    expect(de.error.message).toMatch(/Sprachdienst/);

    failing = new HouseFailure('ha_error', 'tts.speak: kaputt');
    const en = (await call({ ...admin, 'x-stups-language': 'en' }, 'POST', `/api/house/channels/${id}/test`)).json();
    expect(en).toMatchObject({ result: 'error', error: { code: 'ha_error' } });
    expect(en.error.message).toMatch(/rejected|kaputt/);
    expect(en.error.message).toContain('tts.speak: kaputt');
  });

  it('unbekannter Kanal: 404', async () => {
    expect((await call(admin, 'POST', '/api/house/channels/gibt-es-nicht/test')).statusCode).toBe(404);
  });
});
