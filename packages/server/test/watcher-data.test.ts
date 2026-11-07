import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { conditionMet, parseWatcher, type WatcherConfig } from '../src/watcher-types.js';

const input = (extra: Record<string, unknown> = {}) => ({
  name: 'Waschmaschine fertig',
  trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5 },
  card: { boardId: 'b', columnId: 'c', title: 'Waschmaschine ausräumen', due: { kind: 'in', minutes: 30 } },
  assign: { mode: 'rotation_present', personIds: [] },
  ...extra,
});

describe('Migration 10', () => {
  it('übernimmt eine Datenbank im Stand von Migration 9 unverändert und legt die Wächter-Tabellen an', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig10-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 9) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at, notify_services) values ('u1','anna','Anna',1,'#fff','2026-01-01T00:00:00Z','["svc"]')`);
    // der alte Stand kennt die Wächter-Tabellen noch nicht, darum Zeilen von Hand statt über den Store
    old.exec(`
      insert into boards (id, name, position, created_at, updated_at) values ('b1', 'Haushalt', 'a0', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      insert into columns (id, board_id, name, position) values ('c1', 'b1', 'Offen', 'a0');
      insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1', 'b1', 'c1', 'a0', 'Müll', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    `);
    old.close();

    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db);
    expect(s.people().map((p) => [p.name, p.notifyServices])).toEqual([['anna', ['svc']]]);
    const cards = s.getBoardView('b1').cards;
    expect(cards.map((c) => [c.title, c.watcherId])).toEqual([['Müll', null]]);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(migrations.at(-1)!.version);
    for (const t of ['watchers', 'watcher_state', 'watcher_runs', 'watcher_waiting']) {
      expect(() => new DatabaseSync(file).prepare(`select count(*) from ${t}`).get()).not.toThrow();
    }
    db.close();
  });
});

describe('Eingabe prüfen', () => {
  it('füllt Vorgaben: Zahlenwerte warten 3 Minuten, Sperrzeit 10 Minuten, Doppelkarten-Regel an', () => {
    const w = parseWatcher(input());
    expect(w.trigger).toMatchObject({ kind: 'below', value: 5, forMin: 3, count: 1, to: null });
    expect(w.cooldownMin).toBe(10);
    expect(w.dedupe).toBe(true);
    expect(w.active).toBe(true);
    expect(w.assign).toMatchObject({ mode: 'rotation_present', fallback: 'next', waitFallback: 'none' });
    expect(w.card.due).toEqual({ kind: 'in', minutes: 30 });
  });

  it('Zustandswechsel braucht einen Zielzustand und wartet vorgabegemäß nicht', () => {
    const w = parseWatcher(input({ trigger: { entityId: 'binary_sensor.tuer', kind: 'state', to: 'on' } }));
    expect(w.trigger).toMatchObject({ kind: 'state', to: 'on', forMin: 0 });
    expect(() => parseWatcher(input({ trigger: { entityId: 'binary_sensor.tuer', kind: 'state' } }))).toThrow(/Zielzustand/);
  });

  it('lehnt Unsinn mit verständlicher Meldung ab', () => {
    expect(() => parseWatcher(input({ name: '' }))).toThrow(/Name/);
    expect(() => parseWatcher(input({ trigger: { entityId: 'Kaputt', kind: 'below', value: 5 } }))).toThrow(/domain\.name/);
    expect(() => parseWatcher(input({ trigger: { entityId: 'sensor.x', kind: 'below' } }))).toThrow(/Schwellwert/);
    expect(() => parseWatcher(input({ trigger: { entityId: 'sensor.x', kind: 'below', value: 5, count: 0 } }))).toThrow(/Anzahl/);
    expect(() => parseWatcher(input({ assign: { mode: 'quatsch' } }))).toThrow(/Art der Zuweisung/);
    expect(() => parseWatcher(input({ assign: { mode: 'fixed', personIds: [] } }))).toThrow(/mindestens eine Person/);
    expect(() => parseWatcher(input({ assign: { mode: 'rotation_present', fallback: 'fixed' } }))).toThrow(/Rückfall/);
    expect(() => parseWatcher(input({ card: { boardId: 'b', columnId: 'c', title: 'x', due: { kind: 'at', day: 'gestern', time: '08:00' } } }))).toThrow(/heute oder morgen/);
    expect(() => parseWatcher(input({ nudge: { afterMin: 1 } }))).toThrow(/Zeit bis zum Nachhaken/);
  });

  it('Bedingungen: Zustand und Zahlenwerte (nicht verfügbar zählt nie)', () => {
    expect(conditionMet({ kind: 'state', to: 'off', value: null }, 'off')).toBe(true);
    expect(conditionMet({ kind: 'state', to: 'off', value: null }, 'on')).toBe(false);
    expect(conditionMet({ kind: 'below', to: null, value: 5 }, '3.2')).toBe(true);
    expect(conditionMet({ kind: 'below', to: null, value: 5 }, '5')).toBe(false);
    expect(conditionMet({ kind: 'above', to: null, value: 80 }, '81')).toBe(true);
    expect(conditionMet({ kind: 'below', to: null, value: 5 }, 'unavailable')).toBe(false);
    expect(conditionMet({ kind: 'below', to: null, value: 5 }, 'unknown')).toBe(false);
    expect(conditionMet({ kind: 'above', to: null, value: 5 }, 'abc')).toBe(false);
  });
});

describe('Datenschicht', () => {
  const setup = () => {
    let t = new Date('2026-11-04T10:00:00Z');
    const db = openDb(':memory:');
    const data = createWatcherData(db, () => t);
    return { db, data, advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
  };
  const config = (extra: Record<string, unknown> = {}): WatcherConfig => parseWatcher(input(extra));

  it('legt an, liest, ändert und löscht (mit Zustand und Läufen)', () => {
    const { data } = setup();
    const w = data.create(config());
    expect(data.list().map((x) => x.name)).toEqual(['Waschmaschine fertig']);
    expect(data.getState(w.id)).toEqual({ armed: true, metSince: null, counter: 0, counterSince: null, lastPerson: null, lastFireAt: null });

    const changed = data.update(w.id, config({ name: 'Spülmaschine fertig', cooldownMin: 5 }));
    expect(changed).toMatchObject({ name: 'Spülmaschine fertig', cooldownMin: 5, status: 'ok' });

    data.addRun({ watcherId: w.id, result: 'created', cardId: 'k1', assignedTo: ['u1'] });
    data.remove(w.id);
    expect(data.list()).toEqual([]);
    expect(() => data.get(w.id)).toThrow(/nicht gefunden/);
  });

  it('Zustand lässt sich teilweise ändern', () => {
    const { data } = setup();
    const w = data.create(config());
    data.patchState(w.id, { armed: false, counter: 2, lastPerson: 'u1' });
    expect(data.getState(w.id)).toMatchObject({ armed: false, counter: 2, lastPerson: 'u1', metSince: null });
    data.patchState(w.id, { armed: true });
    expect(data.getState(w.id).armed).toBe(true);
  });

  it('behält je Wächter nur die letzten 50 Läufe, neueste zuerst', () => {
    const { data, advance } = setup();
    const w = data.create(config());
    for (let i = 0; i < 55; i += 1) {
      advance(1000);
      data.addRun({ watcherId: w.id, result: 'counted', note: `Lauf ${i}` });
    }
    const runs = data.runs(w.id);
    expect(runs).toHaveLength(50);
    expect(runs[0]!.note).toBe('Lauf 54');
    expect(runs.at(-1)!.note).toBe('Lauf 5');
  });

  it('Läufe einer Karte kommen älteste zuerst', () => {
    const { data, advance } = setup();
    const w = data.create(config());
    data.addRun({ watcherId: w.id, result: 'created', cardId: 'k1' });
    advance(1000);
    data.addRun({ watcherId: w.id, result: 'retriggered', cardId: 'k1' });
    data.addRun({ watcherId: w.id, result: 'created', cardId: 'k2' });
    expect(data.runsOfCard('k1').map((r) => r.result)).toEqual(['created', 'retriggered']);
  });
});
