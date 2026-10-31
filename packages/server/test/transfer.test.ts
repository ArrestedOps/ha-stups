import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';
import { exportData, importTransfer, TRANSFER_DIR } from '../src/transfer.js';

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
});
