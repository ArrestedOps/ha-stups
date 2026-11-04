import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAccounts, type Accounts } from '../src/accounts.js';
import { apiRoutes } from '../src/api.js';
import { createAccess } from '../src/access.js';
import { createLocalDirectory } from '../src/directory.js';
import { openDb } from '../src/db.js';
import { identityAuth } from '../src/identity.js';
import {
  authRoutes,
  clientGuard,
  createLoginLimiter,
  createSessionIdentity,
  createSetup,
  parseCookies,
  type Setup,
} from '../src/session-auth.js';
import { createStore, type Store } from '../src/store.js';

const PW = 'ein-langes-passwort';
const CLIENT = { 'x-stups-client': '1' };

let app: FastifyInstance;
let store: Store;
let accounts: Accounts;
let setup: Setup;
let logs: string[];
let tick: number;

async function build(opts: { secureCookie?: boolean; bootstrap?: { username: string; password: string } } = {}) {
  const db = openDb(':memory:');
  store = createStore(db);
  accounts = createAccounts(db, store);
  logs = [];
  tick = 1_000_000;
  setup = createSetup({ accounts, log: { info: (m) => logs.push(m), warn: (m) => logs.push(m) }, bootstrap: opts.bootstrap, publicUrl: 'https://stups.example.org' });
  await setup.init();
  app = Fastify();
  await app.register(clientGuard);
  await app.register(identityAuth, { identity: createSessionIdentity({ accounts }) });
  await app.register(authRoutes, { accounts, limiter: createLoginLimiter(() => tick), setup, secureCookie: opts.secureCookie ?? false });
  await app.register(apiRoutes, { store, accounts, access: createAccess({ store, directory: createLocalDirectory(accounts) }) });
  app.get('/index.html', async () => 'seite');
}

const codeFromLog = () => /Code ein: ([A-Z0-9-]+)/.exec(logs.join('\n'))![1]!;
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0]!;

async function einrichten(username = 'anna') {
  const res = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), username, password: PW } });
  return { res, cookie: res.statusCode === 201 ? cookieOf(res) : '' };
}

async function login(username: string, password: string, extra: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: '/api/auth/login', headers: CLIENT, payload: { username, password }, ...(extra.ip ? { remoteAddress: extra.ip } : {}) });
}

describe('Öffentliche Pfade und Sperre', () => {
  beforeEach(() => build());

  it('Oberfläche und /healthz brauchen keine Anmeldung', async () => {
    app.get('/healthz', async () => ({ ok: true }));
    expect((await app.inject({ url: '/index.html' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
  });

  it('die API ist ohne Sitzung gesperrt, auch mit gefälschten Ingress-Kopfzeilen', async () => {
    for (const url of ['/api/boards', '/api/me', '/api/people', '/api/auth/users']) {
      const res = await app.inject({ url, headers: { 'x-remote-user-id': 'admin', 'x-remote-user-name': 'admin' } });
      expect(res.statusCode, url).toBe(401);
    }
  });

  it('prozentcodierte Pfade umgehen die Sperre nicht (/%61pi = /api)', async () => {
    for (const url of ['/%61pi/boards', '/%61pi/me', '/a%70i/people', '/%2561pi/boards', '/api%2Fboards']) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).not.toBe(200);
      expect([401, 404], url).toContain(res.statusCode);
    }
    const post = await app.inject({ method: 'POST', url: '/%61pi/boards', headers: CLIENT, payload: { name: 'X' } });
    expect(post.statusCode).not.toBe(201);
    expect(post.statusCode).toBe(401);
    // ohne Kopfzeile des Clients gilt auch hier der Schutz
    const noHeader = await app.inject({ method: 'POST', url: '/%61pi/auth/login', payload: { username: 'a', password: 'b' } });
    expect(noHeader.statusCode).toBe(403);
    // ungültige Codierung wird nicht als öffentlich gewertet
    expect([400, 401]).toContain((await app.inject({ url: '/api/%E0%A4%A' })).statusCode);
  });

  it('Status und Fähigkeiten sind öffentlich', async () => {
    expect((await app.inject({ url: '/api/auth/status' })).json()).toEqual({ authenticated: false, setupRequired: true, user: null });
    expect((await app.inject({ url: '/api/capabilities' })).statusCode).toBe(200);
  });

  it('ändernde API-Anfragen ohne Kopfzeile des Clients werden abgelehnt', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'a', password: 'b' } });
    expect(res.statusCode).toBe(403);
    const form = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'username=a&password=b' });
    expect(form.statusCode).toBe(403);
  });
});

describe('Einrichtung', () => {
  beforeEach(() => build());

  it('der Code steht im Protokoll, ohne Code geht nichts', async () => {
    expect(logs.join()).toMatch(/Einrichtung: Öffne https:\/\/stups\.example\.org und gib diesen Code ein: [A-Z2-9]{4}-[A-Z2-9]{4}/);
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: 'AAAA-AAAA', username: 'anna', password: PW } });
    expect(res.statusCode).toBe(403);
    expect(accounts.count()).toBe(0);
    const ohne = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { username: 'anna', password: PW } });
    expect(ohne.statusCode).toBe(403);
  });

  it('mit Code entsteht der Administrator und ist gleich angemeldet', async () => {
    const { res, cookie } = await einrichten();
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ authenticated: true, setupRequired: false, user: { username: 'anna', isAdmin: true } });
    const me = await app.inject({ url: '/api/me', headers: { cookie } });
    expect(me.json()).toMatchObject({ isAdmin: true, allowed: true, user: { isPerson: true } });
  });

  it('der Code gilt kleingeschrieben und mit Leerzeichen ebenfalls', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: ` ${codeFromLog().toLowerCase()} `, username: 'anna', password: PW } });
    expect(res.statusCode).toBe(201);
  });

  it('danach ist die Einrichtung für immer zu', async () => {
    await einrichten();
    const again = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), username: 'mallory', password: PW } });
    expect(again.statusCode).toBe(409);
    expect(accounts.count()).toBe(1);
    expect((await app.inject({ url: '/api/auth/status' })).json().setupRequired).toBe(false);
  });

  it('ein schwaches Passwort wird abgewiesen, der Code bleibt gültig', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), username: 'anna', password: 'kurz' } });
    expect(res.statusCode).toBe(400);
    expect((await einrichten()).res.statusCode).toBe(201);
  });

  it('zwei gleichzeitige Einrichtungen: höchstens eine gelingt', async () => {
    const send = (username: string) =>
      app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), username, password: PW } });
    const results = await Promise.all([send('anna'), send('ben')]);
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(accounts.count()).toBe(1);
  });

  it('nach zehn falschen Codes gilt ein neuer', async () => {
    const alt = codeFromLog();
    for (let i = 0; i < 10; i += 1) {
      tick += 10 * 60_000; // die Sperre nach Fehlversuchen soll hier nicht stören
      await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: 'ZZZZ-ZZZZ', username: 'anna', password: PW }, remoteAddress: `10.0.0.${i + 1}` });
    }
    const neu = [...logs.join('\n').matchAll(/Code ein: ([A-Z0-9-]+)/g)].map((m) => m[1]);
    expect(neu).toHaveLength(2);
    expect(neu[1]).not.toBe(alt);
  });
});

describe('Einrichtung über Umgebungsvariablen', () => {
  it('STUPS_ADMIN_USER und STUPS_ADMIN_PASSWORD legen den Administrator an, ohne Code', async () => {
    await build({ bootstrap: { username: 'chef', password: PW } });
    expect(logs.join()).not.toMatch(/Code ein/);
    expect(accounts.list().map((a) => [a.username, a.isAdmin])).toEqual([['chef', true]]);
    expect((await login('chef', PW)).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/status' })).json().setupRequired).toBe(false);
  });

  it('gibt es schon Konten, wird nichts überschrieben', async () => {
    await build({ bootstrap: { username: 'chef', password: PW } });
    const again = createSetup({ accounts, log: { info: () => undefined, warn: () => undefined }, bootstrap: { username: 'zweiter', password: PW }, publicUrl: null });
    await again.init();
    expect(accounts.count()).toBe(1);
  });
});

describe('Anmelden und Abmelden', () => {
  beforeEach(async () => {
    await build();
    await einrichten();
  });

  it('richtige Daten: Cookie HttpOnly, SameSite=Lax, 30 Tage, ohne https kein Secure', async () => {
    const res = await login('anna', PW);
    expect(res.statusCode).toBe(200);
    const header = String(res.headers['set-cookie']);
    expect(header).toMatch(/^stups_session=[A-Za-z0-9_-]{40,}; /);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).toContain(`Max-Age=${30 * 86400}`);
    expect(header).not.toContain('Secure');
  });

  it('mit https-Adresse ist das Cookie Secure', async () => {
    await build({ secureCookie: true });
    await einrichten();
    expect(String((await login('anna', PW)).headers['set-cookie'])).toContain('; Secure');
  });

  it('falsches Passwort und unbekannter Name: dieselbe Meldung, kein Cookie', async () => {
    const a = await login('anna', 'falsch-falsch-falsch');
    const b = await login('niemand', PW);
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
    expect(a.headers['set-cookie']).toBeUndefined();
  });

  it('mit dem Cookie ist man drin, abmelden macht es ungültig', async () => {
    const cookie = cookieOf(await login('anna', PW));
    expect((await app.inject({ url: '/api/boards', headers: { cookie } })).statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...CLIENT, cookie } });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await app.inject({ url: '/api/boards', headers: { cookie } })).statusCode).toBe(401);
  });

  it('ein erfundenes oder fremdes Token hilft nicht', async () => {
    for (const cookie of ['stups_session=abc', 'stups_session=', 'andere=1', 'stups_session=%E0%A4%A']) {
      expect((await app.inject({ url: '/api/boards', headers: { cookie } })).statusCode, cookie).toBe(401);
    }
  });

  it('Status zeigt den angemeldeten Benutzer', async () => {
    const cookie = cookieOf(await login('anna', PW));
    expect((await app.inject({ url: '/api/auth/status', headers: { cookie } })).json()).toEqual({
      authenticated: true,
      setupRequired: false,
      user: { username: 'anna', displayName: 'anna', isAdmin: true },
    });
  });

  it('nach fünf Fehlversuchen wartet man; mit richtigem Passwort geht es währenddessen auch nicht', async () => {
    for (let i = 0; i < 5; i += 1) expect((await login('anna', 'falsch-falsch-falsch')).statusCode).toBe(401);
    const gesperrt = await login('anna', PW);
    expect(gesperrt.statusCode).toBe(429);
    expect(Number(gesperrt.headers['retry-after'])).toBe(60);
    expect(gesperrt.json().error).toMatch(/60 Sekunden/);
    tick += 61_000;
    expect((await login('anna', PW)).statusCode).toBe(200);
  });

  it('die Wartezeit wächst mit jedem weiteren Fehlversuch', async () => {
    for (let i = 0; i < 5; i += 1) await login('anna', 'falsch-falsch-falsch');
    tick += 61_000;
    await login('anna', 'falsch-falsch-falsch'); // sechster
    const res = await login('anna', PW);
    expect(Number(res.headers['retry-after'])).toBe(120);
  });

  it('die Sperre gilt je Benutzername auch von anderen Adressen', async () => {
    for (let i = 0; i < 5; i += 1) await login('anna', 'falsch-falsch-falsch', { ip: `10.1.1.${i}` });
    expect((await login('anna', PW, { ip: '10.9.9.9' })).statusCode).toBe(429);
    expect((await login('anna', PW, { ip: '10.9.9.9' })).headers['retry-after']).toBeDefined();
  });

  it('die Sperre gilt je Adresse auch für andere Namen', async () => {
    for (let i = 0; i < 5; i += 1) await login(`name${i}`, 'falsch-falsch-falsch', { ip: '10.2.2.2' });
    expect((await login('anna', PW, { ip: '10.2.2.2' })).statusCode).toBe(429);
    expect((await login('anna', PW, { ip: '10.3.3.3' })).statusCode).toBe(200);
  });

  it('ein erfolgreicher Versuch setzt den Zähler zurück', async () => {
    for (let i = 0; i < 4; i += 1) await login('anna', 'falsch-falsch-falsch');
    expect((await login('anna', PW)).statusCode).toBe(200);
    for (let i = 0; i < 4; i += 1) expect((await login('anna', 'falsch-falsch-falsch')).statusCode).toBe(401);
  });
});

describe('Benutzerverwaltung', () => {
  let admin: string;
  let member: string;
  let memberId: string;

  beforeEach(async () => {
    await build();
    admin = (await einrichten()).cookie;
    const created = await app.inject({ method: 'POST', url: '/api/auth/users', headers: { ...CLIENT, cookie: admin }, payload: { username: 'ben', displayName: 'Ben', password: PW } });
    memberId = created.json().userId;
    member = cookieOf(await login('ben', PW));
  });

  const call = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { ...CLIENT, cookie }, payload });

  it('Administrator sieht und legt an; Mitglieder dürfen das nicht', async () => {
    const list = (await call(admin, 'GET', '/api/auth/users')).json();
    expect(list.map((u: { username: string }) => u.username)).toEqual(['anna', 'ben']);
    expect(JSON.stringify(list)).not.toMatch(/hash|scrypt/);
    expect((await call(member, 'GET', '/api/auth/users')).statusCode).toBe(403);
    expect((await call(member, 'POST', '/api/auth/users', { username: 'x1', password: PW })).statusCode).toBe(403);
    expect((await call(member, 'PATCH', `/api/auth/users/${memberId}`, { isAdmin: true })).statusCode).toBe(403);
    expect((await call(member, 'DELETE', `/api/auth/users/${memberId}`)).statusCode).toBe(403);
  });

  it('ein neuer Benutzer ist eine Person und kann sich anmelden', async () => {
    const me = await app.inject({ url: '/api/me', headers: { cookie: member } });
    expect(me.json()).toMatchObject({ allowed: true, isAdmin: false, user: { displayName: 'Ben', isPerson: true } });
    const people = (await call(admin, 'GET', '/api/people')).json();
    expect(people.map((p: { displayName: string }) => p.displayName)).toEqual(['anna', 'Ben']);
  });

  it('Administratorrecht vergeben und Passwort zurücksetzen (alte Sitzungen enden)', async () => {
    expect((await call(admin, 'PATCH', `/api/auth/users/${memberId}`, { isAdmin: true })).json().isAdmin).toBe(true);
    expect((await call(member, 'GET', '/api/auth/users')).statusCode).toBe(200);
    expect((await call(admin, 'PATCH', `/api/auth/users/${memberId}`, { password: 'neues-passwort-1' })).statusCode).toBe(200);
    expect((await call(member, 'GET', '/api/boards')).statusCode).toBe(401);
    expect((await login('ben', PW)).statusCode).toBe(401);
    expect((await login('ben', 'neues-passwort-1')).statusCode).toBe(200);
  });

  it('Fehler: doppelter Name, schwaches Passwort, unbekannte Kennung', async () => {
    expect((await call(admin, 'POST', '/api/auth/users', { username: 'BEN', password: PW })).statusCode).toBe(409);
    expect((await call(admin, 'POST', '/api/auth/users', { username: 'cora', password: 'kurz' })).statusCode).toBe(400);
    expect((await call(admin, 'PATCH', '/api/auth/users/gibt-es-nicht', { isAdmin: true })).statusCode).toBe(404);
    expect((await call(admin, 'PATCH', `/api/auth/users/${memberId}`, { isAdmin: 'ja' })).statusCode).toBe(400);
  });

  it('niemand nimmt sich selbst die Rechte oder löscht sich', async () => {
    const own = accounts.list().find((a) => a.username === 'anna')!.userId;
    expect((await call(admin, 'PATCH', `/api/auth/users/${own}`, { isAdmin: false })).statusCode).toBe(409);
    expect((await call(admin, 'DELETE', `/api/auth/users/${own}`)).statusCode).toBe(409);
    expect((await call(admin, 'DELETE', `/api/access/people/${own}`)).statusCode).toBe(409);
  });

  it('Löschen beendet die Anmeldung sofort', async () => {
    expect((await call(admin, 'DELETE', `/api/auth/users/${memberId}`)).statusCode).toBe(204);
    expect((await call(member, 'GET', '/api/boards')).statusCode).toBe(401);
    expect((await login('ben', PW)).statusCode).toBe(401);
  });

  it('eine Person aus „Personen & Zugriff" zu entfernen nimmt auch ihr Konto', async () => {
    expect((await call(admin, 'DELETE', `/api/access/people/${memberId}`)).statusCode).toBe(204);
    expect((await login('ben', PW)).statusCode).toBe(401);
    expect(accounts.byUserId(memberId)).toBeNull();
  });

  it('eine Person ohne Konto bekommt eins', async () => {
    const mia = (await call(admin, 'POST', '/api/access/people', { name: 'Mia' })).json();
    const res = await call(admin, 'POST', '/api/auth/users', { userId: mia.id, username: 'mia', password: PW });
    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toBe(mia.id);
    expect((await login('mia', PW)).statusCode).toBe(200);
  });

  it('Passwort ändern: nur mit dem aktuellen, andere Geräte melden sich ab', async () => {
    const zweites = cookieOf(await login('ben', PW));
    expect((await call(member, 'POST', '/api/auth/password', { current: 'falsch-falsch', next: 'neues-passwort-1' })).statusCode).toBe(403);
    expect((await call(member, 'POST', '/api/auth/password', { current: PW, next: 'kurz' })).statusCode).toBe(400);
    expect((await call(member, 'POST', '/api/auth/password', { current: PW, next: 'neues-passwort-1' })).statusCode).toBe(204);
    expect((await call(member, 'GET', '/api/boards')).statusCode).toBe(200);
    expect((await call(zweites, 'GET', '/api/boards')).statusCode).toBe(401);
  });
});

describe('parseCookies', () => {
  it('liest mehrere Cookies, nimmt bei Doppelten den ersten und ignoriert Kaputtes', () => {
    expect(parseCookies('a=1; stups_session=tok%2Fen; b=2; a=9')).toEqual({ a: '1', stups_session: 'tok/en', b: '2' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('ohnewert; =leer')).toEqual({});
  });
});
