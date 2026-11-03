import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';
import { exportData, importTransfer, transferStatus, TRANSFER_DIR } from '../src/transfer.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'stups-umzug-'));

function oldInstall() {
  const dataDir = tmp();
  const db = openDb(join(dataDir, 'stups.sqlite'));
  const store = createStore(db);
  store.ensureDefaultBoard();
  const board = store.listBoards()[0]!;
  const view = store.getBoardView(board.id);
  const rene = store.addPerson({ haUserId: 'ha-rene', name: 'Rene' });
  store.createCard(board.id, { title: 'Müll rausbringen', columnId: view.columns[0]!.id }, rene.id);
  mkdirSync(join(dataDir, 'files'));
  writeFileSync(join(dataDir, 'files', 'foto.jpg'), 'bilddaten');
  return { dataDir, db, boardId: board.id };
}

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
    const board = store.listBoards()[0]!;
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