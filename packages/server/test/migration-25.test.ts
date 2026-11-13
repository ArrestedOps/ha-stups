import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { withoutLater } from './helpers/later-columns.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T = '2026-11-01T08:00:00.000Z';
const TABLES = ['users', 'boards', 'columns', 'cards', 'comments'];

/** Eine Datenbank im Stand 24 (oder 23, falls es 24 noch nicht gibt) mit zwei Personen, Board und Aufgabe */
function buildBefore(file: string): number {
  const before = Math.max(...migrations.map((m) => m.version).filter((v) => v < 25));
  const db = openDb(file, { migrations: migrations.filter((m) => m.version < 25) });
  db.exec(`
    insert into users (id, name, display_name, is_person, created_at) values ('u1', 'anna', 'Anna', 1, '${T}'), ('u2', 'ben', 'Ben', 1, '${T}');
    insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
    insert into columns (id, board_id, name, position, is_done) values ('c1', 'b1', 'Offen', 'a0', 0);
    insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1', 'b1', 'c1', 'a0', 'Müll raus', '${T}', '${T}');
    insert into comments (id, card_id, author_id, text, created_at) values ('m1', 'k1', 'u1', 'Hi', '${T}');
  `);
  db.close();
  return before;
}

describe('Migration 25 (Berechtigungen je Person)', () => {
  it('legt nur eine neue Tabelle an und fasst nichts Vorhandenes an', () => {
    const m = migrations.find((x) => x.version === 25)!;
    expect(m).toBeDefined();
    expect(m.sql).toMatch(/create table user_permissions/);
    expect(m.sql).not.toMatch(/drop table|alter table|rename|delete from|update /i);
  });

  it('hebt einen älteren Stand an: Daten bleiben, niemand hat Berechtigungen, Sicherung vorher', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m25-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    const before = buildBefore(file);

    const old = new DatabaseSync(file);
    const snap = Object.fromEntries(TABLES.map((t) => [t, old.prepare(`select * from ${t} order by 1`).all()]));
    old.close();

    const db = openDb(file, { migrations, backupDir });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    for (const t of TABLES) expect(withoutLater(t, db.prepare(`select * from ${t} order by 1`).all() as Record<string, unknown>[]), t).toEqual(withoutLater(t, snap[t] as Record<string, unknown>[]));
    expect(db.prepare('select count(*) as n from user_permissions').get()).toEqual({ n: 0 });

    expect(existsSync(backupDir)).toBe(true);
    const backups = readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(new RegExp(`^stups-v${before}-`));
    db.close();
  });

  it('löscht die Berechtigungen mit der Person und erlaubt je Person jedes Recht nur einmal', () => {
    const db = openDb(':memory:');
    db.exec(`insert into users (id, name, display_name, is_person, created_at) values ('u1', 'anna', 'Anna', 1, '${T}')`);
    db.exec(`insert into user_permissions (user_id, permission) values ('u1', 'watchers')`);
    expect(() => db.exec(`insert into user_permissions (user_id, permission) values ('u1', 'watchers')`)).toThrow();
    expect(() => db.exec(`insert into user_permissions (user_id, permission) values ('nobody', 'watchers')`)).toThrow();
    db.exec(`delete from users where id = 'u1'`);
    expect(db.prepare('select count(*) as n from user_permissions').get()).toEqual({ n: 0 });
  });

  it('rollt bei einem Fehler zurück und lässt den alten Stand stehen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m25-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const before = buildBefore(file);
    const broken = [...migrations.filter((m) => m.version < 25), { version: 25, sql: 'create table user_permissions (user_id text); this is not sql;' }];
    expect(() => openDb(file, { migrations: broken })).toThrow();
    const db = new DatabaseSync(file);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(before);
    expect(db.prepare("select count(*) as n from sqlite_master where name = 'user_permissions'").get()).toEqual({ n: 0 });
    db.close();
  });
});
