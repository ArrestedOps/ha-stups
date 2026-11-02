import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPassword, checkUsername, createAccounts, hashPassword, isLocalId, verifyPassword, type Accounts } from '../src/accounts.js';
import { createLocalDirectory } from '../src/directory.js';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore, type Store } from '../src/store.js';

let now: Date;
let db: ReturnType<typeof openDb>;
let store: Store;
let accounts: Accounts;

beforeEach(() => {
  now = new Date('2026-11-01T10:00:00Z');
  db = openDb(':memory:');
  store = createStore(db, { now: () => now });
  accounts = createAccounts(db, store, { now: () => now });
});

const PW = 'ein-langes-passwort';

describe('Passwort', () => {
  it('hasht mit scrypt, mit Salz, und prüft wieder', async () => {
    const a = await hashPassword(PW);
    const b = await hashPassword(PW);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PW);
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword('falsch-falsch-falsch', a)).toBe(false);
  });

  it('weist kaputte Hashes ab, ohne zu werfen', async () => {
    expect(await verifyPassword(PW, '')).toBe(false);
    expect(await verifyPassword(PW, 'md5$abc')).toBe(false);
    expect(await verifyPassword(PW, 'scrypt$x$y$z$a$b')).toBe(false);
  });

  it('gleiche Zeichen in anderer Unicode-Form sind dasselbe Passwort', async () => {
    const h = await hashPassword('Pässwörter-sind-schön');
    expect(await verifyPassword('Pässwörter-sind-schön', h)).toBe(true);
  });

  it('Regeln: mindestens 10 Zeichen, höchstens 200', () => {
    expect(() => checkPassword('kurz')).toThrow(/zu kurz/);
    expect(() => checkPassword('x'.repeat(201))).toThrow(/zu lang/);
    expect(() => checkPassword(undefined)).toThrow(/fehlt/);
    expect(checkPassword('x'.repeat(10))).toBe('x'.repeat(10));
  });

  it('Benutzername: 2 bis 32 Zeichen, nur Buchstaben, Ziffern, Punkt, Minus, Unterstrich', () => {
    expect(checkUsername(' anna ')).toBe('anna');
    for (const bad of ['', ' ', 'a', '.anna', 'an na', 'anna!', 'x'.repeat(33), 5]) expect(() => checkUsername(bad)).toThrow();
  });
});

describe('Konto anlegen', () => {
  it('legt Person und Konto an; die Kennung beginnt mit local:', async () => {
    const a = await accounts.create({ username: 'Anna', displayName: 'Anna Beispiel', password: PW, isAdmin: true });
    expect(a).toMatchObject({ username: 'Anna', displayName: 'Anna Beispiel', isAdmin: true });
    expect(isLocalId(a.externalId)).toBe(true);
    const person = store.userById(a.userId)!;
    expect(person).toMatchObject({ isPerson: true, haUserId: a.externalId, displayName: 'Anna Beispiel' });
    expect(accounts.count()).toBe(1);
  });

  it('speichert nie das Passwort im Klartext', async () => {
    await accounts.create({ username: 'anna', password: PW });
    const row = db.prepare('select password_hash from local_accounts').get() as { password_hash: string };
    expect(row.password_hash).not.toContain(PW);
  });

  it('Anzeigename ist ohne Angabe der Benutzername', async () => {
    expect((await accounts.create({ username: 'ben', password: PW })).displayName).toBe('ben');
  });

  it('Benutzernamen sind eindeutig, auch in anderer Schreibweise', async () => {
    await accounts.create({ username: 'anna', password: PW });
    await expect(accounts.create({ username: 'ANNA', displayName: 'Andere', password: PW })).rejects.toThrow(/gibt es schon/);
    expect(accounts.count()).toBe(1);
  });

  it('prüft vor dem Anlegen: zu kurzes Passwort legt nichts an', async () => {
    await expect(accounts.create({ username: 'anna', password: 'kurz' })).rejects.toThrow(/zu kurz/);
    expect(accounts.count()).toBe(0);
    expect(store.people()).toHaveLength(0);
  });

  it('eine schon vorhandene Person gleichen Namens bekommt das Konto, ihre Karten bleiben ihr', async () => {
    const board = store.createBoard({ name: 'Haushalt' });
    const col = store.getBoardView(board.id).columns[0]!.id;
    const vorher = store.addPerson({ name: 'Anna' });
    const card = store.createCard(board.id, { columnId: col, title: 'Bad', assigneeIds: [vorher.id] }, vorher.id);
    const a = await accounts.create({ username: 'anna', displayName: 'Anna', password: PW });
    expect(a.userId).toBe(vorher.id);
    expect(store.getCard(card.id).assigneeIds).toEqual([vorher.id]);
  });

  it('eine Person aus einem Umzug (mit Kennung von Home Assistant) bekommt das Konto, ohne doppelt zu entstehen', async () => {
    const umgezogen = store.addPerson({ haUserId: 'ha-rene-alt', name: 'René' });
    const a = await accounts.create({ username: 'rene', displayName: 'rené', password: PW, isAdmin: true });
    expect(a.userId).toBe(umgezogen.id);
    expect(a.externalId).toBe('ha-rene-alt');
    expect(store.people()).toHaveLength(1);
    expect((await createLocalDirectory(accounts).isAdmin('ha-rene-alt'))).toBe(true);
    // ein zweites Konto gleichen Namens bekommt eine eigene Person
    const b = await accounts.create({ username: 'rene2', displayName: 'René', password: PW });
    expect(b.userId).not.toBe(umgezogen.id);
  });

  it('createFor: Konto für eine Person ohne Anmeldung', async () => {
    const kind = store.addPerson({ name: 'Mia' });
    const a = await accounts.createFor(kind.id, { username: 'mia', password: PW });
    expect(a.userId).toBe(kind.id);
    expect(isLocalId(store.userById(kind.id)!.haUserId!)).toBe(true);
    await expect(accounts.createFor(kind.id, { username: 'mia2', password: PW })).rejects.toThrow(/schon ein Konto/);
    await expect(accounts.createFor('gibt-es-nicht', { username: 'x1', password: PW })).rejects.toThrow(/nicht gefunden/);
  });
});

describe('Anmelden', () => {
  it('richtiges Passwort, Namen ohne Rücksicht auf Groß- und Kleinschreibung', async () => {
    await accounts.create({ username: 'Anna', password: PW });
    expect((await accounts.verify('anna', PW))?.username).toBe('Anna');
    expect((await accounts.verify('ANNA', PW))?.username).toBe('Anna');
  });

  it('falsches Passwort, unbekannter Name und falsche Typen geben null', async () => {
    await accounts.create({ username: 'anna', password: PW });
    expect(await accounts.verify('anna', 'falsch-falsch')).toBeNull();
    expect(await accounts.verify('niemand', PW)).toBeNull();
    expect(await accounts.verify(undefined, PW)).toBeNull();
    expect(await accounts.verify('anna', { $ne: 1 })).toBeNull();
    expect(await accounts.verify('anna', 'x'.repeat(5000))).toBeNull();
  });
});

describe('Sitzungen', () => {
  it('ein Token gehört zu genau einem Konto; in der Datenbank steht nur sein Hash', async () => {
    const a = await accounts.create({ username: 'anna', password: PW });
    const { token } = accounts.createSession(a.userId);
    expect(accounts.sessionAccount(token)?.userId).toBe(a.userId);
    expect(accounts.sessionAccount(token + 'x')).toBeNull();
    expect(accounts.sessionAccount('')).toBeNull();
    const row = db.prepare('select token_hash from sessions').get() as { token_hash: string };
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('läuft nach 30 Tagen ab, eine genutzte Sitzung verlängert sich', async () => {
    const a = await accounts.create({ username: 'anna', password: PW });
    const { token } = accounts.createSession(a.userId);
    now = new Date(now.getTime() + 20 * 86_400_000);
    expect(accounts.sessionAccount(token)).not.toBeNull(); // verlängert bis Tag 50
    now = new Date(now.getTime() + 20 * 86_400_000);
    expect(accounts.sessionAccount(token)).not.toBeNull();
    now = new Date(now.getTime() + 31 * 86_400_000);
    expect(accounts.sessionAccount(token)).toBeNull();
    expect(db.prepare('select count(*) as n from sessions').get()).toEqual({ n: 0 });
  });

  it('endSession meldet ab, endSessions alle Geräte außer einem', async () => {
    const a = await accounts.create({ username: 'anna', password: PW });
    const s1 = accounts.createSession(a.userId).token;
    const s2 = accounts.createSession(a.userId).token;
    const s3 = accounts.createSession(a.userId).token;
    accounts.endSession(s1);
    expect(accounts.sessionAccount(s1)).toBeNull();
    accounts.endSessions(a.userId, s3);
    expect(accounts.sessionAccount(s2)).toBeNull();
    expect(accounts.sessionAccount(s3)).not.toBeNull();
  });

  it('ein neues Passwort beendet die anderen Sitzungen', async () => {
    const a = await accounts.create({ username: 'anna', password: PW });
    const alt = accounts.createSession(a.userId).token;
    const hier = accounts.createSession(a.userId).token;
    await accounts.setPassword(a.userId, 'ganz-neues-passwort', hier);
    expect(accounts.sessionAccount(alt)).toBeNull();
    expect(accounts.sessionAccount(hier)).not.toBeNull();
    expect(await accounts.verify('anna', PW)).toBeNull();
    expect(await accounts.verify('anna', 'ganz-neues-passwort')).not.toBeNull();
  });

  it('purgeSessions räumt Abgelaufene weg', async () => {
    const a = await accounts.create({ username: 'anna', password: PW });
    accounts.createSession(a.userId);
    now = new Date(now.getTime() + 40 * 86_400_000);
    expect(accounts.purgeSessions()).toBe(1);
  });
});

describe('Administratoren und Entfernen', () => {
  it('der letzte Administrator bleibt', async () => {
    const a = await accounts.create({ username: 'anna', password: PW, isAdmin: true });
    expect(() => accounts.setAdmin(a.userId, false)).toThrow(/letzte Administrator/);
    expect(() => accounts.remove(a.userId)).toThrow(/letzte Administrator/);
    const b = await accounts.create({ username: 'ben', password: PW, isAdmin: true });
    expect(accounts.setAdmin(a.userId, false).isAdmin).toBe(false);
    expect(() => accounts.remove(b.userId)).toThrow(/letzte Administrator/);
  });

  it('Entfernen löscht Konto und Sitzungen, die Person und ihre Karten bleiben', async () => {
    await accounts.create({ username: 'chef', password: PW, isAdmin: true });
    const b = await accounts.create({ username: 'ben', password: PW });
    const token = accounts.createSession(b.userId).token;
    accounts.remove(b.userId);
    expect(accounts.byUserId(b.userId)).toBeNull();
    expect(accounts.sessionAccount(token)).toBeNull();
    expect(store.userById(b.userId)).not.toBeNull();
    expect(await accounts.verify('ben', PW)).toBeNull();
  });

  it('Verzeichnis: Administrator ist, wer es im Konto ist; Unbekannte nie', async () => {
    const admin = await accounts.create({ username: 'anna', password: PW, isAdmin: true });
    const member = await accounts.create({ username: 'ben', password: PW });
    const dir = createLocalDirectory(accounts);
    expect(await dir.isAdmin(admin.externalId)).toBe(true);
    expect(await dir.isAdmin(member.externalId)).toBe(false);
    expect(await dir.isAdmin('local:unbekannt')).toBe(false);
    expect(await dir.isAdmin('ha-irgendwer')).toBe(false);
    expect(await dir.persons()).toEqual([]);
  });

  it('Verzeichnis mit Home Assistant daneben: seine Personen sind Vorschläge, Administrator bleibt, wer es im Konto ist', async () => {
    const member = await accounts.create({ username: 'ben', password: PW });
    const dir = createLocalDirectory(accounts, async () => [{ name: 'Conny', userId: 'ha-conny' }]);
    expect(await dir.persons()).toEqual([{ name: 'Conny', userId: 'ha-conny' }]);
    // auch ein Administrator in Home Assistant macht niemanden in Stups zum Administrator
    expect(await dir.isAdmin(member.externalId)).toBe(false);
    expect(await dir.isAdmin('ha-conny')).toBe(false);
  });
});

describe('Migration 11', () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('übernimmt eine Datenbank im Stand 10 ohne Verlust und legt die neuen Tabellen an', () => {
    dir = mkdtempSync(join(tmpdir(), 'stups-'));
    const file = join(dir, 'stups.sqlite');
    const alt = openDb(file, { migrations: migrations.filter((m) => m.version <= 10) });
    alt.prepare("insert into users (id, ha_user_id, name, display_name, is_person, created_at) values ('u1', 'ha-rene', 'rene', 'René', 1, '2026-01-01T00:00:00Z')").run();
    alt.close();

    const neu = openDb(file, { backupDir: join(dir, 'backups') });
    expect((neu.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    expect(neu.prepare('select ha_user_id, display_name from users').all()).toEqual([{ ha_user_id: 'ha-rene', display_name: 'René' }]);
    expect(neu.prepare('select count(*) as n from local_accounts').get()).toEqual({ n: 0 });
    expect(neu.prepare('select count(*) as n from sessions').get()).toEqual({ n: 0 });
    neu.close();
  });
});
