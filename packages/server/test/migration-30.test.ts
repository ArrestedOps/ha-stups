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

describe('Migration 30 (Onboarding-Status)', () => {
  it('Bestandspersonen gelten als eingerichtet, Nicht-Personen und neue Personen bleiben ungesetzt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-m30-'));
    dirs.push(dir);
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version < 30) });
    old.exec(`
      insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values ('u1', 'ha1', 'Anna', 'Anna', 1, '#fff', '${T}');
      insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values ('u2', null, 'Ben', 'Ben', 1, '#000', '${T}');
      insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values ('u3', 'ha3', 'Dienst', 'Dienst', 0, null, '${T}');
    `);
    old.close();

    const db = openDb(file, { migrations, backupDir: join(dir, 'backups') });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    expect(db.prepare('select id, onboarding from users order by id').all()).toEqual([
      { id: 'u1', onboarding: 'done' },
      { id: 'u2', onboarding: 'done' },
      { id: 'u3', onboarding: null },
    ]);
    // eine Person, die nach der Migration entsteht, hat noch keinen Status
    db.exec(`insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values ('u4', null, 'Neu', 'Neu', 1, '#123', '${T}')`);
    expect(db.prepare("select onboarding from users where id = 'u4'").get()).toEqual({ onboarding: null });
    db.close();
  });
});
