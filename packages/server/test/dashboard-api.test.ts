import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { checkDashboardPath, isDashboardPath } from '../src/dashboard-path.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string) => ({ 'x-remote-user-id': `ha-${id}`, 'x-remote-user-name': id, 'x-remote-user-display-name': id });
let app: FastifyInstance;
let store: Store;
let ha: { listDashboards: () => Promise<{ title: string; path: string }[]> } | undefined;

async function build(opts: { ha?: typeof ha; timeout?: number; addon?: string } = {}) {
  ha = opts.ha;
  store = createStore(openDb(':memory:'));
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
  const kim = store.addPerson({ haUserId: 'ha-kim', name: 'Kim' }).id;
  store.setChild(kim, { isChild: true });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, directory: { isAdmin: async (id: string) => id === 'ha-anna', persons: async () => [] }, ha: ha as never, defaultDashboardPath: opts.addon ?? '/lovelace/0', dashboardsTimeoutMs: opts.timeout });
}
const put = (who: string, payload: unknown) => app.inject({ method: 'PUT', url: '/api/me/dashboard', headers: as(who), payload: payload as object });
const me = async (who: string) => (await app.inject({ method: 'GET', url: '/api/me', headers: as(who) })).json().user;

describe('Pfad prüfen (reine Funktion)', () => {
  it.each([
    ['/', true],
    ['/lovelace', true],
    ['/lovelace/0', true],
    ['/dashboard-handy/start?x=1', true],
    ['/' + 'a'.repeat(199), true],
    ['/' + 'a'.repeat(200), false],
    ['', false],
    ['lovelace', false],
    ['//evil.example', false],
    ['/a//b', true], // „//" mitten im Pfad ist kein Schema; nur am Anfang ist es eine fremde Adresse
    ['https://evil.example', false],
    ['/redirect?to=https://evil.example', false],
    ['/a\\b', false],
    ['/a b', false],
    ['/a\nb', false],
    [null, false],
    [5, false],
    [{}, false],
  ])('%j → %s', (value, ok) => {
    expect(isDashboardPath(value)).toBe(ok);
  });
  it('null heißt Standard, Falsches wirft', () => {
    expect(checkDashboardPath(null)).toBeNull();
    expect(() => checkDashboardPath('x')).toThrow();
  });
});

describe('PUT /api/me/dashboard', () => {
  beforeEach(() => build());

  it('speichert pro Person, kommt mit /api/me zurück, null setzt auf Standard', async () => {
    expect((await me('anna')).dashboardPath).toBeNull();
    expect((await put('anna', { path: '/dashboard-handy' })).statusCode).toBe(204);
    expect((await me('anna')).dashboardPath).toBe('/dashboard-handy');
    expect((await me('ben')).dashboardPath).toBeNull(); // jede Person für sich
    expect((await put('anna', { path: null })).statusCode).toBe(204);
    expect((await me('anna')).dashboardPath).toBeNull();
  });

  it('Falsches: 400, nie 500, und der alte Wert bleibt', async () => {
    await put('anna', { path: '/lovelace' });
    for (const bad of [{ path: 'https://x.de' }, { path: '//x.de' }, { path: 'x' }, { path: '/a\\b' }, { path: '/' + 'a'.repeat(250) }, { path: 5 }, { path: '' }, {}, { path: ['/a'] }]) {
      const res = await put('anna', bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await app.inject({ method: 'PUT', url: '/api/me/dashboard', headers: as('anna'), payload: '[1]' as never })).statusCode).toBeLessThan(500);
    expect((await me('anna')).dashboardPath).toBe('/lovelace');
  });

  it('ein Kind darf es nicht', async () => {
    expect((await put('kim', { path: '/lovelace' })).statusCode).toBe(403);
    expect((await me('kim')).dashboardPath).toBeNull();
  });
});

describe('GET /api/ha/dashboards', () => {
  const get = (who = 'anna') => app.inject({ method: 'GET', url: '/api/ha/dashboards', headers: as(who) });

  it('Standard, Übersicht und die eigenen Dashboards; nicht Erreichbares und Doppeltes fällt weg', async () => {
    await build({
      ha: {
        listDashboards: async () => [
          { title: 'Standard-Dashboard', path: '/' },
          { title: 'Handy', path: '/dashboard-handy' },
          { title: '', path: '/ea-trading' },
          { title: 'Doppelt', path: '/dashboard-handy' },
          { title: 'Übersicht nochmal', path: '/lovelace' },
          { title: 'Fremd', path: 'https://evil.example' },
          { title: 'Verschachtelt', path: '/a/b' },
          { title: 'Leer', path: '' },
        ],
      },
    });
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        { path: '/', title: 'Standard von Home Assistant' },
        { path: '/lovelace', title: 'Übersicht' },
        { path: '/dashboard-handy', title: 'Handy' },
        { path: '/ea-trading', title: 'ea-trading' },
      ],
      addonPath: '/lovelace/0',
      connected: true,
    });
  });

  it('englisch beschriftet, wenn die Anfrage Englisch will', async () => {
    await build({ ha: { listDashboards: async () => [] } });
    const res = await app.inject({ method: 'GET', url: '/api/ha/dashboards', headers: { ...as('anna'), 'accept-language': 'en' } });
    expect(res.json().items.map((i: { title: string }) => i.title)).toEqual(['Home Assistant default', 'Overview']);
  });

  it('Fehler: nur Standard und die Option der App, kein 500', async () => {
    await build({ ha: { listDashboards: async () => Promise.reject(new Error('weg')) } });
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        { path: '/', title: 'Standard von Home Assistant' },
        { path: '/lovelace/0', title: 'Option der App: /lovelace/0' },
      ],
      addonPath: '/lovelace/0',
      connected: false,
    });
  });

  it('Zeitlimit: eine hängende Verbindung antwortet trotzdem', async () => {
    await build({ ha: { listDashboards: () => new Promise(() => undefined) }, timeout: 40 });
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json().connected).toBe(false);
  });

  it('ohne Home Assistant (Docker): nur Standard; ist die Option „/", gibt es nur einen Eintrag', async () => {
    await build({ addon: '/' });
    expect((await get()).json()).toEqual({ items: [{ path: '/', title: 'Standard von Home Assistant' }], addonPath: '/', connected: false });
  });

  it('ein Kind darf die Liste nicht abfragen', async () => {
    await build({ ha: { listDashboards: async () => [] } });
    expect((await get('kim')).statusCode).toBe(403);
  });
});
