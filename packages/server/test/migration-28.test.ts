import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T = '2026-11-01T08:00:00.000Z';

describe('Migration 28 (Nachhaken als eigene Tabelle)', () => {
  it('macht aus „Täglich nachhaken“ eine persönliche Erinnerung je zuständiger Person und aus nudge_after_min das neue Stupsen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m28-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version < 28) });
    old.exec(`
      insert into users (id, name, display_name, is_person, created_at) values ('u1', 'anna', 'Anna', 1, '${T}');
      insert into users (id, name, display_name, is_person, created_at) values ('u2', 'ben', 'Ben', 1, '${T}');
      insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
      insert into columns (id, board_id, name, position, is_done) values ('c1', 'b1', 'Offen', 'a0', 0);
      -- k1: nachhaken, zwei Zuständige; k2: nachhaken, erledigt; k3: kein Nachhaken; k4: nachhaken ohne Zuständige
      insert into cards (id, board_id, column_id, position, title, due_at, overdue_nag, created_at, updated_at) values ('k1', 'b1', 'c1', 'a0', 'Müll', '${T}', 1, '${T}', '${T}');
      insert into cards (id, board_id, column_id, position, title, due_at, overdue_nag, completed_at, created_at, updated_at) values ('k2', 'b1', 'c1', 'a1', 'Alt', '${T}', 1, '${T}', '${T}', '${T}');
      insert into cards (id, board_id, column_id, position, title, due_at, overdue_nag, created_at, updated_at) values ('k3', 'b1', 'c1', 'a2', 'Ohne', '${T}', 0, '${T}', '${T}');
      insert into cards (id, board_id, column_id, position, title, due_at, overdue_nag, created_at, updated_at) values ('k4', 'b1', 'c1', 'a3', 'Niemand', '${T}', 1, '${T}', '${T}');
      insert into card_assignees (card_id, user_id) values ('k1', 'u1'), ('k1', 'u2'), ('k2', 'u1'), ('k3', 'u1');
      -- Wächter: w1 stupst nach 45 Minuten (Aufgabe k5 offen, schon angelegt), w2 nie, w3 hat schon gestupst (Aufgabe k6)
      insert into watchers (id, name, active, trigger_json, card_json, assign_json, nudge_after_min, position, created_at, updated_at) values ('w1', 'Wasch', 1, '{}', '{}', '{}', 45, 0, '${T}', '${T}');
      insert into watchers (id, name, active, trigger_json, card_json, assign_json, nudge_after_min, position, created_at, updated_at) values ('w2', 'Nie', 1, '{}', '{}', '{}', null, 1, '${T}', '${T}');
      insert into watchers (id, name, active, trigger_json, card_json, assign_json, nudge_after_min, position, created_at, updated_at) values ('w3', 'Schon', 1, '{}', '{}', '{}', 30, 2, '${T}', '${T}');
      insert into cards (id, board_id, column_id, position, title, watcher_id, created_at, updated_at) values ('k5', 'b1', 'c1', 'a4', 'Ausräumen', 'w1', '${T}', '${T}');
      insert into cards (id, board_id, column_id, position, title, watcher_id, created_at, updated_at) values ('k6', 'b1', 'c1', 'a5', 'Schon gestupst', 'w3', '${T}', '${T}');
      insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to) values ('r1', 'w1', '2026-11-01T08:10:00.000Z', 'created', 'k5', '[]');
      insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to) values ('r2', 'w1', '2026-11-01T08:20:00.000Z', 'assigned', 'k5', '[]');
      insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to) values ('r3', 'w3', '2026-11-01T08:10:00.000Z', 'created', 'k6', '[]');
      insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to) values ('r4', 'w3', '2026-11-01T08:50:00.000Z', 'nudged', 'k6', '[]');
    `);
    old.close();

    const db = openDb(file, { migrations, backupDir: join(dir, 'backups') });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);

    // altes Nachhaken: je zuständiger Person eine persönliche Erinnerung, ab dem Tag nach dem Termin, täglich, bis zu 99 ×, Uhrzeit aus der Option
    const nag = db.prepare("select card_id, user_id, anchor, after_min, every_min, max_count, at_time, sent_count, done from card_reminders where anchor = 'due' order by user_id").all();
    expect(nag).toEqual([
      { card_id: 'k1', user_id: 'u1', anchor: 'due', after_min: 1440, every_min: 1440, max_count: 99, at_time: null, sent_count: 0, done: 0 },
      { card_id: 'k1', user_id: 'u2', anchor: 'due', after_min: 1440, every_min: 1440, max_count: 99, at_time: null, sent_count: 0, done: 0 },
    ]);
    expect(db.prepare("select name from pragma_table_info('cards') where name = 'overdue_nag'").all()).toEqual([]);

    // altes Stupsen: {afterMin: N, everyMin: null, max: 1}; offene Aufgaben mit noch ausstehendem Stups bekommen ihre Zeile (gezählt ab der letzten Zuweisung)
    expect(db.prepare('select id, nudge_json from watchers order by id').all()).toEqual([
      { id: 'w1', nudge_json: '{"afterMin":45,"everyMin":null,"max":1}' },
      { id: 'w2', nudge_json: null },
      { id: 'w3', nudge_json: '{"afterMin":30,"everyMin":null,"max":1}' },
    ]);
    expect(db.prepare("select card_id, user_id, anchor, anchor_at, after_min, every_min, max_count from card_reminders where anchor = 'created'").all()).toEqual([
      { card_id: 'k5', user_id: null, anchor: 'created', anchor_at: '2026-11-01T08:20:00.000Z', after_min: 45, every_min: null, max_count: 1 },
    ]);
    expect(db.prepare("select name from pragma_table_info('watchers') where name = 'nudge_after_min'").all()).toEqual([]);

    // je Aufgabe und Person höchstens eine Zeile; mit der Aufgabe gelöscht
    expect(() => db.exec("insert into card_reminders (id, card_id, user_id, anchor, after_min, created_at) values ('x', 'k1', 'u1', 'due', 5, 'x')")).toThrow();
    expect(() => db.exec("insert into card_reminders (id, card_id, user_id, anchor, after_min, created_at) values ('y', 'k5', null, 'due', 5, 'x')")).toThrow();
    db.exec("delete from cards where id = 'k1'");
    expect(db.prepare("select count(*) as n from card_reminders where card_id = 'k1'").get()).toEqual({ n: 0 });
    db.close(); // unter Windows lässt sich ein offenes Datenbank-Verzeichnis nicht löschen
  });
});
