import { randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Account, Accounts } from './accounts.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { t } from './i18n/index.js';

// Erst beim ersten Gebrauch laden: das Add-on und Container ohne Passkeys brauchen die Bibliothek (und ihre Node-Warnungen) nie
let webauthn: Promise<typeof import('@simplewebauthn/server')> | null = null;
const lib = (): Promise<typeof import('@simplewebauthn/server')> => (webauthn ??= import('@simplewebauthn/server'));

/** Wo Passkeys gelten: die Kennung der Seite (Domain) und ihre Adresse. Beides kommt aus STUPS_PUBLIC_URL, nie aus Kopfzeilen. */
export interface PasskeyConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const PASSKEYS_PER_ACCOUNT = 10;
const CEREMONY_MS = 5 * 60_000;
const MAX_CEREMONIES = 1000;
const NAME_MAX = 60;

/**
 * Passkeys gehen nur über HTTPS (oder localhost) und an eine Domain gebunden, nie an eine IP-Adresse.
 * Ohne passende STUPS_PUBLIC_URL gibt es keine Passkeys; dann bleibt das Passwort.
 */
export function passkeyConfigFrom(publicUrl: string | null): PasskeyConfig | null {
  if (!publicUrl) return null;
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return null;
  const local = host === 'localhost' || host.endsWith('.localhost');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  return { rpID: host, rpName: 'Stups', origin: url.origin };
}

type Row = Record<string, any>;
type Kind = 'register' | 'login';
interface Ceremony {
  challenge: string;
  kind: Kind;
  userId: string | null;
  expires: number;
}

const toInfo = (r: Row): PasskeyInfo => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at ?? null });

export function createPasskeys(deps: { db: DatabaseSync; accounts: Accounts; config: PasskeyConfig; now?: () => Date }) {
  const { db, accounts, config } = deps;
  const now = deps.now ?? (() => new Date());
  const one = (sql: string, ...args: any[]): Row | undefined => db.prepare(sql).get(...args) as Row | undefined;
  const all = (sql: string, ...args: any[]): Row[] => db.prepare(sql).all(...args) as Row[];
  const run = (sql: string, ...args: any[]) => db.prepare(sql).run(...args);

  // Die Herausforderung gilt einmal und fünf Minuten; sie liegt nur im Speicher
  const ceremonies = new Map<string, Ceremony>();
  function remember(kind: Kind, challenge: string, userId: string | null): string {
    const t = now().getTime();
    if (ceremonies.size >= MAX_CEREMONIES) {
      for (const [k, c] of ceremonies) if (c.expires <= t) ceremonies.delete(k);
      while (ceremonies.size >= MAX_CEREMONIES) ceremonies.delete(ceremonies.keys().next().value as string);
    }
    const id = randomBytes(24).toString('base64url');
    ceremonies.set(id, { challenge, kind, userId, expires: t + CEREMONY_MS });
    return id;
  }
  /** Gibt die Herausforderung zurück und löscht sie, auch wenn danach etwas schiefgeht */
  function take(id: unknown, kind: Kind, userId: string | null): string {
    const c = typeof id === 'string' ? ceremonies.get(id) : undefined;
    if (typeof id === 'string') ceremonies.delete(id);
    if (!c || c.kind !== kind || c.userId !== userId || c.expires <= now().getTime()) {
      throw new ValidationError(t('Die Anfrage ist abgelaufen. Bitte noch einmal versuchen.'));
    }
    return c.challenge;
  }

  const list = (userId: string): PasskeyInfo[] =>
    all('select id, name, created_at, last_used_at from passkeys where user_id = ? order by created_at, rowid', userId).map(toInfo);

  async function registrationOptions(account: Account): Promise<{ ceremonyId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
    const existing = all('select credential_id, transports from passkeys where user_id = ?', account.userId);
    if (existing.length >= PASSKEYS_PER_ACCOUNT) throw new ConflictError(t('Mehr als {max} Passkeys gehen nicht', { max: PASSKEYS_PER_ACCOUNT }));
    const options = await (await lib()).generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: account.username,
      userDisplayName: account.displayName,
      userID: new TextEncoder().encode(account.userId),
      attestationType: 'none',
      excludeCredentials: existing.map((r) => ({ id: r.credential_id, transports: parseTransports(r.transports) })),
      // Mit Anmeldung ohne Benutzername: der Passkey liegt auf dem Gerät, und die Person muss sich am Gerät ausweisen
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    return { ceremonyId: remember('register', options.challenge, account.userId), options };
  }

  async function register(account: Account, ceremonyId: unknown, response: unknown, name: unknown): Promise<PasskeyInfo> {
    const challenge = take(ceremonyId, 'register', account.userId);
    if (!response || typeof response !== 'object') throw new ValidationError(t('Die Antwort des Geräts fehlt'));
    const { verifyRegistrationResponse } = await lib();
    let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verified = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new ValidationError(t('Der Passkey konnte nicht geprüft werden'));
    }
    if (!verified.verified) throw new ValidationError(t('Der Passkey konnte nicht geprüft werden'));
    const { credential } = verified.registrationInfo;
    if (one('select 1 as x from passkeys where credential_id = ?', credential.id)) throw new ConflictError(t('Dieser Passkey ist schon eingetragen'));
    if ((one('select count(*) as n from passkeys where user_id = ?', account.userId)?.n as number) >= PASSKEYS_PER_ACCOUNT) {
      throw new ConflictError(t('Mehr als {max} Passkeys gehen nicht', { max: PASSKEYS_PER_ACCOUNT }));
    }
    const label = typeof name === 'string' && name.trim() !== '' ? name.trim().slice(0, NAME_MAX) : 'Passkey';
    const id = randomUUID();
    run(
      'insert into passkeys (id, user_id, credential_id, public_key, counter, transports, name, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      account.userId,
      credential.id,
      credential.publicKey,
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      label,
      now().toISOString(),
    );
    return toInfo(one('select id, name, created_at, last_used_at from passkeys where id = ?', id)!);
  }

  async function authenticationOptions(): Promise<{ ceremonyId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
    // Ohne Liste: das Gerät bietet die eigenen Passkeys für diese Seite an
    const options = await (await lib()).generateAuthenticationOptions({ rpID: config.rpID, userVerification: 'required' });
    return { ceremonyId: remember('login', options.challenge, null), options };
  }

  /** Das Konto zum Passkey, oder null (die Ursache erfährt der Aufrufer nicht, nur das Protokoll) */
  async function authenticate(ceremonyId: unknown, response: unknown): Promise<Account | null> {
    const challenge = take(ceremonyId, 'login', null);
    if (!response || typeof response !== 'object') return null;
    const res = response as AuthenticationResponseJSON;
    if (typeof res.id !== 'string' || res.id.length > 1024) return null;
    const row = one('select * from passkeys where credential_id = ?', res.id);
    if (!row) return null;
    // Trägt das Gerät eine Person mit, muss es dieselbe sein
    const handle = res.response?.userHandle;
    if (typeof handle === 'string' && handle !== '' && Buffer.from(handle, 'base64url').toString('utf8') !== row.user_id) return null;
    try {
      const { verifyAuthenticationResponse } = await lib();
      const verified = await verifyAuthenticationResponse({
        response: res,
        expectedChallenge: challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: true,
        credential: {
          id: row.credential_id,
          publicKey: new Uint8Array(row.public_key as Uint8Array),
          counter: row.counter,
          transports: parseTransports(row.transports),
        },
      });
      if (!verified.verified) return null;
      run('update passkeys set counter = ?, last_used_at = ? where id = ?', verified.authenticationInfo.newCounter, now().toISOString(), row.id);
    } catch {
      return null;
    }
    return accounts.byUserId(row.user_id);
  }

  function remove(userId: string, id: string): void {
    if (Number(run('delete from passkeys where id = ? and user_id = ?', id, userId).changes) === 0) throw new NotFoundError(t('Passkey nicht gefunden'));
  }

  return { config, list, registrationOptions, register, authenticationOptions, authenticate, remove };
}

export type Passkeys = ReturnType<typeof createPasskeys>;

function parseTransports(raw: unknown): any[] | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
