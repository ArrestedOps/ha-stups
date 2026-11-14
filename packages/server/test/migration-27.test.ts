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

/** Eine Datenbank im Stand 26: Person, Board mit Aufgabe, Wächter mit Läufen, Wartelisten und Vorschlag */
function buildBefore(file: string): number {
  const before = Math.max(...migrations.map((m) => m.version).filter((v) => v < 27));
  const db = openDb(file, { migrations: migrations.filter((m) => m.version < 27) });
  db.exec(`
    insert into users (id, name, display_name, is_person, created_at) values ('u1', 'anna', 'Anna', 1, '${T}');
    insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
    insert into columns (id, board_id, name, position, is_done) values ('c1', 'b1', 'Offen', 'a0', 0);
    insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1', 'b1', 'c1', 'a0', 'Müll raus', '${T}', '${T}');
    insert into watchers (id, name, active, trigger_json, card_json, assign_json, status, position, created_at, updated_at)
      values ('w1', 'Batterie schwach', 1, '{}', '{}', '{}', 'entity_missing', 0, '${T}', '${T}');
    insert into watcher_state (watcher_id) values ('w1');
    insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to, note) values ('r1', 'w1', '${T}', 'created', 'k1', '["u1"]', 'x'), ('r2', 'w1', '${T}', 'suggest_fallback', null, '[]', null);
    insert into watcher_waiting (card_id, watcher_id, since) values ('k1', 'w1', '${T}');
  `);
  db.close();
  return before;
}

describe('Migration 27 (Boards: Sichtbarkeit und Fairness, Wächter-Regeln)', () => {
  it('hebt einen Stand 26 an: Bestandsboards bleiben für alle sichtbar und zählen, Wächter und Läufe bleiben, Sicherung vorher', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m27-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    const before = buildBefore(file);

    const db = openDb(file, { migrations, backupDir });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    expect(migrations.at(-1)!.version).toBeGreaterThanOrEqual(27);

    // Bestandsboards: für alle, ohne Besitzer, zählen zur Fairness
    expect(db.prepare('select id, visibility, owner_id, counts_for_fairness from boards').all()).toEqual([
      { id: 'b1', visibility: 'all', owner_id: null, counts_for_fairness: 1 },
    ]);
    expect(db.prepare('select count(*) as n from board_members').get()).toEqual({ n: 0 });
    // Wächter: zählt zur Fairness, nicht ohne Zuständige; der alte Status bleibt
    expect(db.prepare('select id, status, counts_for_fairness, assignees_missing from watchers').all()).toEqual([
      { id: 'w1', status: 'entity_missing', counts_for_fairness: 1, assignees_missing: 0 },
    ]);
    // Läufe bleiben vollständig (Tabellenumbau), abhängige Tabellen auch
    expect(db.prepare('select id, result, card_id, assigned_to, note from watcher_runs order by id').all()).toEqual([
      { id: 'r1', result: 'created', card_id: 'k1', assigned_to: '["u1"]', note: 'x' },
      { id: 'r2', result: 'suggest_fallback', card_id: null, assigned_to: '[]', note: null },
    ]);
    expect(db.prepare('select count(*) as n from watcher_state').get()).toEqual({ n: 1 });
    expect(db.prepare('select count(*) as n from watcher_waiting').get()).toEqual({ n: 1 });
    expect(db.prepare('select count(*) as n from cards').get()).toEqual({ n: 1 });
    // das neue Ergebnis und die Mitteilungen gibt es
    db.prepare(`insert into watcher_runs (id, watcher_id, at, result) values ('r3', 'w1', '${T}', 'no_assignees')`).run();
    db.prepare(`insert into watcher_notices (id, watcher_id, kind, at) values ('n1', 'w1', 'assignees_missing', '${T}')`).run();
    expect(() => db.prepare(`insert into boards (id, name, position, created_at, updated_at, visibility) values ('b2', 'x', 'a1', '${T}', '${T}', 'geheim')`).run()).toThrow();
    // Indexe der Läufe sind wieder da
    const indexes = (db.prepare("select name from sqlite_master where type = 'index' and tbl_name = 'watcher_runs'").all() as { name: string }[]).map((r) => r.name);
    expect(indexes).toEqual(expect.arrayContaining(['ix_watcher_runs', 'ix_watcher_runs_at']));
    // Mitglieder und Wächter verschwinden mit ihrem Board bzw. Wächter
    db.prepare("update boards set visibility = 'selected' where id = 'b1'").run();
    db.prepare("insert into board_members (board_id, user_id) values ('b1', 'u1')").run();
    db.prepare("delete from watchers where id = 'w1'").run();
    expect(db.prepare('select count(*) as n from watcher_notices').get()).toEqual({ n: 0 });

    expect(existsSync(backupDir)).toBe(true);
    const backups = readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(new RegExp(`^stups-v${before}-`));
    db.close();
  });

  it('rollt bei einem Fehler zurück und lässt den alten Stand stehen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m27-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const before = buildBefore(file);
    const broken = [...migrations.filter((m) => m.version < 27), { version: 27, sql: "alter table boards add column visibility text not null default 'all'; this is not sql;" }];
    expect(() => openDb(file, { migrations: broken })).toThrow();
    const db = new DatabaseSync(file);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(before);
    expect(db.prepare("select count(*) as n from pragma_table_info('boards') where name = 'visibility'").get()).toEqual({ n: 0 });
    expect(db.prepare('select count(*) as n from watcher_runs').get()).toEqual({ n: 2 });
    db.close();
  });
});
