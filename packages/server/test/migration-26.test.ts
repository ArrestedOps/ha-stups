import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T = '2026-11-01T08:00:00.000Z';
const TABLES = ['users', 'boards', 'columns', 'cards', 'watchers', 'watcher_state'];

/** Eine Datenbank im Stand 25 mit Board, Karte und zwei Wächtern */
function buildBefore(file: string): number {
  const before = Math.max(...migrations.map((m) => m.version).filter((v) => v < 26));
  const db = openDb(file, { migrations: migrations.filter((m) => m.version < 26) });
  db.exec(`
    insert into users (id, name, display_name, is_person, created_at) values ('u1', 'anna', 'Anna', 1, '${T}');
    insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
    insert into columns (id, board_id, name, position, is_done) values ('c1', 'b1', 'Offen', 'a0', 0);
    insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1', 'b1', 'c1', 'a0', 'Müll raus', '${T}', '${T}');
  `);
  for (const [id, n] of [['w1', 'Batterie schwach'], ['w2', 'Waschmaschine fertig']] as const) {
    db.prepare(
      `insert into watchers (id, name, active, trigger_json, card_json, assign_json, position, created_at, updated_at) values (?, ?, 1, '{}', '{}', '{}', 0, ?, ?)`,
    ).run(id, n, T, T);
    db.prepare('insert into watcher_state (watcher_id) values (?)').run(id);
  }
  db.close();
  return before;
}

describe('Migration 26 (Kategorie am Wächter)', () => {
  it('fügt nur eine Spalte hinzu und fasst nichts Vorhandenes an', () => {
    const m = migrations.find((x) => x.version === 26)!;
    expect(m).toBeDefined();
    expect(m.sql).toMatch(/alter table watchers add column category text/);
    expect(m.sql).not.toMatch(/drop table|rename|delete from|update /i);
  });

  it('hebt einen älteren Stand an: Wächter bleiben, ohne Kategorie, Sicherung vorher', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m26-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    const before = buildBefore(file);

    const old = new DatabaseSync(file);
    const snap = Object.fromEntries(TABLES.map((t) => [t, old.prepare(`select * from ${t} order by 1`).all()]));
    old.close();

    const db = openDb(file, { migrations, backupDir });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    for (const t of TABLES) {
      const now = db.prepare(`select * from ${t} order by 1`).all() as Record<string, unknown>[];
      // alles, was es vorher gab, ist unverändert; bei den Wächtern kommt nur `category` (leer) dazu
      expect(now.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !(t === 'watchers' && k === 'category')))), t).toEqual(snap[t]);
    }
    expect(db.prepare('select id, category from watchers order by id').all()).toEqual([
      { id: 'w1', category: null },
      { id: 'w2', category: null },
    ]);
    expect(existsSync(backupDir)).toBe(true);
    const backups = readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(new RegExp(`^stups-v${before}-`));
    db.close();
  });

  it('rollt bei einem Fehler zurück und lässt den alten Stand stehen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m26-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const before = buildBefore(file);
    const broken = [...migrations.filter((m) => m.version < 26), { version: 26, sql: 'alter table watchers add column category text; this is not sql;' }];
    expect(() => openDb(file, { migrations: broken })).toThrow();
    const db = new DatabaseSync(file);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(before);
    expect(db.prepare("select count(*) as n from pragma_table_info('watchers') where name = 'category'").get()).toEqual({ n: 0 });
    db.close();
  });
});
