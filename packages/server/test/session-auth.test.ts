import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAccounts, type Accounts } from '../src/accounts.js';
import { apiRoutes } from '../src/api.js';
import { createAccess } from '../src/access.js';
import { createLocalDirectory } from '../src/directory.js';
import { openDb } from '../src/db.js';
import { identityAuth } from '../src/identity.js';
import type { Passkeys } from '../src/passkeys.js';
import {
  authRoutes,
  clientGuard,
  createLoginLimiter,
  createSessionIdentity,
  createSetup,
  parseCookies,
  sessionToken,
  type LoginLimiter,
  type Setup,
} from '../src/session-auth.js';
import { createStore, type Store } from '../src/store.js';

const PW = 'ein-langes-passwort';
const CLIENT = { 'x-stups-client': '1' };

let app: FastifyInstance;
let store: Store;
let accounts: Accounts;
let setup: Setup;
let limiter: LoginLimiter;
let logs: string[];
let tick: number;
let slept: number[];
let sleepAdvancesClock = true;

async function build(
  opts: {
    secureCookie?: boolean;
    bootstrap?: { username: string; password: string };
    passkeys?: Passkeys;
    realSleep?: boolean;
    routeAccounts?: (real: Accounts) => Accounts;
    logStream?: { write: (line: string) => void };
  } = {},
) {
  const db = openDb(':memory:');
  store = createStore(db);
  accounts = createAccounts(db, store);
  logs = [];
  tick = 1_000_000;
  slept = [];
  setup = createSetup({ accounts, log: { info: (m) => logs.push(m), warn: (m) => logs.push(m) }, bootstrap: opts.bootstrap, publicUrl: 'https://stups.example.org' });
  await setup.init();
  app = opts.logStream ? Fastify({ logger: { level: 'error', stream: opts.logStream } }) : Fastify();
  await app.register(clientGuard);
  await app.register(identityAuth, { identity: createSessionIdentity({ accounts }) });
  limiter = createLoginLimiter(() => tick);
  await app.register(authRoutes, {
    accounts: opts.routeAccounts ? opts.routeAccounts(accounts) : accounts,
    limiter,
    setup,
    secureCookie: opts.secureCookie ?? false,
    passkeys: opts.passkeys,
    sleep: opts.realSleep ? undefined : async (ms) => { slept.push(ms); if (sleepAdvancesClock) tick += ms; },
  });
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
    expect(codeFromLog()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
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
    expect(again.json()).toEqual({ error: 'Stups ist schon eingerichtet' });
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

  it('S8: ein Konto wird nicht gesperrt, nur verzögert: der Besitzer kommt mit dem richtigen Passwort auch während eines Angriffs hinein', async () => {
    for (let i = 0; i < 12; i += 1) expect((await login('anna', 'falsch-falsch-falsch', { ip: `10.1.1.${i}` })).statusCode).toBe(401);
    // Zehn Fehlversuche von zehn Adressen sperren das Konto nicht von der eigenen Adresse aus: sie warten nur
    const ok = await login('anna', PW, { ip: '10.9.9.9' });
    expect(ok.statusCode).toBe(200);
    expect(slept.length).toBeGreaterThan(0);
    expect(slept.every((ms) => ms <= 8000)).toBe(true); // Obergrenze je Versuch
  });

  it('S8: die Verzögerung je Konto wächst, hat eine Obergrenze, und viele gleichzeitige Versuche stauen sich auf statt zu überholen', async () => {
    for (let i = 0; i < 5; i += 1) await login('anna', 'falsch-falsch-falsch', { ip: `10.4.4.${i}` });
    expect(slept).toEqual([]); // die ersten fünf sind frei
    const delays: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      slept.length = 0;
      await login('anna', 'falsch-falsch-falsch', { ip: `10.5.5.${i}` });
      delays.push(slept[0] ?? 0);
    }
    expect(delays[1]!).toBeGreaterThan(0);
    expect(delays.every((d) => d <= 8000)).toBe(true);
    // Wer weiter schickt, ohne zu warten, bekommt eine Wartezeit statt einer Antwort (Staugrenze), das Konto bleibt aber nutzbar
    sleepAdvancesClock = false; // die Wartenden bleiben wirklich gleichzeitig im Stau
    const flood = await Promise.all(Array.from({ length: 30 }, (_, i) => login('anna', 'falsch-falsch-falsch', { ip: `10.6.6.${i}` })));
    sleepAdvancesClock = true;
    expect(flood.filter((r) => r.statusCode === 429).length).toBeGreaterThan(0);
    tick += 60_000; // nach einer Weile ist alles abgebaut
    expect((await login('anna', PW, { ip: '10.7.7.7' })).statusCode).toBe(200);
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

describe('Pfade, Cookie-Lesen und Sitzungs-Identität', () => {
  beforeEach(() => build());

  it('die API ohne Sitzung antwortet mit der Meldung „Bitte anmelden"', async () => {
    const res = await app.inject({ url: '/api/boards' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Bitte anmelden' });
  });

  it('Abmelden ist auch ohne Sitzung erreichbar und löscht das Cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: CLIENT });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toBe('stups_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  });

  it('das Cookie endet ohne https genau bei Max-Age', async () => {
    await einrichten();
    expect(String((await login('anna', PW)).headers['set-cookie'])).toMatch(/; Max-Age=\d+$/);
  });

  it('HEAD und OPTIONS brauchen die Kopfzeile des Clients nicht, andere ändernde Methoden schon', async () => {
    expect((await app.inject({ method: 'HEAD', url: '/api/auth/status' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'OPTIONS', url: '/api/auth/status' })).statusCode).not.toBe(403);
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/api/auth/status' });
      expect(res.statusCode, method).toBe(403);
    }
  });

  it('ohne Kopfzeile abgelehnt: die Antwort nennt den Grund', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'a', password: 'b' } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Anfrage abgelehnt' });
  });

  it('ändernde Anfragen außerhalb der API brauchen die Kopfzeile nicht', async () => {
    app.post('/formular', async () => 'angekommen');
    const res = await app.inject({ method: 'POST', url: '/formular' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('angekommen');
  });

  it('ein ungültig codierter Pfad zählt für ändernde Anfragen als API-Pfad', async () => {
    const res = await app.inject({ method: 'POST', url: '/%25E0%25A4%25A' });
    expect(res.statusCode).toBe(403);
  });

  it('parseCookies schneidet Leerraum um den Wert ab', () => {
    expect(parseCookies('a=1; b= 2 ;c=\t3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('sessionToken: mehrere Cookie-Zeilen werden zusammengelesen, fehlend oder kaputt ergibt leer', () => {
    expect(sessionToken({ cookie: ['a=1', 'stups_session=tok'] })).toBe('tok');
    expect(sessionToken({ cookie: 'a=1; stups_session=tok' })).toBe('tok');
    expect(sessionToken({})).toBe('');
    expect(sessionToken({ cookie: 'a=1' })).toBe('');
    expect(sessionToken({ cookie: 'stups_session=%E0%A4%A' })).toBe('');
  });

  it('die Sitzungs-Identität liefert Kennung, Namen und einen leeren Ingress-Pfad', async () => {
    await einrichten();
    const cookie = cookieOf(await login('anna', PW));
    const account = accounts.list()[0]!;
    const identity = createSessionIdentity({ accounts });
    expect(await identity.authenticate({ ip: '1.2.3.4', url: '/api/boards', headers: { cookie } })).toEqual({
      ok: true,
      principal: { id: account.externalId, name: 'anna', displayName: 'anna', ingressPath: '' },
    });
    expect(await identity.authenticate({ ip: '1.2.3.4', url: '/api/boards', headers: {} })).toEqual({ ok: false, status: 401, error: 'Bitte anmelden' });
  });
});

describe('Einrichtungscode (Einheit)', () => {
  beforeEach(() => build());

  it('ohne Adresse nennt das Protokoll die „Adresse von Stups"', async () => {
    const lines: string[] = [];
    const s = createSetup({ accounts, log: { info: (m) => lines.push(m), warn: (m) => lines.push(m) }, publicUrl: null });
    await s.init();
    expect(lines).toHaveLength(1);
    // Nur „Adresse von Stups“ prüfen: Der Artikel davor ist falsch („Öffne der …“) und soll nicht festgeschrieben werden
    expect(lines[0]).toMatch(/^Einrichtung: Öffne \S+ Adresse von Stups und gib diesen Code ein: [A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('der Administrator aus den Umgebungsvariablen steht im Protokoll', async () => {
    await build({ bootstrap: { username: 'chef', password: PW } });
    expect(logs).toEqual(['Administrator „chef" aus STUPS_ADMIN_USER eingerichtet']);
  });

  it('ohne Code, nach done() und bei falscher Länge oder Art: false, ohne Fehler', async () => {
    const noLog = { info: () => undefined, warn: () => undefined };
    expect(createSetup({ accounts, log: noLog, publicUrl: null }).check('ABCD-EFGH')).toBe(false); // vor init gibt es keinen Code
    const lines: string[] = [];
    const s = createSetup({ accounts, log: { info: () => undefined, warn: (m) => lines.push(m) }, publicUrl: null });
    await s.init();
    const code = /Code ein: (\S+)/.exec(lines[0]!)![1]!;
    expect(s.check('X')).toBe(false);
    expect(s.check(`${code}X`)).toBe(false);
    expect(s.check(42)).toBe(false);
    expect(s.check(` ${code.toLowerCase()} `)).toBe(true);
    s.done();
    expect(s.check(code)).toBe(false);
  });

  it('nach erfolgreicher Einrichtung gilt der Code nicht mehr und frühere Fehlversuche der Adresse sind gelöscht', async () => {
    const code = codeFromLog();
    for (let i = 0; i < 4; i += 1) {
      await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: 'ZZZZ-ZZZZ', username: 'anna', password: PW } });
    }
    expect((await einrichten()).res.statusCode).toBe(201);
    expect(setup.check(code)).toBe(false);
    limiter.fail(['setup:127.0.0.1']);
    expect(limiter.wait(['setup:127.0.0.1'])).toBe(0);
  });
});

describe('Einrichtung: Sperre und Fehler', () => {
  beforeEach(() => build());

  const wrongCode = (ip: string) =>
    app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: 'ZZZZ-ZZZZ', username: 'anna', password: PW }, remoteAddress: ip });

  it('ein falscher Code wird mit Meldung abgewiesen', async () => {
    const res = await wrongCode('10.0.0.1');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Der Einrichtungscode stimmt nicht (er steht im Protokoll des Containers)' });
  });

  it('nach fünf falschen Codes von einer Adresse wartet diese, andere nicht', async () => {
    for (let i = 0; i < 5; i += 1) expect((await wrongCode('10.0.0.1')).statusCode).toBe(403);
    const gesperrt = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), username: 'anna', password: PW }, remoteAddress: '10.0.0.1' });
    expect(gesperrt.statusCode).toBe(429);
    expect(gesperrt.headers['retry-after']).toBe('60');
    expect(gesperrt.json()).toEqual({ error: 'Zu viele Versuche. Bitte in 60 Sekunden noch einmal.', retryAfter: 60 });
    expect(accounts.count()).toBe(0);
    const andere = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), username: 'anna', password: PW }, remoteAddress: '10.0.0.2' });
    expect(andere.statusCode).toBe(201);
  });

  it('ein ungültiger Benutzername oder ein kurzes Passwort lässt den Code gültig und die Einrichtung offen', async () => {
    for (const payload of [
      { username: '!', password: PW },
      { username: 'anna', password: 'kurz' },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), ...payload } });
      expect(res.statusCode).toBe(400);
    }
    expect(accounts.count()).toBe(0);
    expect((await einrichten()).res.statusCode).toBe(201);
  });
});

describe('Einrichtung: Fehler beim Anlegen', () => {
  it('scheitert das Anlegen, bleibt die Einrichtung möglich und der Fehler wird nicht verraten', async () => {
    const lines: string[] = [];
    let calls = 0;
    await build({
      logStream: { write: (l) => lines.push(l) },
      routeAccounts: (real) => ({
        ...real,
        create: async (input) => {
          calls += 1;
          if (calls === 1) throw new Error('Datenbank kaputt');
          return real.create(input);
        },
      }),
    });
    const code = codeFromLog();
    const first = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code, username: 'anna', password: PW } });
    expect(first.statusCode).toBe(500);
    expect(first.json()).toEqual({ error: 'Interner Fehler' });
    expect(lines.join('')).toContain('Datenbank kaputt');
    const second = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code, username: 'anna', password: PW } });
    expect(second.statusCode).toBe(201);
    expect(accounts.count()).toBe(1);
  });
});

describe('Fehlerbehandlung der Anmelderoute', () => {
  const post = (payload: string) =>
    app.inject({ method: 'POST', url: '/api/auth/login', headers: { ...CLIENT, 'content-type': 'application/json' }, payload });

  async function buildFailing(error: Error) {
    await build({
      routeAccounts: (real) => ({
        ...real,
        verify: async () => {
          throw error;
        },
      }),
    });
  }

  it('ohne Inhalt oder mit null wird wie mit leeren Angaben angemeldet: 401, nicht 400', async () => {
    await build();
    const none = await app.inject({ method: 'POST', url: '/api/auth/login', headers: CLIENT });
    expect(none.statusCode).toBe(401);
    expect((await post('null')).statusCode).toBe(401);
  });

  it('ein Inhalt, der kein Objekt ist, wird mit Meldung abgelehnt', async () => {
    await build();
    for (const payload of ['[]', '[1]', '"text"', '5']) {
      const res = await post(payload);
      expect(res.statusCode, payload).toBe(400);
      expect(res.json(), payload).toEqual({ error: 'Der Inhalt der Anfrage muss ein Objekt sein' });
    }
  });

  it('kaputtes JSON ist ein Fehler des Clients (400) mit eigener Meldung, nicht „Interner Fehler"', async () => {
    await build();
    const res = await post('{kaputt');
    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe('string');
    expect(res.json().error).not.toBe('Interner Fehler');
    expect(res.json().error.length).toBeGreaterThan(0);
  });

  it('ein unerwarteter Fehler wird protokolliert und als „Interner Fehler" ohne Einzelheiten beantwortet', async () => {
    const lines: string[] = [];
    await build({
      logStream: { write: (l) => lines.push(l) },
      routeAccounts: (real) => ({
        ...real,
        verify: async () => {
          throw new Error('geheim');
        },
      }),
    });
    const res = await post('{"username":"anna","password":"x"}');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Interner Fehler' });
    expect(lines.join('')).toContain('geheim');
  });

  it('Fehler ab Status 500 mit eigenem statusCode werden nicht durchgereicht', async () => {
    for (const statusCode of [500, 503]) {
      await buildFailing(Object.assign(new Error('geheim'), { statusCode }));
      const res = await post('{"username":"anna","password":"x"}');
      expect(res.statusCode, String(statusCode)).toBe(500);
      expect(res.json()).toEqual({ error: 'Interner Fehler' });
    }
  });

  it('Fehler unter Status 500 mit eigenem statusCode behalten Status und Meldung', async () => {
    await buildFailing(Object.assign(new Error('zu groß'), { statusCode: 499 }));
    const res = await post('{"username":"anna","password":"x"}');
    expect(res.statusCode).toBe(499);
    expect(res.json()).toEqual({ error: 'zu groß' });
  });

  it('die Meldung eines AppError steht im Rumpf der Antwort', async () => {
    await build();
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: CLIENT, payload: { code: codeFromLog(), username: 'anna', password: 'kurz' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: expect.stringContaining('zu kurz') });
  });
});

describe('Verzögerung und Sperre bei der Anmeldung (Routen)', () => {
  beforeEach(async () => {
    await build();
    await einrichten();
    sleepAdvancesClock = true;
  });

  // jeder Versuch kommt von einer eigenen Adresse, damit nur die Regeln je Konto wirken
  const attempt = (username: unknown, i: number) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: CLIENT,
      payload: { username, password: 'falsch-falsch-falsch' },
      remoteAddress: `10.20.${Math.floor(i / 200)}.${i % 200}`,
    });

  it('Groß- und Kleinschreibung und Leerzeichen im Namen gehören zum selben Konto', async () => {
    const names = [' anna ', 'Anna', 'ANNA', 'anna', 'anna ', ' ANNA', 'AnNa'];
    for (const [i, n] of names.entries()) await attempt(n, i);
    expect(slept).toEqual([500]); // der siebte Versuch am selben Konto wartet
  });

  it('verschiedene Namen teilen sich keine Verzögerung', async () => {
    for (let i = 0; i < 9; i += 1) expect((await attempt(`name${i}`, i)).statusCode).toBe(401);
    expect(slept).toEqual([]);
  });

  it('Angaben ohne Namen (leer, Zahl, null, fehlend) laufen auf ein Konto zusammen', async () => {
    const names: unknown[] = ['', 5, undefined, '', 7, null, ''];
    for (const [i, n] of names.entries()) expect((await attempt(n, i)).statusCode).toBe(401);
    expect(slept).toEqual([500]);
  });

  it('ein Zahlen-Name liefert 401 mit der Meldung, kein 500', async () => {
    const res = await attempt(5, 0);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Benutzername oder Passwort stimmt nicht' });
  });

  it('die Verzögerung wächst, der Stau wird mit Wartezeit abgewiesen, und die Staugrenze liegt bei 15 Sekunden', async () => {
    sleepAdvancesClock = false;
    const results: Awaited<ReturnType<typeof attempt>>[] = [];
    for (let i = 0; i < 11; i += 1) results.push(await attempt('anna', i));
    expect(slept).toEqual([500, 1500, 3500, 7500]);
    const last = results[10]!;
    expect(last.statusCode).toBe(429);
    expect(last.headers['retry-after']).toBe('2');
    expect(last.json()).toEqual({ error: 'Zu viele Versuche. Bitte in 2 Sekunden noch einmal.', retryAfter: 2 });
    expect(results.slice(0, 10).every((r) => r.statusCode === 401)).toBe(true);
    // nach 0,5 s sind genau 15 s Stau noch erlaubt
    tick += 500;
    expect((await attempt('anna', 11)).statusCode).toBe(401);
    expect(slept.at(-1)).toBe(15_000);
  });

  it('die Verzögerung je Schritt bleibt bei höchstens 8 Sekunden', async () => {
    sleepAdvancesClock = false;
    for (let i = 0; i < 10; i += 1) await attempt('anna', i);
    tick += 15_500; // der Stau ist abgebaut: der nächste Versuch kommt sofort dran
    await attempt('anna', 10);
    await attempt('anna', 11);
    expect(slept.at(-1)).toBe(8000);
  });
});

describe('Passkey-Anmeldung (Attrappe)', () => {
  let ok = true;

  async function buildWithPasskeys() {
    ok = false;
    await build({
      passkeys: {
        authenticationOptions: async () => ({ ceremonyId: 'c1', options: {} }),
        authenticate: async () => (ok ? accounts.list()[0]! : null),
      } as unknown as Passkeys,
    });
    await einrichten();
  }

  const passkeyLogin = (ip = '127.0.0.1') =>
    app.inject({ method: 'POST', url: '/api/auth/passkey/login', headers: CLIENT, payload: { ceremonyId: 'c1', response: {} }, remoteAddress: ip });

  it('ein misslungener Versuch: 401 mit Meldung und ohne Cookie', async () => {
    await buildWithPasskeys();
    const res = await passkeyLogin();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Die Anmeldung mit dem Passkey hat nicht geklappt' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('ein gelungener Versuch meldet an und antwortet mit dem Benutzer', async () => {
    await buildWithPasskeys();
    ok = true;
    const res = await passkeyLogin();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: true, setupRequired: false, user: { username: 'anna', displayName: 'anna', isAdmin: true } });
    const cookie = cookieOf(res);
    expect((await app.inject({ url: '/api/boards', headers: { cookie } })).statusCode).toBe(200);
  });

  it('nach fünf Fehlversuchen wartet die Adresse, andere Adressen nicht', async () => {
    await buildWithPasskeys();
    for (let i = 0; i < 5; i += 1) expect((await passkeyLogin('10.0.0.1')).statusCode).toBe(401);
    ok = true;
    const gesperrt = await passkeyLogin('10.0.0.1');
    expect(gesperrt.statusCode).toBe(429);
    expect(gesperrt.headers['retry-after']).toBe('60');
    expect(gesperrt.json()).toEqual({ error: 'Zu viele Versuche. Bitte in 60 Sekunden noch einmal.', retryAfter: 60 });
    expect((await passkeyLogin('10.0.0.2')).statusCode).toBe(200);
  });

  it('ein Erfolg setzt den Zähler der Adresse zurück', async () => {
    await buildWithPasskeys();
    for (let i = 0; i < 4; i += 1) await passkeyLogin();
    ok = true;
    expect((await passkeyLogin()).statusCode).toBe(200);
    ok = false;
    for (let i = 0; i < 4; i += 1) expect((await passkeyLogin()).statusCode).toBe(401);
  });
});

describe('Standard-Wartefunktion', () => {
  it('ohne eigene Attrappe wartet die Verzögerung je Konto wirklich', async () => {
    await build({ realSleep: true });
    await einrichten();
    for (let i = 0; i < 6; i += 1) await login('anna', 'falsch-falsch-falsch', { ip: `10.30.0.${i}` });
    const start = Date.now();
    const res = await login('anna', 'falsch-falsch-falsch', { ip: '10.30.0.9' });
    expect(res.statusCode).toBe(401);
    expect(Date.now() - start).toBeGreaterThanOrEqual(450);
  });
});

describe('createLoginLimiter (Einheit)', () => {
  const MIN = 60_000;
  let now: number;
  let lim: LoginLimiter;
  beforeEach(() => {
    now = 1_000_000;
    lim = createLoginLimiter(() => now);
  });

  it('Fehlversuche zählen im Fenster zusammen, bei genau 15 Minuten noch, danach von vorn', () => {
    for (let i = 0; i < 4; i += 1) lim.fail(['k']);
    now += 15 * MIN;
    lim.fail(['k']); // fünfter, das Fenster ist noch nicht vorbei
    expect(lim.wait(['k'])).toBe(60);
    for (let i = 0; i < 4; i += 1) lim.fail(['j']);
    now += 15 * MIN + 1;
    lim.fail(['j']); // neues Fenster
    expect(lim.wait(['j'])).toBe(0);
  });

  it('reserve: das Fenster des Kontos gilt genau 15 Minuten', () => {
    for (let i = 0; i < 5; i += 1) lim.reserve('a');
    now += 15 * MIN;
    expect(lim.reserve('a')).toEqual({ delayMs: 0 });
    expect(lim.reserve('a')).toEqual({ delayMs: 500 }); // noch dasselbe Fenster: schon im Stau
    for (let i = 0; i < 5; i += 1) lim.reserve('b');
    now += 15 * MIN + 1;
    for (let i = 0; i < 6; i += 1) expect(lim.reserve('b')).toEqual({ delayMs: 0 }); // neues Fenster
  });

  it('reserve: fünf freie Versuche, danach wächst die Wartezeit; Stau über 15 Sekunden wird abgewiesen', () => {
    const delays: unknown[] = [];
    for (let i = 0; i < 10; i += 1) delays.push(lim.reserve('a'));
    expect(delays).toEqual([0, 0, 0, 0, 0, 0, 500, 1500, 3500, 7500].map((delayMs) => ({ delayMs })));
    expect(lim.reserve('a')).toEqual({ retryAfter: 2 }); // 15,5 s Stau: 0,5 s zu viel
    now += 500;
    expect(lim.reserve('a')).toEqual({ delayMs: 15_000 });
  });

  it('reserve: ein Erfolg setzt die Verzögerung des Kontos zurück', () => {
    for (let i = 0; i < 5; i += 1) lim.reserve('a');
    lim.success(['a']);
    for (let i = 0; i < 6; i += 1) expect(lim.reserve('a')).toEqual({ delayMs: 0 });
  });

  it('reserve: der Speicher der Konten ist begrenzt, das älteste fällt heraus', () => {
    for (let i = 0; i < 5; i += 1) lim.reserve('k0');
    for (let i = 1; i < 5000; i += 1) lim.reserve(`k${i}`);
    lim.reserve('neu'); // verdrängt k0
    expect(lim.reserve('k0')).toEqual({ delayMs: 0 });
    expect(lim.reserve('k0')).toEqual({ delayMs: 0 }); // k0 beginnt von vorn und hat noch freie Versuche
  });

  it('der Speicher der Sperren ist begrenzt: bei 5000 Einträgen fällt der älteste heraus', () => {
    for (let i = 0; i < 5; i += 1) {
      lim.fail(['k0']);
      lim.fail(['k1']);
    }
    lim.fail(Array.from({ length: 4998 }, (_, i) => `k${i + 2}`)); // ein Aufruf: das Aufräumen läuft nur einmal
    expect(lim.wait(['k0'])).toBe(60);
    lim.fail(['neu']);
    expect(lim.wait(['k0'])).toBe(0); // verdrängt
    expect(lim.wait(['k1'])).toBe(60);
  });

  it('beim Aufräumen bleibt ein Eintrag, dessen Fenster genau jetzt endet', () => {
    for (let i = 0; i < 4; i += 1) lim.fail(['B']);
    lim.fail(Array.from({ length: 1000 }, (_, i) => `x${i}`));
    now += 15 * MIN;
    lim.fail(['B']); // Aufräumen läuft (über 1000 Einträge); B ist nicht abgelaufen und zählt als fünfter
    expect(lim.wait(['B'])).toBe(60);
  });

  it('beim Aufräumen fallen abgelaufene Einträge weg, gesperrte bleiben, auch wenn ihr Fenster vorbei ist', () => {
    lim.fail(['A']);
    lim.fail(Array.from({ length: 4998 }, (_, i) => `x${i}`));
    now += 894_000;
    for (let i = 0; i < 4; i += 1) lim.fail(['A']); // A: fünf Fehlversuche, gesperrt bis Minute 15,9
    lim.fail(['y']); // jetzt sind es 5000 Einträge
    now += 36_000; // Minute 15,5: alle x sind abgelaufen, A ist gesperrt
    lim.fail(['neu']); // Aufräumen: die abgelaufenen fallen weg, der älteste (A) muss nicht weichen
    expect(lim.wait(['A'])).toBeGreaterThan(0);
  });
});
