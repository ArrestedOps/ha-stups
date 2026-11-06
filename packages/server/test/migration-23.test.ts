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

/** Eine Datenbank im Stand 22 mit Karten, Stupsen, Kommentaren, Erledigungen, Wächterläufen und einer Kind-Person */
function buildV22(file: string): void {
  const db = openDb(file, { migrations: migrations.filter((m) => m.version <= 22) });
  db.exec(`
    insert into users (id, name, display_name, is_person, created_at, is_child, child_scope) values
      ('u1', 'anna', 'Anna', 1, '${T}', 0, 'all'),
      ('u2', 'kim', 'Kim', 1, '${T}', 1, 'assigned');
    insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
    insert into columns (id, board_id, name, position, is_done) values
      ('c1', 'b1', 'Offen', 'a0', 0), ('c2', 'b1', 'Erledigt', 'a1', 1);
    insert into cards (id, board_id, column_id, position, title, created_at, updated_at, completed_at, icon) values
      ('k1', 'b1', 'c1', 'a0', 'Müll raus', '${T}', '${T}', null, 'leaf'),
      ('k2', 'b1', 'c2', 'a0', 'Bad putzen', '${T}', '${T}', '${T}', null);
    insert into card_assignees (card_id, user_id) values ('k1', 'u2');
    insert into watchers (id, name, trigger_json, card_json, assign_json, created_at, updated_at)
      values ('w1', 'Waschmaschine', '{"entityId":"sensor.x","kind":"state","to":"off","value":null,"forMin":0,"count":1}', '{"boardId":"b1"}', '{"mode":"rotation"}', '${T}', '${T}');
    insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to) values ('r1', 'w1', '${T}', 'created', 'k1', '["u2"]');
    insert into nudges (id, card_id, from_user, to_user, text, created_at, deliver_at) values ('n1', 'k1', 'u1', 'u2', 'Hallo', '${T}', '${T}');
    insert into comments (id, card_id, author_id, text, created_at) values ('m1', 'k1', 'u1', 'Hi', '${T}');
    insert into completions (id, card_id, completed_by, completed_at, source) values ('p1', 'k2', 'u2', '${T}', 'app');
    insert into card_events (id, card_id, kind, by_user, at) values ('e1', 'k1', 'moved', 'u1', '${T}');
    insert into sent_notifications (card_id, user_id, kind, occurrence_key, sent_at) values ('k1', 'u2', 'due', 'x', '${T}');
  `);
  db.close();
}

const TABLES = ['cards', 'watchers', 'watcher_runs', 'nudges', 'comments', 'completions', 'card_events', 'sent_notifications', 'card_assignees'];

describe('Migration 23 (Posteingang und Dashboard je Person)', () => {
  it('hängt nur Spalten und Indexe an', () => {
    const last = migrations.find((m) => m.version === 23)!;
    expect(last.sql).toMatch(/alter table users add column inbox_seen_at/);
    expect(last.sql).toMatch(/alter table users add column dashboard_path/);
    expect(last.sql).not.toMatch(/drop table|rename|delete from/i);
  });

  it('lässt alle Daten gleich, setzt den Gelesen-Marker auf „jetzt", das Dashboard auf null, sichert vorher und erhöht die Version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m23-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    buildV22(file);

    const before = new DatabaseSync(file);
    const snap = Object.fromEntries(TABLES.map((t) => [t, before.prepare(`select * from ${t} order by 1, 2`).all()]));
    const usersBefore = before.prepare('select * from users order by id').all() as Record<string, unknown>[];
    before.close();

    const t0 = Date.now();
    const db = openDb(file, { migrations, backupDir, now: () => new Date('2026-11-05T10:00:00Z') });
    const t1 = Date.now();
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations[migrations.length - 1]!.version);

    // Spalten, die spätere Migrationen anhängen, gehören nicht zu diesem Vergleich
    for (const t of TABLES) {
      const rows = db.prepare(`select * from ${t} order by 1, 2`).all() as Record<string, unknown>[];
      expect(withoutLater(t, rows), t).toEqual(snap[t]);
    }

    const users = db.prepare('select * from users order by id').all() as Record<string, unknown>[];
    expect(users).toHaveLength(2);
    for (const [i, u] of users.entries()) {
      // Marker = Zeitpunkt der Migration: die Glocke startet ohne Altlasten
      const seen = Date.parse(u.inbox_seen_at as string);
      expect(seen).toBeGreaterThanOrEqual(t0 - 1000);
      expect(seen).toBeLessThanOrEqual(t1 + 1000);
      expect(u.inbox_seen_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(u.dashboard_path).toBeNull();
      const { inbox_seen_at: _a, dashboard_path: _b, ...rest } = u;
      expect(rest).toEqual(usersBefore[i]);
    }

    // Sicherung im Stand 22 liegt da und kennt die neuen Spalten noch nicht
    expect(existsSync(backupDir)).toBe(true);
    const backups = readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^stups-v22-/);
    const old = new DatabaseSync(join(backupDir, backups[0]!));
    const cols = (old.prepare('pragma table_info(users)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).not.toContain('inbox_seen_at');
    expect(cols).not.toContain('dashboard_path');
    old.close();
    db.close();
  });

  it('legt Indexe für die Posteingang-Abfragen an', () => {
    const db = openDb(':memory:');
    const idx = (db.prepare("select name from sqlite_master where type = 'index'").all() as { name: string }[]).map((r) => r.name);
    for (const n of ['ix_nudges_to', 'ix_nudges_from', 'ix_comments_at', 'ix_completions_at', 'ix_watcher_runs_at', 'ix_card_events_at', 'ix_sent_user_at']) expect(idx).toContain(n);
  });

  it('rollt bei einem Fehler zurück und lässt Version 22 stehen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m23-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    buildV22(file);
    const broken = [...migrations.filter((m) => m.version <= 22), { version: 23, sql: 'alter table users add column inbox_seen_at text; this is not sql;' }];
    expect(() => openDb(file, { migrations: broken })).toThrow();
    const db = new DatabaseSync(file);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(22);
    expect((db.prepare('pragma table_info(users)').all() as { name: string }[]).map((c) => c.name)).not.toContain('inbox_seen_at');
    expect(db.prepare('select count(*) as n from users').get()).toEqual({ n: 2 });
    db.close();
  });
});
