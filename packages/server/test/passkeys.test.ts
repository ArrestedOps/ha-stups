import { generateKeyPairSync } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAccess } from '../src/access.js';
import { createAccounts, type Accounts } from '../src/accounts.js';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { createLocalDirectory } from '../src/directory.js';
import { identityAuth } from '../src/identity.js';
import { PASSKEYS_PER_ACCOUNT, createPasskeys, passkeyConfigFrom, type Passkeys } from '../src/passkeys.js';
import { authRoutes, clientGuard, createLoginLimiter, createSessionIdentity, createSetup } from '../src/session-auth.js';
import { createStore } from '../src/store.js';
import { createAuthenticator, type SoftAuthenticator } from './helpers/authenticator.js';

const PW = 'ein-langes-passwort';
const ORIGIN = 'https://stups.example.org';
const RP = 'stups.example.org';
const CLIENT = { 'x-stups-client': '1' };

// Die Bibliothek wird erst beim ersten Gebrauch geladen; bei vielen parallelen Testdateien dauert das einmal länger
beforeAll(async () => {
  await import('@simplewebauthn/server');
}, 120_000);

let app: FastifyInstance;
let accounts: Accounts;
let passkeys: Passkeys;
let clock: number;
let tick: number;
let anna: { userId: string; cookie: string };
let ben: { userId: string; cookie: string };

async function build(withPasskeys = true) {
  const db = openDb(':memory:');
  const store = createStore(db);
  accounts = createAccounts(db, store);
  clock = Date.parse('2026-11-02T10:00:00Z');
  tick = 1_000_000;
  const config = passkeyConfigFrom(ORIGIN)!;
  passkeys = createPasskeys({ db, accounts, config, now: () => new Date(clock) });
  const setup = createSetup({ accounts, log: { info: () => undefined, warn: () => undefined }, bootstrap: { username: 'anna', password: PW }, publicUrl: ORIGIN });
  await setup.init();
  const a = accounts.byExternalId(accounts.list()[0]!.externalId)!;
  const b = await accounts.create({ username: 'ben', password: PW });
  anna = { userId: a.userId, cookie: `stups_session=${accounts.createSession(a.userId).token}` };
  ben = { userId: b.userId, cookie: `stups_session=${accounts.createSession(b.userId).token}` };
  app = Fastify();
  await app.register(clientGuard);
  await app.register(identityAuth, { identity: createSessionIdentity({ accounts }) });
  await app.register(authRoutes, {
    accounts,
    limiter: createLoginLimiter(() => tick),
    setup,
    secureCookie: true,
    passkeys: withPasskeys ? passkeys : undefined,
  });
  await app.register(apiRoutes, {
    store,
    accounts,
    passkeys: withPasskeys ? passkeys : undefined,
    access: createAccess({ store, directory: createLocalDirectory(accounts) }),
  });
}

const post = (url: string, cookie: string | null, payload?: object) =>
  app.inject({ method: 'POST', url, headers: { ...CLIENT, ...(cookie ? { cookie } : {}) }, payload });

async function addPasskey(who: { cookie: string }, auth: SoftAuthenticator, name = 'iPhone', tweak: (r: any) => any = (r) => r) {
  const o = (await post('/api/passkeys/options', who.cookie)).json();
  const response = tweak(auth.register({ challenge: o.options.challenge, origin: ORIGIN, rpID: RP }));
  return post('/api/passkeys', who.cookie, { ceremonyId: o.ceremonyId, response, name });
}

async function passkeyLogin(
  auth: SoftAuthenticator,
  who: { userId: string } | null = anna,
  opts: { origin?: string; userVerified?: boolean; privateKey?: any; sameCeremony?: { ceremonyId: string; challenge: string } } = {},
) {
  const o = opts.sameCeremony
    ? { ceremonyId: opts.sameCeremony.ceremonyId, options: { challenge: opts.sameCeremony.challenge } }
    : (await post('/api/auth/passkey/options', null)).json();
  const response = auth.assert({
    challenge: o.options.challenge,
    origin: opts.origin ?? ORIGIN,
    rpID: RP,
    userHandle: who?.userId ?? null,
    userVerified: opts.userVerified,
    privateKey: opts.privateKey,
  });
  return { res: await post('/api/auth/passkey/login', null, { ceremonyId: o.ceremonyId, response }), ceremonyId: o.ceremonyId as string, challenge: o.options.challenge as string };
}

describe('Adresse für Passkeys', () => {
  it('HTTPS mit Namen und localhost gelten, alles andere nicht', () => {
    expect(passkeyConfigFrom('https://stups.example.org')).toEqual({ rpID: 'stups.example.org', rpName: 'Stups', origin: 'https://stups.example.org' });
    expect(passkeyConfigFrom('https://nas.example.org:8443/stups')?.origin).toBe('https://nas.example.org:8443');
    expect(passkeyConfigFrom('http://localhost:8099')?.rpID).toBe('localhost');
    for (const bad of [null, '', 'kein url', 'http://stups.example.org', 'https://192.168.1.20:8099', 'https://[::1]', 'http://127.0.0.1:8099']) {
      expect(passkeyConfigFrom(bad), String(bad)).toBeNull();
    }
  });
});

describe('Passkey anlegen und verwalten', () => {
  beforeEach(() => build());

  it('ohne Anmeldung geht nichts, die Optionen zur Anmeldung sind offen', async () => {
    expect((await app.inject({ url: '/api/passkeys' })).statusCode).toBe(401);
    expect((await post('/api/passkeys/options', null)).statusCode).toBe(401);
    expect((await post('/api/passkeys', null, {})).statusCode).toBe(401);
    expect((await post('/api/auth/passkey/options', null)).statusCode).toBe(200);
  });

  it('die Optionen verlangen einen Passkey auf dem Gerät mit Bestätigung der Person', async () => {
    const o = (await post('/api/passkeys/options', anna.cookie)).json();
    expect(o.options.rp).toEqual({ name: 'Stups', id: RP });
    expect(o.options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    expect(o.options.attestation).toBe('none');
    expect(o.options.user.name).toBe('anna');
    expect(typeof o.ceremonyId).toBe('string');
  });

  it('legt einen Passkey an und listet ihn mit Namen', async () => {
    const res = await addPasskey(anna, createAuthenticator(), '  iPhone von Anna ');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'iPhone von Anna', lastUsedAt: null });
    const list = await app.inject({ url: '/api/passkeys', headers: { cookie: anna.cookie } });
    expect(list.json()).toHaveLength(1);
    expect(JSON.stringify(list.json())).not.toContain('publicKey');
  });

  it('jede Person sieht und entfernt nur ihre eigenen', async () => {
    const id = (await addPasskey(anna, createAuthenticator())).json().id as string;
    expect((await app.inject({ url: '/api/passkeys', headers: { cookie: ben.cookie } })).json()).toEqual([]);
    const fremd = await app.inject({ method: 'DELETE', url: `/api/passkeys/${id}`, headers: { ...CLIENT, cookie: ben.cookie } });
    expect(fremd.statusCode).toBe(404);
    const eigen = await app.inject({ method: 'DELETE', url: `/api/passkeys/${id}`, headers: { ...CLIENT, cookie: anna.cookie } });
    expect(eigen.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/passkeys', headers: { cookie: anna.cookie } })).json()).toEqual([]);
  });

  it('derselbe Passkey lässt sich nicht zweimal eintragen', async () => {
    const auth = createAuthenticator();
    expect((await addPasskey(anna, auth)).statusCode).toBe(201);
    // Das Gerät meldet ihn über excludeCredentials schon als bekannt; trotzdem darf der Server nicht doppelt speichern
    expect((await addPasskey(ben, auth)).statusCode).toBe(409);
    expect(passkeys.list(anna.userId)).toHaveLength(1);
    expect(passkeys.list(ben.userId)).toHaveLength(0);
  });

  it('die Optionen schließen vorhandene Passkeys aus', async () => {
    const auth = createAuthenticator();
    await addPasskey(anna, auth);
    const o = (await post('/api/passkeys/options', anna.cookie)).json();
    expect(o.options.excludeCredentials.map((c: any) => c.id)).toEqual([auth.credentialId]);
  });

  it(`höchstens ${PASSKEYS_PER_ACCOUNT} Passkeys je Konto`, async () => {
    for (let i = 0; i < PASSKEYS_PER_ACCOUNT; i++) expect((await addPasskey(anna, createAuthenticator())).statusCode).toBe(201);
    expect((await post('/api/passkeys/options', anna.cookie)).statusCode).toBe(409);
  });

  it('weist falsche Anlege-Antworten ab', async () => {
    const o = (await post('/api/passkeys/options', anna.cookie)).json();
    const auth = createAuthenticator();
    const ok = (over: object) => post('/api/passkeys', anna.cookie, { ceremonyId: o.ceremonyId, ...over });
    // falsche Herausforderung
    expect((await ok({ response: auth.register({ challenge: 'AAAA', origin: ORIGIN, rpID: RP }) })).statusCode).toBe(400);
    // Die Herausforderung ist verbraucht, auch nach einem Fehler
    const o2 = (await post('/api/passkeys/options', anna.cookie)).json();
    const post2 = (response: object) => post('/api/passkeys', anna.cookie, { ceremonyId: o2.ceremonyId, response });
    expect((await post2(auth.register({ challenge: o2.options.challenge, origin: 'https://boese.example.org', rpID: RP }))).statusCode).toBe(400);
    expect((await post2(auth.register({ challenge: o2.options.challenge, origin: ORIGIN, rpID: RP }))).statusCode).toBe(400);
    // ohne Bestätigung der Person am Gerät
    const o3 = (await post('/api/passkeys/options', anna.cookie)).json();
    const unverified = auth.register({ challenge: o3.options.challenge, origin: ORIGIN, rpID: RP, userVerified: false });
    expect((await post('/api/passkeys', anna.cookie, { ceremonyId: o3.ceremonyId, response: unverified })).statusCode).toBe(400);
    expect(passkeys.list(anna.userId)).toHaveLength(0);
  });

  it('eine Herausforderung einer anderen Person oder anderer Art gilt nicht', async () => {
    const auth = createAuthenticator();
    const o = (await post('/api/passkeys/options', anna.cookie)).json();
    const response = auth.register({ challenge: o.options.challenge, origin: ORIGIN, rpID: RP });
    expect((await post('/api/passkeys', ben.cookie, { ceremonyId: o.ceremonyId, response })).statusCode).toBe(400);
    const login = (await post('/api/auth/passkey/options', null)).json();
    const r2 = auth.register({ challenge: login.options.challenge, origin: ORIGIN, rpID: RP });
    expect((await post('/api/passkeys', anna.cookie, { ceremonyId: login.ceremonyId, response: r2 })).statusCode).toBe(400);
    expect((await post('/api/passkeys', anna.cookie, { ceremonyId: 'gibt-es-nicht', response: r2 })).statusCode).toBe(400);
  });

  it('eine Herausforderung läuft nach fünf Minuten ab', async () => {
    const auth = createAuthenticator();
    const o = (await post('/api/passkeys/options', anna.cookie)).json();
    clock += 5 * 60_000 + 1000;
    const response = auth.register({ challenge: o.options.challenge, origin: ORIGIN, rpID: RP });
    expect((await post('/api/passkeys', anna.cookie, { ceremonyId: o.ceremonyId, response })).statusCode).toBe(400);
  });

  it('ohne passende Adresse gibt es die Routen nicht', async () => {
    await build(false);
    expect((await post('/api/auth/passkey/options', null)).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/passkeys', headers: { cookie: anna.cookie } })).statusCode).toBe(404);
  });

  it('mit dem Konto verschwinden die Passkeys', async () => {
    await addPasskey(ben, createAuthenticator());
    accounts.remove(ben.userId);
    expect(passkeys.list(ben.userId)).toEqual([]);
  });
});

describe('Mit Passkey anmelden', () => {
  let auth: SoftAuthenticator;
  beforeEach(async () => {
    await build();
    auth = createAuthenticator();
    expect((await addPasskey(anna, auth)).statusCode).toBe(201);
    auth.counter = 1;
  });

  it('meldet an wie mit Passwort: Sitzung im Cookie, Konto in der Antwort', async () => {
    const { res } = await passkeyLogin(auth);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ authenticated: true, user: { username: 'anna', isAdmin: true } });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^stups_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
    const status = await app.inject({ url: '/api/auth/status', headers: { cookie: cookie.split(';')[0]! } });
    expect(status.json().authenticated).toBe(true);
    expect(passkeys.list(anna.userId)[0]!.lastUsedAt).toBe(new Date(clock).toISOString());
  });

  it('es genügt der Passkey, das Gerät muss keinen Benutzernamen nennen', async () => {
    const { res } = await passkeyLogin(auth, null);
    expect(res.statusCode).toBe(200);
  });

  it('eine Herausforderung gilt nur einmal', async () => {
    const first = await passkeyLogin(auth);
    expect(first.res.statusCode).toBe(200);
    auth.counter = 2;
    const again = await passkeyLogin(auth, anna, { sameCeremony: { ceremonyId: first.ceremonyId, challenge: first.challenge } });
    expect(again.res.statusCode).toBe(400);
  });

  it('weist ab: falscher Schlüssel, fremde Adresse, fehlende Bestätigung, anderer Benutzer', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const cases: Array<[string, Parameters<typeof passkeyLogin>[2], { userId: string } | null]> = [
      ['Signatur', { privateKey: other }, anna],
      ['Adresse', { origin: 'https://boese.example.org' }, anna],
      ['Bestätigung', { userVerified: false }, anna],
      ['Benutzer', {}, ben],
    ];
    for (const [name, opts, who] of cases) {
      const { res } = await passkeyLogin(auth, who, opts);
      expect(res.statusCode, name).toBe(401);
      expect(res.headers['set-cookie'], name).toBeUndefined();
    }
    expect(passkeys.list(anna.userId)[0]!.lastUsedAt).toBeNull();
  });

  it('ein unbekannter oder entfernter Passkey meldet nicht an', async () => {
    const id = passkeys.list(anna.userId)[0]!.id;
    passkeys.remove(anna.userId, id);
    expect((await passkeyLogin(auth)).res.statusCode).toBe(401);
    expect((await passkeyLogin(createAuthenticator())).res.statusCode).toBe(401);
  });

  it('der Zähler darf nicht zurückgehen (geklonter Schlüssel)', async () => {
    auth.counter = 5;
    expect((await passkeyLogin(auth)).res.statusCode).toBe(200);
    auth.counter = 5;
    expect((await passkeyLogin(auth)).res.statusCode).toBe(401);
    auth.counter = 6;
    expect((await passkeyLogin(auth)).res.statusCode).toBe(200);
  });

  it('Geräte, die immer 0 melden (iCloud-Schlüsselbund), gehen weiter', async () => {
    const zero = createAuthenticator();
    await addPasskey(ben, zero);
    zero.counter = 0;
    expect((await passkeyLogin(zero, ben)).res.statusCode).toBe(200);
    expect((await passkeyLogin(zero, ben)).res.statusCode).toBe(200);
  });

  it('wiederholte Fehlversuche sperren wie bei Passwörtern', async () => {
    for (let i = 0; i < 5; i++) expect((await passkeyLogin(auth, anna, { userVerified: false })).res.statusCode).toBe(401);
    const locked = (await passkeyLogin(auth)).res;
    expect(locked.statusCode).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
    tick += 61_000;
    expect((await passkeyLogin(auth)).res.statusCode).toBe(200);
  });

  it('das Ändern des Passworts lässt Passkeys bestehen', async () => {
    await accounts.setPassword(anna.userId, 'ein-ganz-neues-passwort');
    expect((await passkeyLogin(auth)).res.statusCode).toBe(200);
  });
});
