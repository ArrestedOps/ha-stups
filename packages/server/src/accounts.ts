import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import type { Store } from './store.js';

/** Konten für den Betrieb ohne Home Assistant: Passwort, Sitzungen. Jedes Konto gehört zu einer Person. */
export interface Account {
  userId: string;
  /** Kennung, unter der die Person im Rest der App geführt wird (users.ha_user_id), z. B. "local:…" */
  externalId: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
const SESSION_DAYS = 30;
const TOUCH_AFTER_MS = 10 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/i;
const LOCAL_PREFIX = 'local:';

export const isLocalId = (id: string): boolean => id.startsWith(LOCAL_PREFIX);

const KEYLEN = 64;
// N=2^15 braucht 32 MiB und bleibt auf einer kleinen NAS im Bereich von rund 100 ms
const COST = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: COST.maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST.N, COST.r, COST.p);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !n || !r || !p || !salt || !key) return false;
  try {
    const expected = Buffer.from(key, 'base64');
    const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Gegen Zeitunterschiede: auch für unbekannte Benutzernamen wird gerechnet */
let dummyHash: Promise<string> | null = null;

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function checkPassword(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('Das Passwort fehlt');
  if (raw.length < PASSWORD_MIN) throw new ValidationError(`Das Passwort ist zu kurz (mindestens ${PASSWORD_MIN} Zeichen)`);
  if (raw.length > PASSWORD_MAX) throw new ValidationError(`Das Passwort ist zu lang (höchstens ${PASSWORD_MAX} Zeichen)`);
  return raw;
}

export function checkUsername(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') throw new ValidationError('Der Benutzername fehlt');
  const name = raw.trim();
  if (!USERNAME_RE.test(name)) {
    throw new ValidationError('Der Benutzername darf 2 bis 32 Zeichen haben: Buchstaben, Ziffern, Punkt, Minus und Unterstrich');
  }
  return name;
}

type Row = Record<string, any>;

export function createAccounts(db: DatabaseSync, store: Store, opts: { now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date());
  const iso = (d: Date = now()) => d.toISOString();
  const one = (sql: string, ...args: any[]): Row | undefined => db.prepare(sql).get(...args) as Row | undefined;
  const all = (sql: string, ...args: any[]): Row[] => db.prepare(sql).all(...args) as Row[];
  const run = (sql: string, ...args: any[]) => db.prepare(sql).run(...args);

  const SELECT = `select a.user_id, a.username, a.is_admin, a.created_at, u.ha_user_id, u.display_name
                    from local_accounts a join users u on u.id = a.user_id`;
  const toAccount = (r: Row): Account => ({
    userId: r.user_id,
    externalId: r.ha_user_id,
    username: r.username,
    displayName: r.display_name,
    isAdmin: r.is_admin === 1,
    createdAt: r.created_at,
  });

  const count = (): number => (one('select count(*) as n from local_accounts')?.n as number) ?? 0;
  const adminCount = (): number => (one('select count(*) as n from local_accounts where is_admin = 1')?.n as number) ?? 0;
  const byUserId = (userId: string): Account | null => {
    const r = one(`${SELECT} where a.user_id = ?`, userId);
    return r ? toAccount(r) : null;
  };
  const accountOrThrow = (userId: string): Account => {
    const a = byUserId(userId);
    if (!a) throw new NotFoundError('Benutzer nicht gefunden');
    return a;
  };

  async function create(input: { username: unknown; displayName?: unknown; password: unknown; isAdmin?: boolean }): Promise<Account> {
    const username = checkUsername(input.username);
    const password = checkPassword(input.password);
    const displayName = typeof input.displayName === 'string' && input.displayName.trim() !== '' ? input.displayName : username;
    const hash = await hashPassword(password);
    return store.transaction(() => {
      if (one('select 1 as x from local_accounts where username = ?', username)) {
        throw new ConflictError('Diesen Benutzernamen gibt es schon');
      }
      // Eine Person gleichen Namens ohne Konto (zum Beispiel aus einem Umzug) bekommt das Konto, statt doppelt zu entstehen
      const name = displayName.trim().toLowerCase();
      const existing = all(
        'select id, ha_user_id from users u where is_person = 1 and not exists (select 1 from local_accounts a where a.user_id = u.id)',
      ).find((u) => {
        const r = one('select display_name, name from users where id = ?', u.id)!;
        return r.display_name.toLowerCase() === name || r.name.toLowerCase() === name;
      });
      if (existing && !existing.ha_user_id) {
        run('update users set ha_user_id = ? where id = ?', `${LOCAL_PREFIX}${randomUUID()}`, existing.id);
      }
      const person = existing
        ? { id: existing.id as string }
        : store.addPerson({ haUserId: `${LOCAL_PREFIX}${randomUUID()}`, name: displayName });
      run(
        'insert into local_accounts (user_id, username, password_hash, is_admin, created_at, password_changed_at) values (?, ?, ?, ?, ?, ?)',
        person.id,
        username,
        hash,
        input.isAdmin ? 1 : 0,
        iso(),
        iso(),
      );
      return accountOrThrow(person.id);
    });
  }

  /** Für eine bestehende Person (ohne Konto) ein Konto anlegen */
  async function createFor(userId: string, input: { username: unknown; password: unknown; isAdmin?: boolean }): Promise<Account> {
    const username = checkUsername(input.username);
    const password = checkPassword(input.password);
    const hash = await hashPassword(password);
    return store.transaction(() => {
      const user = store.userById(userId);
      if (!user) throw new NotFoundError('Person nicht gefunden');
      if (byUserId(userId)) throw new ConflictError('Diese Person hat schon ein Konto');
      if (one('select 1 as x from local_accounts where username = ?', username)) {
        throw new ConflictError('Diesen Benutzernamen gibt es schon');
      }
      if (!user.haUserId) {
        run('update users set ha_user_id = ? where id = ?', `${LOCAL_PREFIX}${randomUUID()}`, userId);
      }
      if (!user.isPerson) store.addPerson({ haUserId: one('select ha_user_id from users where id = ?', userId)!.ha_user_id, name: user.displayName });
      run(
        'insert into local_accounts (user_id, username, password_hash, is_admin, created_at, password_changed_at) values (?, ?, ?, ?, ?, ?)',
        userId,
        username,
        hash,
        input.isAdmin ? 1 : 0,
        iso(),
        iso(),
      );
      return accountOrThrow(userId);
    });
  }

  /** Prüft Benutzername und Passwort. Rechnet auch bei unbekanntem Namen, damit die Antwortzeit nichts verrät. */
  async function verify(username: unknown, password: unknown): Promise<Account | null> {
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > PASSWORD_MAX) return null;
    const row = one('select user_id, password_hash from local_accounts where username = ?', username.trim());
    if (!row) {
      dummyHash ??= hashPassword('kein-konto-keine-antwort');
      await verifyPassword(password, await dummyHash);
      return null;
    }
    return (await verifyPassword(password, row.password_hash)) ? byUserId(row.user_id) : null;
  }

  async function setPassword(userId: string, password: unknown, keepToken?: string): Promise<void> {
    accountOrThrow(userId);
    const hash = await hashPassword(checkPassword(password));
    run('update local_accounts set password_hash = ?, password_changed_at = ? where user_id = ?', hash, iso(), userId);
    endSessions(userId, keepToken); // alle anderen Geräte müssen sich neu anmelden
  }

  function setAdmin(userId: string, isAdmin: boolean): Account {
    const a = accountOrThrow(userId);
    if (a.isAdmin && !isAdmin && adminCount() <= 1) throw new ConflictError('Das ist der letzte Administrator');
    run('update local_accounts set is_admin = ? where user_id = ?', isAdmin ? 1 : 0, userId);
    return accountOrThrow(userId);
  }

  /** Löscht das Konto (Passwort und Sitzungen). Die Person bleibt, ihre Karten und Zuweisungen auch. */
  function remove(userId: string): void {
    const a = accountOrThrow(userId);
    if (a.isAdmin && adminCount() <= 1) throw new ConflictError('Das ist der letzte Administrator');
    store.transaction(() => {
      run('delete from sessions where user_id = ?', userId);
      run('delete from local_accounts where user_id = ?', userId);
    });
  }

  const list = (): Account[] => all(`${SELECT} order by a.created_at, a.rowid`).map(toAccount);

  const byExternalId = (externalId: string): Account | null => {
    const r = one(`${SELECT} where u.ha_user_id = ?`, externalId);
    return r ? toAccount(r) : null;
  };

  // ---------- Sitzungen ----------

  function createSession(userId: string): { token: string; maxAgeSec: number } {
    purgeSessions();
    const token = randomBytes(32).toString('base64url');
    const at = now();
    run(
      'insert into sessions (token_hash, user_id, created_at, last_seen_at, expires_at) values (?, ?, ?, ?, ?)',
      sha256(token),
      userId,
      iso(at),
      iso(at),
      iso(new Date(at.getTime() + SESSION_DAYS * 86_400_000)),
    );
    return { token, maxAgeSec: SESSION_DAYS * 86_400 };
  }

  /** Das Konto zu einem Sitzungs-Token, solange die Sitzung gilt. Eine genutzte Sitzung verlängert sich. */
  function sessionAccount(token: string): Account | null {
    if (!token || token.length > 200) return null;
    const hash = sha256(token);
    const s = one('select user_id, last_seen_at, expires_at from sessions where token_hash = ?', hash);
    if (!s) return null;
    const at = now();
    if (Date.parse(s.expires_at) <= at.getTime()) {
      run('delete from sessions where token_hash = ?', hash);
      return null;
    }
    const account = byUserId(s.user_id);
    if (!account) return null;
    if (at.getTime() - Date.parse(s.last_seen_at) > TOUCH_AFTER_MS) {
      run(
        'update sessions set last_seen_at = ?, expires_at = ? where token_hash = ?',
        iso(at),
        iso(new Date(at.getTime() + SESSION_DAYS * 86_400_000)),
        hash,
      );
    }
    return account;
  }

  const endSession = (token: string): void => void run('delete from sessions where token_hash = ?', sha256(token));

  function endSessions(userId: string, exceptToken?: string): void {
    if (exceptToken) run('delete from sessions where user_id = ? and token_hash <> ?', userId, sha256(exceptToken));
    else run('delete from sessions where user_id = ?', userId);
  }

  function purgeSessions(): number {
    return Number(run('delete from sessions where expires_at <= ?', iso()).changes);
  }

  return {
    count,
    create,
    createFor,
    verify,
    setPassword,
    setAdmin,
    remove,
    list,
    byUserId,
    byExternalId,
    createSession,
    sessionAccount,
    endSession,
    endSessions,
    purgeSessions,
  };
}

export type Accounts = ReturnType<typeof createAccounts>;
