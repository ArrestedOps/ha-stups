import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type Migration } from '../src/db.js';
import { migrations } from '../src/migrations.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'stups-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tables(db: DatabaseSync): string[] {
  return (
    db.prepare("select name from sqlite_master where type='table' order by name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);
}

describe('openDb', () => {
  it('migrates an empty database to the latest version', () => {
    const db = openDb(':memory:');
    const latest = migrations[migrations.length - 1]!.version;
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(latest);
    expect(tables(db)).toEqual(
      expect.arrayContaining([
        'users',
        'boards',
        'columns',
        'categories',
        'cards',
        'card_categories',
        'card_assignees',
        'checklist_items',
        'links',
        'completions',
      ]),
    );
  });

  it('enables foreign keys', () => {
    const db = openDb(':memory:');
    expect((db.prepare('pragma foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1);
  });

  it('is idempotent when opened twice', () => {
    const dir = tmp();
    const file = join(dir, 'k.sqlite');
    openDb(file).close();
    const db = openDb(file);
    expect(tables(db)).toContain('cards');
    db.close();
  });

  it('keeps data and backs up the file before applying a newer migration', () => {
    const dir = tmp();
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    const v1: Migration[] = [{ version: 1, sql: 'create table t (a text);' }];
    const db1 = openDb(file, { migrations: v1, backupDir });
    db1.prepare('insert into t values (?)').run('keep');
    db1.close();
    expect(existsSync(backupDir)).toBe(false); // fresh database: nothing to back up

    const v2: Migration[] = [...v1, { version: 2, sql: 'alter table t add column b text;' }];
    const db2 = openDb(file, { migrations: v2, backupDir, now: () => new Date('2026-10-30T10:00:00Z') });
    expect(db2.prepare('select a from t').all()).toEqual([{ a: 'keep' }]);
    db2.close();

    const backups = readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^stups-v1-/);
  });

  it('keeps only the five newest backups', () => {
    const dir = tmp();
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    let migs: Migration[] = [{ version: 1, sql: 'create table t (a text);' }];
    openDb(file, { migrations: migs, backupDir }).close();
    for (let v = 2; v <= 9; v++) {
      migs = [...migs, { version: v, sql: `alter table t add column c${v} text;` }];
      openDb(file, { migrations: migs, backupDir, now: () => new Date(Date.UTC(2026, 9, v)) }).close();
    }
    expect(readdirSync(backupDir)).toHaveLength(5);
  });

  it('rolls back a failing migration and leaves the version untouched', () => {
    const dir = tmp();
    const file = join(dir, 'k.sqlite');
    const ok: Migration[] = [{ version: 1, sql: 'create table t (a text);' }];
    openDb(file, { migrations: ok }).close();
    const bad: Migration[] = [...ok, { version: 2, sql: 'create table u (x text); this is not sql;' }];
    expect(() => openDb(file, { migrations: bad })).toThrow();
    const db = new DatabaseSync(file);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(1);
    expect(tables(db)).not.toContain('u');
    db.close();
  });
});
