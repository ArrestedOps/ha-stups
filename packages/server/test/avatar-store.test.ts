import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore } from '../src/store.js';

describe('Migration 20', () => {
  it('übernimmt eine Datenbank im Stand von 19 unverändert: kein Bild, keine „wenig Zeit"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig20-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 19) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at) values ('u1','anna','Anna',1,'#fff','2026-01-01T00:00:00Z')`);
    old.close();
    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db);
    expect(s.people()[0]).toMatchObject({ avatarRev: null, busyUntil: null });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(20);
    expect(() => new DatabaseSync(file).prepare('select card_id, watcher_id, since from watcher_suggest').all()).not.toThrow();
    db.close();
  });
});

describe('Bild der Person im Store', () => {
  it('setAvatar zählt die Fassung hoch, clearAvatar entfernt das Bild', () => {
    const s = createStore(openDb(':memory:'));
    const a = s.addPerson({ name: 'Anna' });
    expect(s.avatarSource(a.id)).toBeNull();
    expect(s.setAvatar(a.id, 'ha')).toBe(1);
    expect(s.avatarSource(a.id)).toBe('ha');
    expect(s.setAvatar(a.id, 'upload')).toBe(2);
    expect(s.userById(a.id)).toMatchObject({ avatarRev: 2 });
    s.clearAvatar(a.id);
    expect(s.avatarSource(a.id)).toBeNull();
    expect(s.userById(a.id)?.avatarRev).toBeNull();
    // Nach dem Entfernen und neu Setzen steigt der Zähler weiter (kein altes Bild aus dem Cache)
    expect(s.setAvatar(a.id, 'ha')).toBe(3);
  });
});
