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

describe('openDb: Tabellenumbauten dürfen keine abhängigen Zeilen löschen', () => {
  const base: Migration[] = [
    {
      version: 1,
      sql: `
        create table parent (id text primary key, name text not null);
        create table child (id text primary key, parent_id text not null references parent(id) on delete cascade);
      `,
    },
  ];
  const seed = (path: string) => {
    const db = openDb(path, { migrations: base });
    db.exec(`insert into parent values ('p1', 'eins'); insert into child values ('c1', 'p1'), ('c2', 'p1');`);
    db.close();
  };
  const count = (db: DatabaseSync, table: string) => (db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;

  it('ein Umbau mit drop table (wie Migration 20) lässt die Kindzeilen bestehen (on delete cascade greift nicht)', () => {
    const path = join(tmp(), 'umbau.sqlite');
    seed(path);
    const rebuild: Migration = {
      version: 2,
      sql: `
        create table parent_new (id text primary key, name text not null, extra text);
        insert into parent_new (id, name) select id, name from parent;
        drop table parent;
        alter table parent_new rename to parent;
      `,
    };
    const db = openDb(path, { migrations: [...base, rebuild] });
    expect(count(db, 'parent')).toBe(1);
    expect(count(db, 'child')).toBe(2);
    expect((db.prepare('pragma foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1); // danach wieder an
    db.close();
  });

  it('ein Umbau, der Fremdschlüssel verletzt, wird zurückgerollt und gemeldet', () => {
    const path = join(tmp(), 'kaputt.sqlite');
    seed(path);
    const broken: Migration = { version: 2, sql: `delete from parent; alter table parent add column x text;` };
    expect(() => openDb(path, { migrations: [...base, broken] })).toThrow(/Fremdschlüssel/);
    const db = new DatabaseSync(path);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(1);
    expect(count(db, 'parent')).toBe(1);
    expect(count(db, 'child')).toBe(2);
    db.close();
  });
});
