import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore, type Store } from '../src/store.js';

describe('Migration 16', () => {
  it('übernimmt eine Datenbank im Stand von 15 unverändert und legt beide Tabellen leer an', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig16-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 15) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at, notify_services) values ('u1','anna','Anna',1,'#fff','2026-01-01T00:00:00Z','["svc"]')`);
    old.close();

    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db);
    expect(s.people().map((p) => [p.name, p.notifyServices])).toEqual([['anna', ['svc']]]);
    expect(s.houseChannels()).toEqual([]);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(16);
    expect(() => new DatabaseSync(file).prepare('select id from house_channels').all()).not.toThrow();
    expect(() => new DatabaseSync(file).prepare('select id from house_pending').all()).not.toThrow();
    db.close();
  });
});

describe('Haus-Kanäle im Store', () => {
  let store: Store;
  let ben: string;
  let anna: string;
  beforeEach(() => {
    store = createStore(openDb(':memory:'));
    ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
    anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  });

  it('legt einen Kanal mit den Vorgaben an: nur Stupse, abwesend verwerfen, 120 Minuten', () => {
    const c = store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.kinderzimmer' });
    expect(c).toMatchObject({
      userId: ben,
      type: 'speak',
      name: 'media_player.kinderzimmer',
      entityId: 'media_player.kinderzimmer',
      enabled: true,
      kinds: ['nudge'],
      whenAway: 'skip',
      waitMinutes: 120,
      volume: null,
    });
    expect(store.houseChannelsOf(ben)).toHaveLength(1);
    expect(store.houseChannelsOf(anna)).toEqual([]);
    expect(store.houseChannel(c.id)?.id).toBe(c.id);
    expect(store.houseChannel('gibt-es-nicht')).toBeNull();
  });

  it('nimmt alle Angaben, ändert und löscht', () => {
    const c = store.addHouseChannel(ben, {
      type: 'speak',
      name: ' Zimmer von Ben ',
      entityId: 'media_player.ben',
      kinds: ['nudge', 'due', 'watcher'],
      whenAway: 'wait',
      waitMinutes: 45,
      volume: 60,
      enabled: false,
    });
    expect(c).toMatchObject({ name: 'Zimmer von Ben', kinds: ['nudge', 'due', 'watcher'], whenAway: 'wait', waitMinutes: 45, volume: 60, enabled: false });

    const u = store.updateHouseChannel(c.id, { enabled: true, kinds: ['due'], volume: null, whenAway: 'skip', name: 'Neu' });
    expect(u).toMatchObject({ enabled: true, kinds: ['due'], volume: null, whenAway: 'skip', name: 'Neu', entityId: 'media_player.ben' });

    store.removeHouseChannel(c.id);
    expect(store.houseChannelsOf(ben)).toEqual([]);
    expect(() => store.removeHouseChannel(c.id)).toThrow(/nicht gefunden/);
  });

  it('prüft die Angaben', () => {
    const bad = (input: Record<string, unknown>) => () => store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.x', ...input });
    expect(bad({ type: 'tablet' })).toThrow(/speak.*light/);
    expect(bad({ entityId: 'light.lampe' })).toThrow(/passt nicht zum Typ/);
    expect(bad({ entityId: 'kein gueltiger name' })).toThrow(/Entität/);
    expect(bad({ kinds: ['nudge', 'zeitung'] })).toThrow(/nudge.*due.*watcher/);
    expect(bad({ kinds: 'nudge' })).toThrow(/nudge.*due.*watcher/);
    expect(bad({ whenAway: 'ignorieren' })).toThrow(/skip.*wait/);
    expect(bad({ waitMinutes: 0 })).toThrow(/1 bis 1440/);
    expect(bad({ waitMinutes: 1441 })).toThrow(/1 bis 1440/);
    expect(bad({ waitMinutes: 2.5 })).toThrow(/1 bis 1440/);
    expect(bad({ volume: 5 })).toThrow(/10 bis 100/);
    expect(bad({ volume: 101 })).toThrow(/10 bis 100/);
    expect(bad({ name: 'x'.repeat(61) })).toThrow(/zu lang/);
    expect(() => store.addHouseChannel('gibt-es-nicht', { type: 'speak', entityId: 'media_player.x' })).toThrow(/Person nicht gefunden/);
    // eine Lampe hat keine Lautstärke
    expect(() => store.addHouseChannel(ben, { type: 'light', entityId: 'light.lampe', volume: 50 })).toThrow(/Lautstärke/);
    expect(store.houseChannels()).toEqual([]);
  });

  it('nur Personen haben Kanäle; wer entfernt wird, ist nicht mehr erreichbar, und kommt er zurück, gilt alles wieder', () => {
    store.addHouseChannel(ben, { type: 'light', entityId: 'light.flur' });
    store.removePerson(ben);
    expect(store.houseChannels()).toEqual([]);
    expect(store.houseChannelsOf(ben)).toEqual([]);
    store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
    expect(store.houseChannelsOf(ben)).toHaveLength(1);
  });

  it('ein Kanal ändert die Ansicht (Live-Sync lädt alles neu)', () => {
    store.takeChanges();
    store.addHouseChannel(ben, { type: 'light', entityId: 'light.flur' });
    expect(store.takeChanges().full).toBe(true);
  });

  it('der Sprachdienst steht in den Einstellungen und muss eine tts-Entität sein', () => {
    expect(store.getHouseTts()).toBeNull();
    store.setHouseTts('tts.piper');
    expect(store.getHouseTts()).toBe('tts.piper');
    expect(() => store.setHouseTts('media_player.x')).toThrow(/tts/);
    store.setHouseTts(null);
    expect(store.getHouseTts()).toBeNull();
  });
});

describe('Warteschlange „warten bis zur Heimkehr"', () => {
  let store: Store;
  let ben: string;
  let anna: string;
  let channel: string;
  let channelAnna: string;
  beforeEach(() => {
    store = createStore(openDb(':memory:'));
    ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
    anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
    channel = store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', whenAway: 'wait' }).id;
    channelAnna = store.addHouseChannel(anna, { type: 'light', entityId: 'light.anna', whenAway: 'wait' }).id;
  });

  it('legt ab, holt die Einträge einer Person, entfernt sie einzeln', () => {
    const a = store.addHousePending(channel, { kind: 'nudge', spoken: 'Ben, Anna stupst dich', cardId: 'c1', nudgeId: 'n1' }, '2026-11-03T12:00:00.000Z');
    store.addHousePending(channelAnna, { kind: 'due', spoken: 'Anna, X ist fällig.', cardId: 'c2', nudgeId: null }, '2026-11-03T12:00:00.000Z');
    expect(store.housePendingOf(ben)).toEqual([
      expect.objectContaining({ id: a.id, channelId: channel, kind: 'nudge', spoken: 'Ben, Anna stupst dich', cardId: 'c1', nudgeId: 'n1', expiresAt: '2026-11-03T12:00:00.000Z' }),
    ]);
    expect(store.housePendingOf(anna)).toHaveLength(1);
    store.removeHousePending(a.id);
    expect(store.housePendingOf(ben)).toEqual([]);
  });

  it('räumt Abgelaufene weg und zählt sie', () => {
    store.addHousePending(channel, { kind: 'nudge', spoken: 'alt', cardId: null, nudgeId: null }, '2026-11-03T10:00:00.000Z');
    store.addHousePending(channel, { kind: 'nudge', spoken: 'neu', cardId: null, nudgeId: null }, '2026-11-03T14:00:00.000Z');
    expect(store.purgeHousePending('2026-11-03T12:00:00.000Z')).toBe(1);
    expect(store.housePendingOf(ben).map((p) => p.spoken)).toEqual(['neu']);
  });

  it('wird der Kanal gelöscht, geht seine Warteschlange mit', () => {
    store.addHousePending(channel, { kind: 'nudge', spoken: 'x', cardId: null, nudgeId: null }, '2026-11-03T14:00:00.000Z');
    store.removeHouseChannel(channel);
    expect(store.housePendingOf(ben)).toEqual([]);
  });

  it('die Warteschlange ändert nichts an der Ansicht (kein Neuladen aller Geräte)', () => {
    store.takeChanges();
    store.addHousePending(channel, { kind: 'nudge', spoken: 'x', cardId: null, nudgeId: null }, '2026-11-03T14:00:00.000Z');
    store.purgeHousePending('2026-12-01T00:00:00.000Z');
    expect(store.takeChanges()).toEqual({ full: false, cards: [] });
  });
});
