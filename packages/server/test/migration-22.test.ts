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

/** Eine Datenbank im Stand 21 mit Aufgaben (offen, erledigt, archiviert, im Papierkorb), Wächter, Stups und Kind-Person */
function buildV21(file: string): void {
  const db = openDb(file, { migrations: migrations.filter((m) => m.version <= 21) });
  db.exec(`
    insert into users (id, name, display_name, is_person, created_at, is_child, child_scope) values
      ('u1', 'anna', 'Anna', 1, '${T}', 0, 'all'),
      ('u2', 'kim', 'Kim', 1, '${T}', 1, 'assigned');
    insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
    insert into columns (id, board_id, name, position, is_done) values
      ('c1', 'b1', 'Offen', 'a0', 0), ('c2', 'b1', 'Erledigt', 'a1', 1);
    insert into cards (id, board_id, column_id, position, title, created_at, updated_at, completed_at, archived_at, deleted_at, effort) values
      ('k1', 'b1', 'c1', 'a0', 'Müll raus', '${T}', '${T}', null, null, null, 'small'),
      ('k2', 'b1', 'c2', 'a0', 'Bad putzen', '${T}', '${T}', '${T}', null, null, null),
      ('k3', 'b1', 'c2', 'a1', 'Altes Archiv', '${T}', '${T}', '${T}', '${T}', null, null),
      ('k4', 'b1', 'c1', 'a1', 'Im Papierkorb', '${T}', '${T}', null, null, '${T}', null);
    insert into card_assignees (card_id, user_id) values ('k1', 'u2');
    insert into watchers (id, name, trigger_json, card_json, assign_json, created_at, updated_at)
      values ('w1', 'Waschmaschine', '{"entityId":"sensor.x","kind":"state","to":"off","value":null,"forMin":0,"count":1}', '{"boardId":"b1"}', '{"mode":"rotation"}', '${T}', '${T}');
    update cards set watcher_id = 'w1' where id = 'k1';
    insert into nudges (id, card_id, from_user, to_user, text, created_at, deliver_at)
      values ('n1', 'k1', 'u1', 'u2', 'Hallo', '${T}', '${T}');
  `);
  db.close();
}

describe('Migration 22 (Symbol und Farbe an Aufgaben)', () => {
  it('hängt nur Spalten an', () => {
    const last = migrations.find((m) => m.version === 22)!;
    expect(last.sql).toMatch(/alter table cards add column icon /);
    expect(last.sql).not.toMatch(/drop table|rename/i);
  });

  it('lässt alle Daten gleich, setzt icon* auf null, sichert die Datei vorher und erhöht die Version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m22-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    buildV21(file);

    const before = new DatabaseSync(file);
    const cardsBefore = before.prepare('select * from cards order by id').all();
    const usersBefore = before.prepare('select * from users order by id').all();
    const watchersBefore = before.prepare('select * from watchers').all();
    const nudgesBefore = before.prepare('select * from nudges').all();
    before.close();

    const upTo22 = migrations.filter((m) => m.version <= 22);
    const db = openDb(file, { migrations: upTo22, backupDir, now: () => new Date('2026-11-05T10:00:00Z') });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(22);

    const cardsAfter = db.prepare('select * from cards order by id').all() as Record<string, unknown>[];
    expect(cardsAfter).toHaveLength(4);
    for (const [i, c] of cardsAfter.entries()) {
      expect(c.icon).toBeNull();
      expect(c.icon_color).toBeNull();
      expect(c.icon_source).toBeNull();
      const { icon: _i, icon_color: _c, icon_source: _s, ...rest } = c;
      expect(rest).toEqual(cardsBefore[i]);
    }
    expect(db.prepare('select * from users order by id').all()).toEqual(usersBefore);
    expect(db.prepare('select * from watchers').all()).toEqual(watchersBefore);
    expect(db.prepare('select * from nudges').all()).toEqual(nudgesBefore);

    // Sicherung im Stand 21 liegt da und enthält die neuen Spalten noch nicht
    expect(existsSync(backupDir)).toBe(true);
    const backups = readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^stups-v21-/);
    const old = new DatabaseSync(join(backupDir, backups[0]!));
    expect((old.prepare('pragma table_info(cards)').all() as { name: string }[]).map((c) => c.name)).not.toContain('icon');
    old.close();
    db.close();
  });

  it('nimmt nur die erlaubten Werte für die Quelle an', () => {
    const db = openDb(':memory:');
    db.exec(`insert into boards (id, name, position, created_at, updated_at) values ('b', 'B', 'a', '${T}', '${T}');
             insert into columns (id, board_id, name, position) values ('c', 'b', 'Offen', 'a');`);
    const ins = (src: string) =>
      db.exec(`insert into cards (id, board_id, column_id, position, title, created_at, updated_at, icon, icon_source) values ('x${src}', 'b', 'c', 'a', 't', '${T}', '${T}', 'leaf', '${src}')`);
    expect(() => ins('auto')).not.toThrow();
    expect(() => ins('manual')).not.toThrow();
    expect(() => ins('kaputt')).toThrow();
  });

  it('rollt bei einem Fehler zurück und lässt Version 21 stehen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m22-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    buildV21(file);
    const broken = [...migrations.filter((m) => m.version <= 21), { version: 22, sql: 'alter table cards add column icon text; this is not sql;' }];
    expect(() => openDb(file, { migrations: broken })).toThrow();
    const db = new DatabaseSync(file);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(21);
    expect((db.prepare('pragma table_info(cards)').all() as { name: string }[]).map((c) => c.name)).not.toContain('icon');
    expect(db.prepare('select count(*) as n from cards').get()).toEqual({ n: 4 });
    db.close();
  });
});
