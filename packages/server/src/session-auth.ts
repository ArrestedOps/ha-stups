import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { checkPassword, checkUsername, type Account, type Accounts } from './accounts.js';
import { AppError, ConflictError, ValidationError } from './errors.js';
import type { Identity } from './identity.js';
import type { Passkeys } from './passkeys.js';
import { PUSH_ACTION_PATH } from './push.js';
import { t } from './i18n/index.js';

export const COOKIE = 'stups_session';
/** Jede ändernde Anfrage trägt diese Kopfzeile: ein fremdes Formular oder eine fremde Seite kann sie nicht setzen */
export const CLIENT_HEADER = 'x-stups-client';

/** Pfade, die ohne Anmeldung erreichbar sein müssen, damit die Anmeldeseite laden und sich anmelden kann */
const PUBLIC_API = new Set([
  '/api/auth/status',
  '/api/auth/setup',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/passkey/options',
  '/api/auth/passkey/login',
  '/api/capabilities',
  PUSH_ACTION_PATH,
]);

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    if (key && !(key in out)) out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionToken(headers: { cookie?: string | string[] | undefined }): string {
  const raw = Array.isArray(headers.cookie) ? headers.cookie.join('; ') : headers.cookie;
  try {
    return parseCookies(raw)[COOKIE] ?? '';
  } catch {
    return '';
  }
}

/** Anmeldung über das Sitzungs-Cookie (eigene Konten, Betrieb ohne Home Assistant) */
export function createSessionIdentity(deps: { accounts: Accounts }): Identity {
  return {
    isPublic: (path) => !path.startsWith('/api/') || PUBLIC_API.has(path),
    authenticate(req) {
      const account = deps.accounts.sessionAccount(sessionToken(req.headers));
      if (!account) return { ok: false, status: 401, error: 'Bitte anmelden' };
      return {
        ok: true,
        principal: { id: account.externalId, name: account.username, displayName: account.displayName, ingressPath: '' },
      };
    },
  };
}

/** Lehnt ändernde Anfragen an die API ohne die Kopfzeile des Clients ab (Schutz gegen fremde Seiten, zusätzlich zu SameSite) */
export async function clientGuard(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (!req.url.startsWith('/api/')) return;
    // Die Knöpfe in Push-Nachrichten kommen von der ntfy-App und tragen statt der Kopfzeile ein signiertes Token
    if (req.url.split('?')[0] === PUSH_ACTION_PATH) return;
    if (!req.headers[CLIENT_HEADER]) return reply.code(403).send({ error: 'Anfrage abgelehnt' });
  });
}
(clientGuard as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

// ---------- Begrenzung der Anmeldeversuche ----------

const WINDOW_MS = 15 * 60_000;
const FREE_TRIES = 5;
const MAX_LOCK_MS = 30 * 60_000;

/** Nach fünf Fehlversuchen wartet man eine Minute, jeder weitere verdoppelt die Wartezeit (höchstens 30 Minuten) */
export function createLoginLimiter(now: () => number = Date.now) {
  const entries = new Map<string, { fails: number; firstAt: number; lockedUntil: number }>();

  function prune(): void {
    if (entries.size < 1000) return;
    const t = now();
    for (const [k, e] of entries) if (e.lockedUntil < t && t - e.firstAt > WINDOW_MS) entries.delete(k);
  }

  return {
    /** Sekunden bis zum nächsten erlaubten Versuch, 0 = jetzt */
    wait(keys: string[]): number {
      const t = now();
      let ms = 0;
      for (const k of keys) ms = Math.max(ms, (entries.get(k)?.lockedUntil ?? 0) - t);
      return ms > 0 ? Math.ceil(ms / 1000) : 0;
    },
    fail(keys: string[]): void {
      prune();
      const t = now();
      for (const k of keys) {
        let e = entries.get(k);
        if (!e || t - e.firstAt > WINDOW_MS) e = { fails: 0, firstAt: t, lockedUntil: 0 };
        e.fails += 1;
        if (e.fails >= FREE_TRIES) e.lockedUntil = t + Math.min(MAX_LOCK_MS, 60_000 * 2 ** (e.fails - FREE_TRIES));
        entries.set(k, e);
      }
    },
    success(keys: string[]): void {
      for (const k of keys) entries.delete(k);
    },
  };
}
export type LoginLimiter = ReturnType<typeof createLoginLimiter>;

// ---------- Einrichtung des ersten Administrators ----------

export interface SetupDeps {
  accounts: Accounts;
  log: { info: (m: string) => void; warn: (m: string) => void };
  /** STUPS_ADMIN_USER und STUPS_ADMIN_PASSWORD */
  bootstrap?: { username: string; password: string };
  publicUrl: string | null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/**
 * Solange es kein Konto gibt, richtet entweder STUPS_ADMIN_USER/STUPS_ADMIN_PASSWORD den ersten Administrator ein,
 * oder die Einrichtungsseite verlangt einen Code aus dem Protokoll des Containers. Offen im Netz gibt es keinen Weg.
 */
export function createSetup(deps: SetupDeps) {
  let code: string | null = null;
  let wrongTries = 0;

  async function init(): Promise<void> {
    if (deps.accounts.count() > 0) return;
    if (deps.bootstrap) {
      await deps.accounts.create({ username: deps.bootstrap.username, password: deps.bootstrap.password, isAdmin: true });
      deps.log.info(`Administrator „${deps.bootstrap.username}" aus STUPS_ADMIN_USER eingerichtet`);
      return;
    }
    announce();
  }

  function announce(): void {
    code = newCode();
    wrongTries = 0;
    const where = deps.publicUrl ?? 'der Adresse von Stups';
    deps.log.warn(`Einrichtung: Öffne ${where} und gib diesen Code ein: ${code}`);
  }

  return {
    init,
    required: (): boolean => deps.accounts.count() === 0,
    /** Prüft den Code; nach zehn Fehlversuchen gilt ein neuer (er steht dann im Protokoll) */
    check(input: unknown): boolean {
      if (code === null || typeof input !== 'string') return false;
      const given = Buffer.from(input.trim().toUpperCase());
      const want = Buffer.from(code);
      const ok = given.length === want.length && timingSafeEqual(given, want);
      if (!ok && ++wrongTries >= 10) announce();
      return ok;
    },
    done(): void {
      code = null;
    },
  };
}
export type Setup = ReturnType<typeof createSetup>;

// ---------- Routen ----------

export interface AuthRoutesDeps {
  accounts: Accounts;
  limiter: LoginLimiter;
  setup: Setup;
  /** Cookie nur über HTTPS senden (Secure) */
  secureCookie: boolean;
  /** Anmeldung mit Passkey, wenn STUPS_PUBLIC_URL dafür taugt */
  passkeys?: Passkeys;
}

function body(req: FastifyRequest): Record<string, unknown> {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw new ValidationError(t('Der Inhalt der Anfrage muss ein Objekt sein'));
  return b as Record<string, unknown>;
}

export const publicAccount = (a: Account) => ({ username: a.username, displayName: a.displayName, isAdmin: a.isAdmin });

export async function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps): Promise<void> {
  const { accounts, limiter, setup } = deps;

  const cookie = (token: string, maxAgeSec: number): string =>
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${deps.secureCookie ? '; Secure' : ''}`;

  function startSession(reply: FastifyReply, userId: string): void {
    const { token, maxAgeSec } = accounts.createSession(userId);
    reply.header('set-cookie', cookie(token, maxAgeSec));
  }

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Interner Fehler' });
  });

  app.get('/api/auth/status', async (req) => {
    const account = accounts.sessionAccount(sessionToken(req.headers));
    return {
      authenticated: account !== null,
      setupRequired: setup.required(),
      user: account ? publicAccount(account) : null,
    };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const b = body(req);
    const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    const keys = [`ip:${req.ip}`, `user:${username}`];
    const wait = limiter.wait(keys);
    if (wait > 0) {
      return reply.code(429).header('retry-after', String(wait)).send({ error: `Zu viele Versuche. Bitte in ${wait} Sekunden noch einmal.`, retryAfter: wait });
    }
    const account = await accounts.verify(b.username, b.password);
    if (!account) {
      limiter.fail(keys);
      return reply.code(401).send({ error: 'Benutzername oder Passwort stimmt nicht' });
    }
    limiter.success(keys);
    startSession(reply, account.userId);
    return { authenticated: true, setupRequired: false, user: publicAccount(account) };
  });

  if (deps.passkeys) {
    const passkeys = deps.passkeys;
    // Der Speicher für offene Herausforderungen ist begrenzt (die ältesten fallen heraus); eine Sperre gäbe es hier nur für alle
    app.post('/api/auth/passkey/options', async () => passkeys.authenticationOptions());

    app.post('/api/auth/passkey/login', async (req, reply) => {
      const b = body(req);
      const keys = [`ip:${req.ip}`];
      const wait = limiter.wait(keys);
      if (wait > 0) {
        return reply.code(429).header('retry-after', String(wait)).send({ error: `Zu viele Versuche. Bitte in ${wait} Sekunden noch einmal.`, retryAfter: wait });
      }
      const account = await passkeys.authenticate(b.ceremonyId, b.response);
      if (!account) {
        limiter.fail(keys);
        return reply.code(401).send({ error: 'Die Anmeldung mit dem Passkey hat nicht geklappt' });
      }
      limiter.success(keys);
      startSession(reply, account.userId);
      return { authenticated: true, setupRequired: false, user: publicAccount(account) };
    });
  }

  app.post('/api/auth/logout', async (req, reply) => {
    const token = sessionToken(req.headers);
    if (token) accounts.endSession(token);
    reply.header('set-cookie', cookie('', 0));
    return reply.code(204).send();
  });

  let settingUp = false; // zwei gleichzeitige Einrichtungen dürfen nicht beide gelingen
  app.post('/api/auth/setup', async (req, reply) => {
    if (!setup.required() || settingUp) throw new ConflictError(t('Stups ist schon eingerichtet'));
    const b = body(req);
    const keys = [`setup:${req.ip}`];
    const wait = limiter.wait(keys);
    if (wait > 0) return reply.code(429).header('retry-after', String(wait)).send({ error: `Zu viele Versuche. Bitte in ${wait} Sekunden noch einmal.`, retryAfter: wait });
    if (!setup.check(b.code)) {
      limiter.fail(keys);
      return reply.code(403).send({ error: 'Der Einrichtungscode stimmt nicht (er steht im Protokoll des Containers)' });
    }
    checkUsername(b.username);
    checkPassword(b.password);
    settingUp = true;
    let account: Account;
    try {
      account = await accounts.create({ username: b.username, displayName: b.displayName, password: b.password, isAdmin: true });
    } finally {
      settingUp = false;
    }
    setup.done();
    limiter.success(keys);
    startSession(reply, account.userId);
    return reply.code(201).send({ authenticated: true, setupRequired: false, user: publicAccount(account) });
  });
}
