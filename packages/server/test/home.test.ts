import { describe, expect, it } from 'vitest';
import { phaseOf, type PhaseInput } from '../src/home.js';
import type { Watcher } from '../src/watcher-data.js';

const NOW = '2026-11-04T09:00:00.000Z';
/** Ein Leistungssensor: der Wert über der Schwelle heißt, das Gerät läuft */
const POWER = { unit: 'W', deviceClass: 'power' };

const watcher = (over: Partial<Watcher['trigger']> = {}, count = 1): Watcher =>
  ({
    id: 'w1',
    name: 'Waschmaschine fertig',
    active: true,
    status: 'ok',
    trigger: { entityId: 'sensor.wm', kind: 'below', to: null, value: 5, forMin: 3, count, ...over },
    card: { title: 'Wäsche aufhängen' },
    lastFiredAt: null,
  }) as unknown as Watcher;

const base = (over: Partial<PhaseInput>): PhaseInput => ({
  watcher: watcher(),
  seen: { state: '120', lastChanged: '2026-11-04T08:50:00Z', ...POWER },
  lastFireAt: null,
  counter: 0,
  openCard: null,
  memory: { runningSince: null, touched: false },
  nextEvent: null,
  nowIso: NOW,
  ...over,
});

describe('phaseOf: Wartet auf jemanden', () => {
  it('eine offene Karte des Wächters, Alter ab Anlegen', () => {
    const p = phaseOf(base({ openCard: { id: 'c1', createdAt: '2026-11-04T08:40:00Z' } }));
    expect(p).toEqual({ phase: 'waiting', since: '2026-11-04T08:40:00Z' });
  });
});

describe('phaseOf: Läuft gerade', () => {
  it('below: Wert über der Schwelle = die Maschine läuft, Dauer ab merkbarem Beginn', () => {
    const p = phaseOf(base({ memory: { runningSince: '2026-11-04T08:20:00Z', touched: false } }));
    expect(p).toEqual({ phase: 'running', since: '2026-11-04T08:20:00Z' });
  });

  it('below: Wert unter der Schwelle (Bedingung erfüllt, Karte folgt gleich) ist ruhig', () => {
    expect(phaseOf(base({ seen: { state: '1', lastChanged: null, ...POWER } })).phase).toBe('quiet');
  });

  it('below: kein Zahlenwert (unavailable) ist ruhig', () => {
    expect(phaseOf(base({ seen: { state: 'unavailable', lastChanged: null } })).phase).toBe('quiet');
  });

  it('above: darunter, aber zuletzt darüber gewesen = läuft', () => {
    const w = watcher({ kind: 'above', value: 30 });
    expect(phaseOf(base({ watcher: w, seen: { state: '20', lastChanged: null, ...POWER }, memory: { runningSince: '2026-11-04T08:30:00Z', touched: true } })).phase).toBe('running');
    expect(phaseOf(base({ watcher: w, seen: { state: '20', lastChanged: null, ...POWER }, memory: { runningSince: null, touched: false } })).phase).toBe('quiet');
  });

  it('state: nicht im Zielzustand und seit dem letzten Auslösen verändert', () => {
    const w = watcher({ kind: 'state', to: 'finished', value: null });
    const seen = { state: 'running', lastChanged: '2026-11-04T08:30:00Z' };
    expect(phaseOf(base({ watcher: w, seen, lastFireAt: '2026-11-03T20:00:00Z' })).phase).toBe('running');
    // seit dem letzten Auslösen nichts verändert: ruhig
    expect(phaseOf(base({ watcher: w, seen, lastFireAt: '2026-11-04T08:45:00Z' })).phase).toBe('quiet');
    // noch nie ausgelöst: ruhig (sonst wäre jede Tür „im Gang")
    expect(phaseOf(base({ watcher: w, seen, lastFireAt: null })).phase).toBe('quiet');
    // im Zielzustand: ruhig
    expect(phaseOf(base({ watcher: w, seen: { state: 'finished', lastChanged: '2026-11-04T08:59:00Z' }, lastFireAt: '2026-11-03T20:00:00Z' })).phase).toBe('quiet');
  });
});

describe('phaseOf: nur Vorgänge laufen (Batterie, Temperatur & Co. sind ruhig)', () => {
  const battery = (state: string, over: Partial<Watcher['trigger']> = {}) =>
    base({ watcher: watcher({ entityId: 'sensor.handy_battery', value: 10, forMin: 10, ...over }), seen: { state, lastChanged: '2026-11-04T08:00:00Z', unit: '%', deviceClass: 'battery' } });

  it('Batterie über der Schwelle (26 % bei „unter 10 %") ist ruhig, nicht „läuft gerade"', () => {
    expect(phaseOf(battery('26'))).toEqual({ phase: 'quiet', since: null });
  });

  it('Batterie unter der Schwelle ist ruhig', () => {
    expect(phaseOf(battery('7')).phase).toBe('quiet');
  });

  it('Batterie mit „darüber" und einmal berührt ist ruhig', () => {
    const input = battery('30', { kind: 'above', value: 50 });
    expect(phaseOf({ ...input, memory: { runningSince: '2026-11-04T08:30:00Z', touched: true } }).phase).toBe('quiet');
  });

  it.each([
    ['Temperatur', { state: '25', lastChanged: null, unit: '°C', deviceClass: 'temperature' }],
    ['Luftfeuchte', { state: '55', lastChanged: null, unit: '%', deviceClass: 'humidity' }],
    ['Füllstand ohne Geräteklasse', { state: '80', lastChanged: null, unit: '%' }],
    ['unbekannte Einheit, keine Geräteklasse', { state: '80', lastChanged: null }],
    ['Zahl mit fremder Einheit', { state: '80', lastChanged: null, unit: 'lx' }],
  ])('%s ist konservativ ruhig', (_n, seen) => {
    expect(phaseOf(base({ seen })).phase).toBe('quiet');
  });

  it.each([
    ['Leistung mit Geräteklasse', { state: '120', lastChanged: null, unit: 'W', deviceClass: 'power' }],
    ['Leistung in kW ohne Geräteklasse', { state: '12', lastChanged: null, unit: 'kW' }],
    ['Strom in A', { state: '40', lastChanged: null, unit: 'A' }],
    ['Energie', { state: '30', lastChanged: null, unit: 'kWh', deviceClass: 'energy' }],
  ])('%s: über der Schwelle läuft ein Vorgang', (_n, seen) => {
    expect(phaseOf(base({ seen, memory: { runningSince: '2026-11-04T08:20:00Z', touched: false } })).phase).toBe('running');
  });

  it('Waschmaschine über 5 W läuft, unter 5 W ist ruhig (ausgelöst)', () => {
    expect(phaseOf(base({ seen: { state: '120', lastChanged: null, ...POWER } })).phase).toBe('running');
    expect(phaseOf(base({ seen: { state: '2', lastChanged: null, ...POWER } })).phase).toBe('quiet');
  });

  it('läuft ein Vorgang, ohne dass der Beginn bekannt ist, steht keine Dauer da (nichts erfunden)', () => {
    expect(phaseOf(base({ memory: { runningSince: null, touched: false } }))).toEqual({ phase: 'running', since: null });
  });
});

describe('phaseOf: Bald dran', () => {
  it('Zähler 2 von 3', () => {
    expect(phaseOf(base({ watcher: watcher({}, 3), seen: { state: '1', lastChanged: null }, counter: 2 }))).toMatchObject({ phase: 'soon' });
  });

  it('Zähler 0 ist ruhig', () => {
    expect(phaseOf(base({ watcher: watcher({}, 3), seen: { state: '1', lastChanged: null }, counter: 0 })).phase).toBe('quiet');
  });

  it('ein nächster Termin (Kalender-Wächter) ist „bald dran"', () => {
    const p = phaseOf(base({ seen: { state: 'off', lastChanged: null }, nextEvent: { title: 'Biotonne', at: '2026-11-05T05:00:00Z' } }));
    expect(p.phase).toBe('soon');
  });
});

describe('phaseOf: Ruhig', () => {
  it('fehlende Entität ist ruhig', () => {
    expect(phaseOf(base({ seen: null })).phase).toBe('quiet');
  });
});
