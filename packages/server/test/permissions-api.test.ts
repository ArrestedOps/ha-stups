import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { createAvatars } from '../src/avatars.js';
import { openDb } from '../src/db.js';
import { createEventBus } from '../src/events.js';
import type { HaState } from '../src/ha.js';
import { createHousePush } from '../src/house.js';
import { ingressAuth } from '../src/ingress.js';
import { PERMISSIONS, type Permission } from '../src/permissions.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

// Delegierbare Rechte: jede Route ohne Recht 403, mit Recht erlaubt, Kind nie, Administrator immer.
// Und: kein Mitglied ändert Berechtigungen, Administratorrechte oder die Rolle Kind (auch nicht mit allen Rechten).
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef'); // Administrator
const anna = as('ha-anna', 'Anna'); // Mitglied, bekommt je Test Rechte
const ben = as('ha-ben', 'Ben'); // Mitglied ohne jedes Recht
const kim = as('ha-kim', 'Kim'); // Kind
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const ENTITY = 'sensor.waschmaschine_leistung';
const STATES = [
  { entity_id: 'media_player.kinderzimmer', state: 'idle', attributes: { friendly_name: 'Kinderzimmer' } },
  { entity_id: 'light.flur', state: 'off', attributes: { friendly_name: 'Flur' } },
  { entity_id: 'tts.piper', state: 'unknown', attributes: { friendly_name: 'Piper' } },
] as HaState[];

let app: FastifyInstance;
let store: Store;
let ha: FakeHa;
let db: ReturnType<typeof openDb>;
let ids: { chef: string; anna: string; ben: string; kim: string };
let boardId: string;
let columnId: string;
let watcherId: string;
let channelId: string;
let cardId: string;
let templateId: string;
let feedbackId: string;
let events: number;

async function build() {
  ha = new FakeHa();
  db = openDb(':memory:');
  store = createStore(db);
  ids = {
    chef: store.addPerson({ haUserId: 'ha-chef', name: 'Chef' }).id,
    anna: store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id,
    ben: store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id,
    kim: store.addPerson({ haUserId: 'ha-kim', name: 'Kim' }).id,
  };
  store.setChild(ids.kim, { isChild: true, confirmDefault: true, confirmers: [ids.chef] }); // gewählt ist nur der Administrator: Ben und Anna dürfen ohne Recht nicht
  boardId = store.createBoard({ name: 'Haushalt', withPlanned: true }).id;
  columnId = store.getBoardView(boardId).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  cardId = store.createCard(boardId, { columnId, title: 'Zimmer aufräumen', assigneeIds: [ids.kim] }, ids.ben).id;
  store.requestConfirmation(cardId, ids.kim);
  templateId = store.saveBoardAsTemplate(boardId, 'Meine Vorlage', null).id; // gehört niemandem: löschen dürfen Administratoren (und mit Recht)
  feedbackId = store.addFeedback({ id: 'fb-1', personId: ids.ben, personName: 'Ben', kind: 'idea', message: 'Mehr Farben bitte', meta: {}, image: null, thumb: null }).id;
  ha.set(ENTITY, '120', '2026-11-04T09:00:00Z', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W' });
  const data = createWatcherData(db);
  const engine = createWatchers({ store, data, ha, now: () => new Date(), timeZone: () => 'Europe/Berlin' });
  engine.start();
  channelId = store.addHouseChannel(ids.ben, { type: 'speak', entityId: 'media_player.kinderzimmer' }).id;
  const push = createHousePush({
    store,
    drivers: { speak: async () => undefined, light: async () => undefined },
    presence: { homeOf: async () => 'home' },
    now: () => new Date('2026-11-03T12:00:00Z'),
    timeZone: () => 'Europe/Berlin',
  });
  events = 0;
  const bus = createEventBus({ changes: () => store.takeChanges() });
  bus.subscribe(() => void (events += 1));
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    bus,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [{ name: 'Neu', userId: 'ha-neu' }] },
    ha: { listDashboards: async () => [], getStates: async () => [...STATES, ...(await ha.getStates())], getHistory: (e: string, a: string, b: string) => ha.getHistory(e, a, b) },
    watchers: engine,
    watcherData: data,
    house: { push, sync: async () => undefined, entityOwners: async () => new Map() },
    avatars: createAvatars({ dir: mkdtempSync(join(tmpdir(), 'stups-perm-')), store }),
    accounts: { byUserId: () => null, remove: () => undefined } as never, // die Routen prüfen die Rolle, bevor sie die Konten anfassen
    betaGate: { enabled: true, state: () => ({}), set: () => ({}) } as never,
    exportData: () => ({ dir: '', bytes: 0, files: false, expiresAt: '' }),
  });
  watcherId = (await call(chef, 'POST', '/api/watchers', { ...watcherInput(), name: 'Waschmaschine' })).body.id;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const call = async (who: object, method: Method, url: string, payload?: object) => {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, ...(payload ? { payload } : {}) });
  return { status: res.statusCode, body: res.body && res.headers['content-type']?.toString().includes('json') ? (res.json() as any) : null };
};
const give = (who: keyof typeof ids, list: Permission[]) => store.setPermissions(ids[who], list);

beforeEach(build);

interface Route {
  name: string;
  perm: Permission;
  method: Method;
  url: () => string;
  payload?: () => object | undefined;
  ok: number;
}
const watcherInput = () => ({
  name: 'Tür',
  trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
  card: { boardId, columnId, title: 'Tür prüfen', due: { kind: 'in', minutes: 30 } },
  assign: { mode: 'fixed', personIds: [ids.anna] },
});
const ROUTES: Route[] = [
  // Wächter
  { name: 'Wächter anlegen', perm: 'watchers', method: 'POST', url: () => '/api/watchers', payload: watcherInput, ok: 201 },
  { name: 'Wächter ändern', perm: 'watchers', method: 'PATCH', url: () => `/api/watchers/${watcherId}`, payload: () => ({ active: false }), ok: 200 },
  { name: 'Wächter testen', perm: 'watchers', method: 'POST', url: () => `/api/watchers/${watcherId}/test`, ok: 200 },
  { name: 'Zähler zurücksetzen', perm: 'watchers', method: 'POST', url: () => `/api/watchers/${watcherId}/reset-counter`, ok: 200 },
  { name: 'Wächter löschen', perm: 'watchers', method: 'DELETE', url: () => `/api/watchers/${watcherId}`, ok: 204 },
  { name: 'Wächter-Vorlagen', perm: 'watchers', method: 'GET', url: () => '/api/watchers/templates', ok: 200 },
  { name: 'Wächter-Vorschläge', perm: 'watchers', method: 'GET', url: () => '/api/watchers/suggestions', ok: 200 },
  { name: 'Vorschlag ausblenden', perm: 'watchers', method: 'POST', url: () => '/api/watchers/suggestions/hide', payload: () => ({ templateId: 'washer', entityId: ENTITY }), ok: 204 },
  { name: 'Vorschlag einblenden', perm: 'watchers', method: 'POST', url: () => '/api/watchers/suggestions/unhide', payload: () => ({ templateId: 'washer', entityId: ENTITY }), ok: 204 },
  { name: 'Probelauf', perm: 'watchers', method: 'POST', url: () => '/api/watchers/dry-run', payload: () => ({ trigger: { entityId: ENTITY, kind: 'below', value: 5 } }), ok: 200 },
  { name: 'Entitäten suchen', perm: 'watchers', method: 'GET', url: () => '/api/ha/entities?q=wasch', ok: 200 },
  { name: 'Verlauf einer beliebigen Entität', perm: 'watchers', method: 'GET', url: () => '/api/watchers/history?entityId=sensor.irgendwas', ok: 200 },
  // Haus
  { name: 'Haus-Kanäle lesen', perm: 'house', method: 'GET', url: () => '/api/house/channels', ok: 200 },
  { name: 'Haus-Kanal anlegen', perm: 'house', method: 'POST', url: () => '/api/house/channels', payload: () => ({ userId: ids.ben, type: 'light', entityId: 'light.flur' }), ok: 201 },
  { name: 'Haus-Kanal ändern', perm: 'house', method: 'PATCH', url: () => `/api/house/channels/${channelId}`, payload: () => ({ enabled: false }), ok: 200 },
  { name: 'Haus-Kanal löschen', perm: 'house', method: 'DELETE', url: () => `/api/house/channels/${channelId}`, ok: 204 },
  { name: 'Haus-Kanal testen', perm: 'house', method: 'POST', url: () => `/api/house/channels/${channelId}/test`, ok: 200 },
  { name: 'Haus-Entitäten', perm: 'house', method: 'GET', url: () => '/api/house/entities', ok: 200 },
  { name: 'Haus-Einstellungen', perm: 'house', method: 'PUT', url: () => '/api/house/settings', payload: () => ({ tts: 'tts.piper' }), ok: 200 },
  // Einstellungen
  { name: 'Standard-Fälligkeitszeit', perm: 'settings', method: 'PUT', url: () => '/api/settings', payload: () => ({ defaultDueTime: '09:30' }), ok: 200 },
  { name: 'Tageszusammenfassung', perm: 'settings', method: 'PUT', url: () => '/api/settings', payload: () => ({ dailySummaryTime: '07:15' }), ok: 200 },
  { name: 'Symbole: Kandidaten', perm: 'settings', method: 'GET', url: () => '/api/icons/candidates', ok: 200 },
  { name: 'Symbole: anwenden', perm: 'settings', method: 'POST', url: () => '/api/icons/apply', payload: () => ({ items: [{ id: cardId, icon: 'dog' }] }), ok: 200 },
  { name: 'Fremde Vorlage löschen', perm: 'settings', method: 'DELETE', url: () => `/api/templates/${templateId}`, ok: 204 },
  // Personen
  { name: 'Person freigeben', perm: 'people', method: 'POST', url: () => '/api/access/people', payload: () => ({ haUserId: 'ha-neu', name: 'Neu' }), ok: 201 },
  { name: 'Namen einer Person ändern', perm: 'people', method: 'PATCH', url: () => `/api/access/people/${ids.ben}`, payload: () => ({ displayName: 'Benjamin' }), ok: 200 },
  { name: 'Foto einer Person setzen', perm: 'people', method: 'PUT', url: () => `/api/people/${ids.kim}/avatar`, ok: 200 },
  { name: 'Foto einer Person entfernen', perm: 'people', method: 'DELETE', url: () => `/api/people/${ids.kim}/avatar`, ok: 204 },
  // Rückmeldungen der Nutzer
  { name: 'Feedback lesen', perm: 'feedback', method: 'GET', url: () => '/api/feedback', ok: 200 },
  { name: 'Feedback: Zahl der neuen', perm: 'feedback', method: 'GET', url: () => '/api/feedback/summary', ok: 200 },
  { name: 'Feedback: Stand ändern', perm: 'feedback', method: 'PATCH', url: () => `/api/feedback/${feedbackId}`, payload: () => ({ status: 'gelesen' }), ok: 200 },
  { name: 'Feedback löschen', perm: 'feedback', method: 'DELETE', url: () => `/api/feedback/${feedbackId}`, ok: 204 },
  // Bestätigungen
  { name: 'Bestätigen', perm: 'confirm', method: 'POST', url: () => `/api/cards/${cardId}/confirm`, ok: 200 },
  { name: 'Nochmal', perm: 'confirm', method: 'POST', url: () => `/api/cards/${cardId}/reject`, ok: 200 },
];

const send = async (who: object, r: Route) => {
  if (r.method === 'PUT' && r.url().endsWith('/avatar')) {
    const res = await app.inject({ method: 'PUT', url: r.url(), headers: { ...(who as Record<string, string>), 'content-type': 'image/png' }, payload: PNG });
    return { status: res.statusCode };
  }
  return call(who, r.method, r.url(), r.payload?.());
};

describe('jede delegierbare Route', () => {
  it('deckt alle Berechtigungen ab (kein Recht ohne Test)', () => {
    expect([...new Set(ROUTES.map((r) => r.perm))].sort()).toEqual([...PERMISSIONS].sort());
  });

  for (const r of ROUTES) {
    describe(r.name, () => {
      it('ohne Recht: 403', async () => {
        expect((await send(ben, r)).status).toBe(403);
      });
      it('mit einem anderen Recht: 403', async () => {
        give('anna', PERMISSIONS.filter((p) => p !== r.perm));
        expect((await send(anna, r)).status).toBe(403);
      });
      it('mit dem Recht: erlaubt', async () => {
        give('anna', [r.perm]);
        expect((await send(anna, r)).status).toBe(r.ok);
      });
      it('Administrator: immer', async () => {
        expect((await send(chef, r)).status).toBe(r.ok);
      });
      it('Kind: nie, auch nicht mit Einträgen in der Datenbank', async () => {
        db.prepare('insert into user_permissions (user_id, permission) values (?, ?)').run(ids.kim, r.perm);
        expect((await send(kim, r)).status).toBe(403);
      });
    });
  }
});

describe('Wächter-Verlauf', () => {
  it('Mitglieder ohne Recht sehen nur Entitäten, die ein Wächter beobachtet (wie bisher)', async () => {
    expect((await call(ben, 'GET', `/api/watchers/history?entityId=${ENTITY}`)).status).toBe(200);
    expect((await call(ben, 'GET', '/api/watchers/history?entityId=sensor.irgendwas')).status).toBe(403);
  });
});

describe('Einstellungen: Panel- und Dashboard-Pfad bleiben bei Administratoren', () => {
  it('auch mit allen Rechten: 403 und nichts ändert sich', async () => {
    give('anna', [...PERMISSIONS]);
    const before = (await call(chef, 'GET', '/api/settings')).body;
    for (const payload of [{ panelPath: '/stups' }, { dashboardPath: '/lovelace/0' }, { panelPath: null }, { dashboardPath: null }]) {
      expect((await call(anna, 'PUT', '/api/settings', payload)).status, JSON.stringify(payload)).toBe(403);
    }
    // gemischt: ein verbotenes Feld macht die ganze Anfrage unzulässig, auch das erlaubte wird nicht übernommen
    expect((await call(anna, 'PUT', '/api/settings', { defaultDueTime: '10:00', panelPath: '/x' })).status).toBe(403);
    expect((await call(chef, 'GET', '/api/settings')).body).toEqual(before);
  });

  it('Administrator darf sie', async () => {
    expect((await call(chef, 'PUT', '/api/settings', { panelPath: '/stups' })).status).toBe(200);
  });

  it('mit dem Recht „settings" gelten die Zeiten, ungültige Werte werden abgelehnt', async () => {
    give('anna', ['settings']);
    const res = await call(anna, 'PUT', '/api/settings', { defaultDueTime: '09:30' });
    expect(res.body.defaultDueTime).toBe('09:30');
    expect((await call(anna, 'PUT', '/api/settings', { defaultDueTime: 'kaputt' })).status).toBe(400);
  });
});

describe('Personen: was auch mit dem Recht „people" Administratoren vorbehalten bleibt', () => {
  beforeEach(() => give('anna', ['people']));

  it('Rolle Kind, Sichtbarkeit, Bestätigungen: 403', async () => {
    for (const payload of [{ isChild: true }, { childScope: 'assigned' }, { confirmDefault: false }, { confirmers: [ids.anna] }]) {
      expect((await call(anna, 'PATCH', `/api/access/people/${ids.ben}`, payload)).status, JSON.stringify(payload)).toBe(403);
    }
    expect(store.userById(ids.ben)!.isChild).toBe(false);
  });

  it('Push-Geräte, ntfy-Thema, Ruhezeit anderer Personen: 403', async () => {
    for (const payload of [{ notifyServices: ['mobile_app_x'] }, { ntfyTopic: 'abc' }, { quietOff: true }, { weeklySummary: true }, { busyUntil: '2026-12-01' }]) {
      expect((await call(anna, 'PATCH', `/api/access/people/${ids.ben}`, payload)).status, JSON.stringify(payload)).toBe(403);
    }
  });

  it('Name zusammen mit etwas anderem: 403, nichts wird geändert', async () => {
    expect((await call(anna, 'PATCH', `/api/access/people/${ids.ben}`, { displayName: 'Hacker', isChild: true })).status).toBe(403);
    expect((await call(anna, 'PATCH', `/api/access/people/${ids.ben}`, { displayName: 'Hacker', notifyServices: ['x'] })).status).toBe(403);
    expect(store.userById(ids.ben)!.displayName).toBe('Ben');
  });

  it('Person entfernen und Zugriffsmodus: 403', async () => {
    expect((await call(anna, 'DELETE', `/api/access/people/${ids.ben}`)).status).toBe(403);
    expect((await call(anna, 'PUT', '/api/access/mode', { mode: 'selected' })).status).toBe(403);
    expect(store.getAccessMode()).toBe('everyone');
    expect(store.userById(ids.ben)!.isPerson).toBe(true);
  });

  it('die eigenen Push-Geräte wählt jede Person weiterhin selbst', async () => {
    expect((await call(ben, 'PATCH', `/api/access/people/${ids.ben}`, { notifyServices: ['mobile_app_ben'] })).status).toBe(200);
  });

  it('wer sich selbst umbenennen darf (Recht), tut es; ohne Recht nicht', async () => {
    expect((await call(anna, 'PATCH', `/api/access/people/${ids.anna}`, { displayName: 'Anni' })).status).toBe(200);
    expect((await call(ben, 'PATCH', `/api/access/people/${ids.ben}`, { displayName: 'Bennie' })).status).toBe(403);
  });
});

describe('Keine Rechteausweitung', () => {
  const everything = () => give('anna', [...PERMISSIONS]);

  it('auch mit allen Rechten vergibt ein Mitglied keine Berechtigungen: weder sich noch anderen', async () => {
    everything();
    for (const target of [ids.anna, ids.ben, ids.kim]) {
      expect((await call(anna, 'PATCH', `/api/access/people/${target}`, { permissions: [...PERMISSIONS] })).status).toBe(403);
      expect((await call(anna, 'PATCH', `/api/access/people/${target}`, { permissions: [] })).status).toBe(403);
    }
    expect(store.permissionsOf(ids.ben)).toEqual([]);
    expect(store.permissionsOf(ids.anna)).toEqual([...PERMISSIONS]);
  });

  it('auch ohne Recht nicht: kein Mitglied ändert die eigenen Rechte', async () => {
    expect((await call(ben, 'PATCH', `/api/access/people/${ids.ben}`, { permissions: ['watchers'] })).status).toBe(403);
    expect(store.permissionsOf(ids.ben)).toEqual([]);
  });

  it('Administratorrechte der Konten (ohne Home Assistant) und deren Zugänge: 403', async () => {
    everything();
    for (const [method, url, payload] of [
      ['GET', '/api/auth/users', undefined],
      ['POST', '/api/auth/users', { username: 'x', password: 'geheimgeheim', isAdmin: true }],
      ['PATCH', `/api/auth/users/${ids.anna}`, { isAdmin: true }],
      ['DELETE', `/api/auth/users/${ids.ben}`, undefined],
      ['PUT', '/api/beta', { push: 'all', watchers: true }],
      ['POST', '/api/admin/export', undefined],
      ['GET', '/api/admin/automation-log', undefined],
      ['POST', '/api/admin/watcher-probe', {}],
    ] as const) {
      expect((await call(anna, method, url, payload as object | undefined)).status, `${method} ${url}`).toBe(403);
    }
  });

  it('niemand wird durch ein Recht zum Administrator oder zum Kind: die Rollen bleiben, wie sie sind', async () => {
    everything();
    const me = (await call(anna, 'GET', '/api/me')).body;
    expect(me.isAdmin).toBe(false);
    expect(me.isChild).toBe(false);
    expect(me.permissions).toEqual([...PERMISSIONS]);
  });
});

describe('Berechtigungen vergeben (nur Administratoren)', () => {
  const patch = (who: object, id: string, permissions: unknown) => call(who, 'PATCH', `/api/access/people/${id}`, { permissions });

  it('ein Administrator setzt und entzieht sie', async () => {
    const res = await patch(chef, ids.anna, ['people', 'watchers']);
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual(['watchers', 'people']);
    expect(store.permissionsOf(ids.anna)).toEqual(['watchers', 'people']);
    expect((await patch(chef, ids.anna, [])).body.permissions).toEqual([]);
    expect(store.permissionsOf(ids.anna)).toEqual([]);
  });

  it('wirkt sofort: vorher 403, nachher erlaubt, nach dem Entziehen wieder 403', async () => {
    const body = watcherInput();
    expect((await call(anna, 'POST', '/api/watchers', body)).status).toBe(403);
    await patch(chef, ids.anna, ['watchers']);
    expect((await call(anna, 'POST', '/api/watchers', body)).status).toBe(201);
    await patch(chef, ids.anna, []);
    expect((await call(anna, 'POST', '/api/watchers', body)).status).toBe(403);
  });

  it('unbekannte Schlüssel, falsche Typen: 400 und nichts ändert sich', async () => {
    await patch(chef, ids.anna, ['house']);
    for (const bad of [['admin'], ['house', 'panelPath'], 'house', [1], null, { house: true }]) {
      expect((await patch(chef, ids.anna, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(store.permissionsOf(ids.anna)).toEqual(['house']);
  });

  it('Kinder bekommen keine (409), Administratoren brauchen keine (409), unbekannte Person 404', async () => {
    expect((await patch(chef, ids.kim, ['watchers'])).status).toBe(409);
    expect((await patch(chef, ids.chef, ['watchers'])).status).toBe(409);
    expect((await patch(chef, 'gibt-es-nicht', ['watchers'])).status).toBe(404);
    expect(store.permissionsOf(ids.kim)).toEqual([]);
    expect(store.permissionsOf(ids.chef)).toEqual([]);
  });

  it('wer zum Kind gemacht wird, verliert seine Rechte', async () => {
    await patch(chef, ids.anna, ['watchers', 'confirm']);
    expect((await call(chef, 'PATCH', `/api/access/people/${ids.anna}`, { isChild: true })).status).toBe(200);
    expect(store.permissionsOf(ids.anna)).toEqual([]);
    expect((await call(anna, 'GET', '/api/me')).body.permissions).toEqual([]);
  });

  it('die Änderung geht an alle Geräte (Live-Abgleich), damit sich die Oberfläche der Person anpasst', async () => {
    await new Promise((r) => setTimeout(r, 0));
    const before = events;
    await patch(chef, ids.anna, ['watchers']);
    expect(events).toBeGreaterThan(before);
  });

  it('eine Person, die aus der Liste genommen wird, verliert ihre Rechte', async () => {
    await patch(chef, ids.anna, ['watchers']);
    expect((await call(chef, 'DELETE', `/api/access/people/${ids.anna}`)).status).toBe(204);
    expect(store.permissionsOf(ids.anna)).toEqual([]);
  });
});

describe('Berechtigungen anzeigen', () => {
  it('GET /api/me: die eigenen (Mitglied nach Eintrag, Administrator alle, Kind keine)', async () => {
    give('anna', ['house', 'watchers']);
    expect((await call(anna, 'GET', '/api/me')).body.permissions).toEqual(['watchers', 'house']);
    expect((await call(ben, 'GET', '/api/me')).body.permissions).toEqual([]);
    expect((await call(chef, 'GET', '/api/me')).body.permissions).toEqual([...PERMISSIONS]);
    expect((await call(kim, 'GET', '/api/me')).body.permissions).toEqual([]);
  });

  it('GET /api/access: je Person nur für Administratoren, sonst gar nicht', async () => {
    give('anna', ['people']);
    const admin = (await call(chef, 'GET', '/api/access')).body;
    expect(Object.fromEntries(admin.people.map((p: any) => [p.name, p.permissions]))).toEqual({ Chef: [], Anna: ['people'], Ben: [], Kim: [] });
    expect(admin.permissionKeys).toEqual([...PERMISSIONS]);
    const member = (await call(anna, 'GET', '/api/access')).body;
    for (const p of member.people) expect(p.permissions).toBeUndefined();
    expect(member.permissionKeys).toBeUndefined();
    // GET /api/people (für alle) verrät sie auch nicht
    for (const p of (await call(ben, 'GET', '/api/people')).body) expect(p.permissions).toBeUndefined();
  });

  it('„Personen freigeben": wer das Recht hat, sieht Wartende und Personen aus Home Assistant, sonst nicht', async () => {
    store.resolveUser({ haId: 'ha-wartet', name: 'wartet', displayName: 'Wartet' });
    expect((await call(ben, 'GET', '/api/access')).body.pending).toEqual([]);
    give('anna', ['people']);
    const seen = (await call(anna, 'GET', '/api/access')).body;
    expect(seen.pending.map((u: any) => u.name)).toContain('wartet');
    expect(seen.haPersons.map((p: any) => p.name)).toEqual(['Neu']);
  });
});

describe('Bestätigungen für Kinder', () => {
  it('„wartet auf dich" in Zahlen und Mitteilungen gilt für Mitglieder mit dem Recht wie für gewählte Bestätiger', async () => {
    expect((await call(anna, 'GET', '/api/fairness')).body.waitingForYou).toHaveLength(0);
    give('anna', ['confirm']);
    expect((await call(anna, 'GET', '/api/fairness')).body.waitingForYou).toHaveLength(1);
    expect((await call(anna, 'GET', '/api/inbox')).body.items.some((i: any) => i.kind === 'confirm')).toBe(true);
  });

  it('wer das Kind selbst ist, bestätigt sich nie, auch nicht mit Recht', async () => {
    db.prepare('insert into user_permissions (user_id, permission) values (?, ?)').run(ids.kim, 'confirm');
    expect((await call(kim, 'POST', `/api/cards/${cardId}/confirm`)).status).toBe(403);
  });
});
