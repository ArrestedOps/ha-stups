import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore } from '../src/store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T = '2026-11-01T08:00:00.000Z';

describe('Migration 29 (Boards archivieren)', () => {
  it('hängt archived_at an die Boards: Bestandsboards sind nicht archiviert, Karten, Spalten und Reihenfolge bleiben', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m29-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version < 29) });
    old.exec(`
      insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
      insert into boards (id, name, position, created_at, updated_at) values ('b2', 'Bad-Umbau', 'a1', '${T}', '${T}');
      insert into columns (id, board_id, name, position, is_done) values ('c1', 'b1', 'Offen', 'a0', 0);
      insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1', 'b1', 'c1', 'a0', 'Müll', '${T}', '${T}');
    `);
    old.close();

    const db = openDb(file, { migrations, backupDir: join(dir, 'backups') });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    expect(db.prepare('select id, position, archived_at from boards order by position').all()).toEqual([
      { id: 'b1', position: 'a0', archived_at: null },
      { id: 'b2', position: 'a1', archived_at: null },
    ]);
    expect(db.prepare('select count(*) as n from cards').get()).toEqual({ n: 1 });

    // die Boards sind sichtbar und lassen sich archivieren und zurückholen
    const store = createStore(db);
    expect(store.listBoards(null).map((b) => b.id)).toEqual(['b1', 'b2']);
    store.archiveBoard('b2', null);
    expect(store.listBoards(null).map((b) => b.id)).toEqual(['b1']);
    expect(store.listArchivedBoards(null).map((b) => b.id)).toEqual(['b2']);
    store.unarchiveBoard('b2');
    expect(store.listBoards(null).map((b) => b.id)).toEqual(['b1', 'b2']);
    db.close();
  });
});
