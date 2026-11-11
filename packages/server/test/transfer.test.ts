import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore } from '../src/store.js';
import { exportData, importTransfer, purgeExpiredExport, transferStatus, TRANSFER_DIR } from '../src/transfer.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'stups-umzug-'));

function oldInstall() {
  const dataDir = tmp();
  const db = openDb(join(dataDir, 'stups.sqlite'));
  const store = createStore(db);
  store.ensureDefaultBoard();
  const board = store.listBoards(null)[0]!;
  const view = store.getBoardView(board.id);
  const rene = store.addPerson({ haUserId: 'ha-rene', name: 'Rene' });
  store.createCard(board.id, { title: 'Müll rausbringen', columnId: view.columns[0]!.id }, rene.id);
  mkdirSync(join(dataDir, 'files'));
  writeFileSync(join(dataDir, 'files', 'foto.jpg'), 'bilddaten');
  return { dataDir, db, boardId: board.id };
}

describe('Umzug: Dashboard je Person und Gelesen-Marker', () => {
  it('nimmt dashboard_path und inbox_seen_at mit', () => {
    const { dataDir, db } = oldInstall();
    const store = createStore(db);
    const id = store.people()[0]!.id;
    store.setDashboardPath(id, '/dashboard-handy');
    store.markInboxSeen(id);
    const seen = store.inbox(id).seenAt;
    const share = tmp();
    exportData(db, dataDir, share);
    const newData = tmp();
    const dbPath = join(newData, 'stups.sqlite');
    expect(importTransfer(dbPath, join(newData, 'files'), share)).toBe(true);
    const copy = createStore(openDb(dbPath));
    expect(copy.people()[0]).toMatchObject({ id, dashboardPath: '/dashboard-handy' });
    expect(copy.inbox(id).seenAt).toBe(seen);
  });

  it('ein Export aus einer älteren Version (Stand 22) bleibt lesbar: Dashboard Standard, Marker „jetzt"', () => {
    const dataDir = tmp();
    const file = join(dataDir, 'alt.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 22) });
    old.exec(`insert into users (id, name, display_name, is_person, created_at) values ('u1', 'rene', 'Rene', 1, '2026-01-01T00:00:00.000Z')`);
    const share = tmp();
    exportData(old, dataDir, share);
    const newData = tmp();
    const dbPath = join(newData, 'stups.sqlite');
    expect(importTransfer(dbPath, join(newData, 'files'), share)).toBe(true);
    const store = createStore(openDb(dbPath));
    expect(store.people()[0]).toMatchObject({ id: 'u1', dashboardPath: null });
    expect(store.inbox('u1').seenAt).toMatch(/^2\d{3}-/);
  });
});

describe('Umzug', () => {
  it('exportiert Datenbank und Anhänge, die neue App übernimmt sie beim ersten Start', () => {
    const { dataDir, db } = oldInstall();
    const share = tmp();
    const res = exportData(db, dataDir, share);
    expect(res.files).toBe(true);
    expect(res.bytes).toBeGreaterThan(0);
    expect(existsSync(join(share, TRANSFER_DIR, 'info.json'))).toBe(true);

    // neue App: leerer Datenordner
    const newData = tmp();
    const dbPath = join(newData, 'stups.sqlite');
    expect(importTransfer(dbPath, join(newData, 'files'), share)).toBe(true);
    expect(readFileSync(join(newData, 'files', 'foto.jpg'), 'utf8')).toBe('bilddaten');

    // die Datenbank ist vollständig und wird normal geöffnet (Version bleibt erhalten)
    const copy = openDb(dbPath);
    const store = createStore(copy);
    const board = store.listBoards(null)[0]!;
    expect(store.getBoardView(board.id).cards.map((c) => c.title)).toEqual(['Müll rausbringen']);
  });

  it('nimmt die Bilder der Personen mit', () => {
    const { dataDir, db } = oldInstall();
    mkdirSync(join(dataDir, 'avatars'));
    writeFileSync(join(dataDir, 'avatars', 'u1.img'), 'bild');
    const share = tmp();
    exportData(db, dataDir, share);
    const newData = tmp();
    expect(importTransfer(join(newData, 'stups.sqlite'), join(newData, 'files'), share, join(newData, 'avatars'))).toBe(true);
    expect(readFileSync(join(newData, 'avatars', 'u1.img'), 'utf8')).toBe('bild');
  });

  it('übernimmt nichts, wenn die App schon eigene Daten hat', () => {
    const { dataDir, db } = oldInstall();
    const share = tmp();
    exportData(db, dataDir, share);

    const other = oldInstall(); // hat schon eine Datenbank
    expect(importTransfer(join(other.dataDir, 'stups.sqlite'), join(other.dataDir, 'files'), share)).toBe(false);
  });

  it('ohne Export passiert nichts', () => {
    const data = tmp();
    expect(importTransfer(join(data, 'x.sqlite'), join(data, 'files'), tmp())).toBe(false);
    expect(existsSync(join(data, 'x.sqlite'))).toBe(false);
  });

  it('ein neuer Export ersetzt den alten', () => {
    const { dataDir, db } = oldInstall();
    const share = tmp();
    exportData(db, dataDir, share);
    writeFileSync(join(share, TRANSFER_DIR, 'alt.txt'), 'x');
    exportData(db, dataDir, share);
    expect(existsSync(join(share, TRANSFER_DIR, 'alt.txt'))).toBe(false);
    const check = new DatabaseSync(join(share, TRANSFER_DIR, 'data.sqlite'));
    expect((check.prepare('select count(*) as n from cards').get() as { n: number }).n).toBe(1);
  });

  it('meldet, wenn /share nicht eingebunden ist', () => {
    const { dataDir, db } = oldInstall();
    expect(() => exportData(db, dataDir, join(tmp(), 'gibt-es-nicht'))).toThrow(/nicht eingebunden/);
  });

  describe('Warum findet kein Umzug statt? (Protokollzeile beim Start)', () => {
    it('ein Export liegt bereit: die App übernimmt ihn', () => {
      const { dataDir, db } = oldInstall();
      const share = tmp();
      exportData(db, dataDir, share);
      const s = transferStatus(join(tmp(), 'stups.sqlite'), share);
      expect(s.state).toBe('will-import');
      expect(s.text).toContain(join(share, TRANSFER_DIR, 'data.sqlite'));
    });

    it('die App hat schon Daten: nichts zu melden', () => {
      const { dataDir, db } = oldInstall();
      const share = tmp();
      exportData(db, dataDir, share);
      const other = oldInstall();
      expect(transferStatus(join(other.dataDir, 'stups.sqlite'), share).state).toBe('has-data');
    });

    it('kein Export: nennt die gesuchte Datei und was in /share liegt', () => {
      const share = tmp();
      mkdirSync(join(share, 'etwas-anderes'));
      writeFileSync(join(share, 'datei.txt'), 'x');
      const s = transferStatus(join(tmp(), 'stups.sqlite'), share);
      expect(s.state).toBe('none');
      expect(s.text).toContain(join(share, TRANSFER_DIR, 'data.sqlite'));
      expect(s.text).toContain('etwas-anderes');
      expect(s.text).toContain('datei.txt');
      expect(s.text).toMatch(/Exportieren/);
    });

    it('ein Export-Ordner ohne Datenbank wird erkannt', () => {
      const share = tmp();
      mkdirSync(join(share, TRANSFER_DIR));
      writeFileSync(join(share, TRANSFER_DIR, 'info.json'), '{}');
      const s = transferStatus(join(tmp(), 'stups.sqlite'), share);
      expect(s.state).toBe('none');
      expect(s.text).toContain('data.sqlite');
      expect(s.text).toContain('info.json');
    });

    it('/share leer oder nicht eingebunden', () => {
      expect(transferStatus(join(tmp(), 'stups.sqlite'), tmp()).text).toMatch(/leer/);
      const s = transferStatus(join(tmp(), 'stups.sqlite'), join(tmp(), 'gibt-es-nicht'));
      expect(s.state).toBe('none');
      expect(s.text).toMatch(/nicht eingebunden/);
    });
  });
});

describe('Umzug: Export ohne Geheimnisse, mit Ablaufdatum', () => {
  function withSecrets() {
    const dataDir = tmp();
    const db = openDb(join(dataDir, 'stups.sqlite'));
    const store = createStore(db);
    const rene = store.addPerson({ haUserId: 'local:abc', name: 'Rene' });
    const secret = store.pushSecret();
    db.exec(`insert into local_accounts (user_id, username, password_hash, is_admin, created_at, password_changed_at)
             values ('${rene.id}', 'rene', 'scrypt$GEHEIMER-HASH', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`);
    db.exec(`insert into sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
             values ('SITZUNGS-HASH', '${rene.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')`);
    db.exec(`insert into passkeys (id, user_id, credential_id, public_key, name, created_at)
             values ('p1', '${rene.id}', 'CRED-ID', x'0102', 'Handy', '2026-01-01T00:00:00.000Z')`);
    return { dataDir, db, rene, secret };
  }

  it('S7: schreibt weder Push-Geheimnis noch Passwort-Hashes, Sitzungen oder Passkeys in den Export', () => {
    const { dataDir, db, rene, secret } = withSecrets();
    const share = tmp();
    const res = exportData(db, dataDir, share, new Date('2026-11-01T10:00:00Z'));
    const raw = readFileSync(join(res.dir, 'data.sqlite'));
    for (const needle of [secret, 'GEHEIMER-HASH', 'SITZUNGS-HASH', 'CRED-ID']) expect(raw.includes(needle)).toBe(false);

    const copy = new DatabaseSync(join(res.dir, 'data.sqlite'));
    expect(copy.prepare('select count(*) as n from sessions').get()).toEqual({ n: 0 });
    expect(copy.prepare('select count(*) as n from passkeys').get()).toEqual({ n: 0 });
    expect(copy.prepare(`select count(*) as n from settings where key = 'pushSecret'`).get()).toEqual({ n: 0 });
    // Das Konto bleibt, aber ohne Passwort: ein Administrator vergibt ein neues
    expect(copy.prepare('select username, password_hash from local_accounts').get()).toEqual({ username: 'rene', password_hash: '!' });
    copy.close();
    // Die laufende App behält ihre Daten
    expect(db.prepare('select count(*) as n from sessions').get()).toEqual({ n: 1 });
    expect(createStore(db).pushSecret()).toBe(secret);
    expect(rene.id).toBeTruthy();
  });

  // Unter Windows gibt es keine Unix-Rechte
  it.skipIf(process.platform === 'win32')('S7: Rechte 0700 für den Ordner und 0600 für Dateien, Ablaufdatum nach 24 Stunden', () => {
    const { dataDir, db } = withSecrets();
    mkdirSync(join(dataDir, 'files'));
    writeFileSync(join(dataDir, 'files', 'a.txt'), 'x');
    const share = tmp();
    const res = exportData(db, dataDir, share, new Date('2026-11-01T10:00:00Z'));
    expect(statSync(res.dir).mode & 0o777).toBe(0o700);
    for (const f of ['data.sqlite', 'info.json', 'files/a.txt']) expect(statSync(join(res.dir, f)).mode & 0o777).toBe(0o600);
    const info = JSON.parse(readFileSync(join(res.dir, 'info.json'), 'utf8'));
    expect(info.expiresAt).toBe('2026-11-02T10:00:00.000Z');
    expect(res.expiresAt).toBe('2026-11-02T10:00:00.000Z');
  });

  it('S7: die neue App löscht den Export nach dem erfolgreichen Import', () => {
    const { dataDir, db } = withSecrets();
    const share = tmp();
    exportData(db, dataDir, share);
    const newData = tmp();
    expect(importTransfer(join(newData, 'stups.sqlite'), join(newData, 'files'), share)).toBe(true);
    expect(existsSync(join(share, TRANSFER_DIR))).toBe(false);
  });

  it('S7: ein abgelaufener Export wird beim Start gelöscht, ein gültiger und ein älterer ohne Ablaufdatum bleiben', () => {
    const { dataDir, db } = withSecrets();
    const share = tmp();
    exportData(db, dataDir, share, new Date('2026-11-01T10:00:00Z'));
    expect(purgeExpiredExport(share, new Date('2026-11-02T09:59:00Z'))).toBe(false);
    expect(existsSync(join(share, TRANSFER_DIR, 'data.sqlite'))).toBe(true);
    expect(purgeExpiredExport(share, new Date('2026-11-02T10:01:00Z'))).toBe(true);
    expect(existsSync(join(share, TRANSFER_DIR))).toBe(false);

    exportData(db, dataDir, share);
    writeFileSync(join(share, TRANSFER_DIR, 'info.json'), JSON.stringify({ exportedAt: '2026-01-01T00:00:00.000Z' })); // älterer Export
    expect(purgeExpiredExport(share, new Date('2030-01-01T00:00:00Z'))).toBe(false);
    const target = tmp();
    expect(importTransfer(join(target, 'stups.sqlite'), join(target, 'files'), share)).toBe(true);
  });
});

describe('Umzug: Wiederholung mit Zeitfenster und Toleranz', () => {
  it('Export und Import behalten lateTolerance und window', () => {
    const { dataDir, db, boardId } = oldInstall();
    const store = createStore(db);
    const col = store.getBoardView(boardId).columns[0]!;
    const tolerant = { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 } as const;
    const hourly = { type: 'fixed', freq: 'hourly', every: 3, window: { from: '08:00', to: '20:00' } } as const;
    store.createCard(boardId, { title: 'Bad', columnId: col.id, dueAt: '2026-11-14T09:00:00Z', recurrence: tolerant }, null);
    store.createCard(boardId, { title: 'Trinken', columnId: col.id, dueAt: '2026-11-14T09:00:00Z', recurrence: hourly }, null);
    const share = tmp();
    exportData(db, dataDir, share);
    const newData = tmp();
    const dbPath = join(newData, 'stups.sqlite');
    expect(importTransfer(dbPath, join(newData, 'files'), share)).toBe(true);
    const copy = createStore(openDb(dbPath));
    const recs = copy.getBoardView(boardId).cards.map((c) => c.recurrence);
    expect(recs).toEqual(expect.arrayContaining([tolerant, hourly]));
  });
});
