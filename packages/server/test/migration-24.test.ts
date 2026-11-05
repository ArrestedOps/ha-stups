import { mkdtempSync, rmSync } from 'node:fs';
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
const TABLES = ['users', 'boards', 'columns', 'cards', 'comments'];

/** Eine Datenbank im Stand 23 mit Person, Board und Karte */
function buildV23(file: string): void {
  const db = openDb(file, { migrations: migrations.filter((m) => m.version <= 23) });
  db.exec(`
    insert into users (id, name, display_name, is_person, created_at) values ('u1', 'anna', 'Anna', 1, '${T}');
    insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '${T}', '${T}');
    insert into columns (id, board_id, name, position, is_done) values ('c1', 'b1', 'Offen', 'a0', 0);
    insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1', 'b1', 'c1', 'a0', 'Müll raus', '${T}', '${T}');
    insert into comments (id, card_id, author_id, text, created_at) values ('m1', 'k1', 'u1', 'Hi', '${T}');
  `);
  db.close();
}

describe('Migration 24 (Rückmeldungen)', () => {
  it('legt nur eine neue Tabelle mit Indexen an und fasst nichts Vorhandenes an', () => {
    const m = migrations.find((x) => x.version === 24)!;
    expect(m).toBeDefined();
    expect(m.sql).toMatch(/create table feedback/);
    expect(m.sql).not.toMatch(/drop table|alter table|rename|delete from|update /i);
  });

  it('hebt einen Stand 23 an: Daten bleiben, die Tabelle ist leer, Version 24, Sicherung im Stand 23', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m24-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const backupDir = join(dir, 'backups');
    buildV23(file);
    const before = new DatabaseSync(file);
    const snap = Object.fromEntries(TABLES.map((t) => [t, before.prepare(`select * from ${t} order by 1`).all()]));
    before.close();

    const db = openDb(file, { migrations, backupDir, now: () => new Date('2026-11-05T10:00:00Z') });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(24);
    for (const t of TABLES) expect(db.prepare(`select * from ${t} order by 1`).all(), t).toEqual(snap[t]);
    expect(db.prepare('select count(*) as n from feedback').get()).toEqual({ n: 0 });
    const cols = (db.prepare('pragma table_info(feedback)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(['id', 'person_id', 'person_name', 'kind', 'message', 'image', 'thumb', 'meta', 'status', 'created_at']);
    db.close();
  });

  it('nimmt nur bekannte Arten und Stände an, Standard ist „neu"', () => {
    const db = openDb(':memory:');
    db.exec(`insert into feedback (id, kind, message, created_at) values ('f1', 'bug', 'Kaputt', '${T}')`);
    expect(db.prepare("select status, meta from feedback where id = 'f1'").get()).toEqual({ status: 'neu', meta: '{}' });
    expect(() => db.exec(`insert into feedback (id, kind, message, created_at) values ('f2', 'spam', 'x', '${T}')`)).toThrow();
    expect(() => db.exec(`update feedback set status = 'offen' where id = 'f1'`)).toThrow();
  });

  it('die Person darf gelöscht werden: die Rückmeldung bleibt, die Person ist leer', () => {
    const db = openDb(':memory:');
    db.exec(`insert into users (id, name, display_name, is_person, created_at) values ('u1', 'anna', 'Anna', 1, '${T}')`);
    db.exec(`insert into feedback (id, person_id, person_name, kind, message, created_at) values ('f1', 'u1', 'Anna', 'idea', 'Gut', '${T}')`);
    db.exec(`delete from users where id = 'u1'`);
    expect(db.prepare("select person_id, person_name from feedback where id = 'f1'").get()).toEqual({ person_id: null, person_name: 'Anna' });
  });

  it('legt Indexe für die Liste und das Zeitlimit je Person an', () => {
    const db = openDb(':memory:');
    const idx = (db.prepare("select name from sqlite_master where type = 'index'").all() as { name: string }[]).map((r) => r.name);
    expect(idx).toContain('ix_feedback_at');
    expect(idx).toContain('ix_feedback_person');
  });

  it('rollt bei einem Fehler zurück und lässt Version 23 stehen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m24-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    buildV23(file);
    const broken = [...migrations.filter((m) => m.version <= 23), { version: 24, sql: 'create table feedback (id text); this is not sql;' }];
    expect(() => openDb(file, { migrations: broken })).toThrow();
    const db = new DatabaseSync(file);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(23);
    expect(db.prepare("select count(*) as n from sqlite_master where name = 'feedback'").get()).toEqual({ n: 0 });
    db.close();
  });
});
