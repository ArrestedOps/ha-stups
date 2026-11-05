import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore } from '../src/store.js';

// Eine befüllte Datenbank im alten Stand (9, 19, 21) wird mit den ECHTEN Migrationen bis zum neuesten Stand gehoben:
// jede alte Zeile bleibt unverändert, vorher liegt eine Sicherung, nichts verweist ins Leere.
const latest = migrations[migrations.length - 1]!.version;
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'stups-mig-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T = '2026-03-01T10:00:00.000Z';

/** Stand 9: Personen, Board mit Spalten, Karten mit Checkliste/Link/Erledigung, Stupse */
function seed9(db: DatabaseSync): void {
  db.exec(`
    insert into users (id, ha_user_id, name, display_name, is_person, color, created_at, notify_services)
      values ('u-rene', 'ha-rene', 'rene', 'René', 1, '#e07a1f', '${T}', '["mobile_app_rene"]'),
             ('u-mia', 'ha-mia', 'mia', 'Mia', 1, '#3b82f6', '${T}', '[]');
    insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
    insert into columns (id, board_id, name, position, is_done) values ('c-open', 'b1', 'Offen', 'a0', 0), ('c-done', 'b1', 'Erledigt', 'a1', 1);
    insert into categories (id, board_id, name, color, position) values ('k1', 'b1', 'Bad', 'blue', 'a0');
    insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence, created_by, created_at, updated_at, carry_over, repeated_from)
      values ('card1', 'b1', 'c-open', 'a0', 'Bad putzen', 'Mit Essig', 'high', '2026-03-05T08:00:00.000Z', '{"type":"fixed","freq":"weekly","every":1}', 'u-rene', '${T}', '${T}', null, null),
             ('card2', 'b1', 'c-done', 'a0', 'Müll', null, null, null, null, 'u-rene', '${T}', '${T}', null, 'card1');
    update cards set completed_at = '${T}' where id = 'card2';
    insert into card_categories values ('card1', 'k1');
    insert into card_assignees values ('card1', 'u-mia'), ('card2', 'u-rene');
    insert into checklist_items (id, card_id, text, done, position) values ('i1', 'card1', 'Spiegel', 1, 'a0'), ('i2', 'card1', 'Wanne', 0, 'a1');
    insert into links (id, card_id, url, title, kind, position) values ('l1', 'card1', 'https://example.org', 'Anleitung', 'web', 'a0');
    insert into completions (id, card_id, completed_by, completed_at, due_at, source, snapshot) values ('co1', 'card2', 'u-rene', '${T}', null, 'app', '{}');
    insert into comments (id, card_id, author_id, text, created_at) values ('cm1', 'card1', 'u-rene', 'Bitte bis Freitag', '${T}');
    insert into nudges (id, card_id, from_user, to_user, template, text, created_at, deliver_at, delivered_at, delivered_round, later_count, later_log)
      values ('n1', 'card1', 'u-rene', 'u-mia', 'again', 'Nochmal, bitte', '${T}', '${T}', '${T}', 1, 2, '[1,2]');
    insert into nudges (id, card_id, from_user, to_user, text, created_at, deliver_at, reply, reply_at)
      values ('n2', 'card2', 'u-mia', 'u-rene', 'Danke', '${T}', '${T}', 'ack', '${T}');
  `);
}

/** Stand 19: dazu Wächter mit Zustand, Läufen und wartender Karte; ein Kind mit Bestätigern und angefragter Bestätigung */
function seed19(db: DatabaseSync): void {
  db.exec(`
    insert into watchers (id, name, trigger_json, card_json, assign_json, created_at, updated_at, last_assignees)
      values ('w1', 'Waschmaschine', '{"entityId":"sensor.x","kind":"to","to":"off"}', '{"title":"Wäsche aufhängen"}', '{"mode":"fixed","personIds":["u-mia"]}', '${T}', '${T}', '["u-mia"]');
    insert into watcher_state (watcher_id, armed, met_since, counter) values ('w1', 0, '${T}', 3);
    insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to, note)
      values ('r1', 'w1', '${T}', 'created', 'card1', '["u-mia"]', 'zum Test'), ('r2', 'w1', '${T}', 'cooldown', null, '[]', null);
    insert into watcher_waiting (card_id, watcher_id, since) values ('card1', 'w1', '${T}');
    update cards set watcher_id = 'w1', dedupe_key = 'k1' where id = 'card1';
    update users set is_child = 1, child_scope = 'assigned', confirm_default = 1 where id = 'u-mia';
    insert into child_confirmers (child_id, user_id) values ('u-mia', 'u-rene');
    update cards set confirm = 'on', confirm_requested_at = '${T}', confirm_requested_by = 'u-mia' where id = 'card1';
  `);
}

/** Stand 21: dazu Vorschläge und ausgeblendete Treffer; die Läufe tragen neue Ergebnisse */
function seed21(db: DatabaseSync): void {
  db.exec(`
    insert into watcher_suggest (card_id, watcher_id, since) values ('card2', 'w1', '${T}');
    insert into watcher_hidden (template_id, entity_id, at) values ('tpl', 'sensor.y', '${T}');
    insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to, note) values ('r3', 'w1', '${T}', 'claimed', 'card1', '["u-rene"]', null);
    update users set avatar_source = 'upload', avatar_rev = 4, busy_until = '2026-03-09' where id = 'u-rene';
  `);
}

type Dump = Record<string, { cols: string[]; rows: string[] }>;

/** Alle Zeilen aller Tabellen, nach Spalten des alten Stands (neue Spalten zählen nicht) */
function dump(db: DatabaseSync): Dump {
  const out: Dump = {};
  const names = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as { name: string }[]).map((r) => r.name);
  for (const t of names) {
    const cols = (db.prepare(`pragma table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    out[t] = { cols, rows: (db.prepare(`select ${cols.join(', ')} from ${t}`).all() as object[]).map((r) => JSON.stringify(r)).sort() };
  }
  return out;
}

function expectUnchanged(before: Dump, db: DatabaseSync): void {
  for (const [table, { cols, rows }] of Object.entries(before)) {
    const now = (db.prepare(`select ${cols.join(', ')} from ${table}`).all() as object[]).map((r) => JSON.stringify(r)).sort();
    expect(now, `Tabelle ${table}`).toEqual(rows);
  }
}

function migrate(version: number, seed: (db: DatabaseSync) => void) {
  const dir = tmp();
  const path = join(dir, 'stups.sqlite');
  const old = openDb(path, { migrations: migrations.filter((m) => m.version <= version) });
  seed(old);
  const rowsInOldStand = Object.values(dump(old)).reduce((n, t) => n + t.rows.length, 0);
  const before = dump(old);
  old.close();
  const db = openDb(path, { backupDir: join(dir, 'backups'), now: () => new Date('2026-11-05T12:00:00Z') });
  return { db, before, dir, rowsInOldStand };
}

describe('Echte Migrationen mit befüllter alter Datenbank', () => {
  it.each([
    [9, (db: DatabaseSync) => seed9(db)],
    [19, (db: DatabaseSync) => (seed9(db), seed19Prepared(db))],
    [21, (db: DatabaseSync) => (seed9(db), seed19Prepared(db), seed21Prepared(db))],
    // Stand 23 (vor den Rückmeldungen, Migration 24): alles bis hierher gehoben und befüllt
    [23, (db: DatabaseSync) => (seed9(db), seed19Prepared(db), seed21Prepared(db), upgrade(db, 23))],
  ] as [number, (db: DatabaseSync) => void][])('Stand %i: alle Daten bleiben unverändert, Sicherung vorhanden, Stand ist der neueste', (version, seed) => {
    const { db, before, dir, rowsInOldStand } = migrate(version, seed);
    expect(rowsInOldStand).toBeGreaterThan(10);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(latest);
    expectUnchanged(before, db);
    expect(db.prepare('pragma foreign_key_check').all()).toEqual([]);
    expect((db.prepare('pragma foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1);
    const backups = readdirSync(join(dir, 'backups'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(new RegExp(`^stups-v${version}-`));
    expect(existsSync(join(dir, 'backups', backups[0]!))).toBe(true);
    db.close();
  });

  it('die gehobene Datenbank lässt sich wie gewohnt benutzen (Karten, Wächter, Stupse, Kind)', () => {
    const { db } = migrate(9, (d) => (seed9(d), seed19Prepared(d)));
    const store = createStore(db, { now: () => new Date('2026-11-05T12:00:00Z'), timeZone: () => 'Europe/Berlin' });
    const view = store.getBoardView('b1');
    expect(view.cards.map((c) => c.title).sort()).toEqual(['Bad putzen', 'Müll']);
    const card = store.getCard('card1');
    expect(card.checklist).toEqual({ done: 1, total: 2 });
    expect(card.links).toHaveLength(1);
    expect(card.assigneeIds).toEqual(['u-mia']);
    expect(store.userById('u-mia')).toMatchObject({ isChild: true });
    expect(store.confirmerIds('u-mia')).toEqual(['u-rene']);
    expect(store.getNudge('n1')).toMatchObject({ toId: 'u-mia', laterCount: 2 });
    expect(store.listCompletions('card2')).toHaveLength(1);
    // neue Spalten haben sinnvolle Vorgaben
    expect(store.userById('u-rene')).toMatchObject({ dashboardPath: null });
    // und es lässt sich weiter schreiben
    const added = store.createCard('b1', { columnId: 'c-open', title: 'Neu' }, 'u-rene');
    expect(store.getCard(added.id).title).toBe('Neu');
    db.close();
  });
});

// Die Wächter-Tabellen entstehen erst mit Migration 10, die Kind-Spalten mit 19, Vorschläge mit 20: die Seeds laufen daher
// erst, wenn der Stand sie hat. Für 9 wird die Datenbank vor dem Befüllen auf den jeweiligen Stand gehoben.
function seed19Prepared(db: DatabaseSync): void {
  upgrade(db, 19);
  seed19(db);
}
function seed21Prepared(db: DatabaseSync): void {
  upgrade(db, 21);
  seed21(db);
}
function upgrade(db: DatabaseSync, version: number): void {
  const current = (db.prepare('pragma user_version').get() as { user_version: number }).user_version;
  for (const m of migrations.filter((x) => x.version > current && x.version <= version)) {
    db.exec(m.sql);
    db.exec(`pragma user_version = ${m.version}`);
  }
}
