import { describe, expect, it } from 'vitest';
import { autoWindow, clampHours, HISTORY_MAX_POINTS, historyOf, movesInLastMonth, trendOf, windowed } from '../src/entity-history.js';
import type { WatchTrigger } from '../src/watcher-types.js';

// Feste Uhr: 4. November 2026, 12:00 UTC
const NOW = Date.parse('2026-11-04T12:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const below5: WatchTrigger = { entityId: 'sensor.leistung', kind: 'below', to: null, value: 5, forMin: 3, count: 1 };

describe('clampHours', () => {
  it('begrenzt auf 1 bis 8760 ganze Stunden (ein Jahr), Vorgabe 3', () => {
    expect(clampHours(undefined)).toBe(3);
    expect(clampHours('')).toBe(3);
    expect(clampHours('abc')).toBe(3);
    expect(clampHours('0')).toBe(1);
    expect(clampHours('-4')).toBe(1);
    expect(clampHours('2.6')).toBe(3);
    expect(clampHours('6')).toBe(6);
    expect(clampHours('99')).toBe(99);
    expect(clampHours('99999')).toBe(8760);
    expect(clampHours(5)).toBe(5);
  });
});

describe('historyOf', () => {
  it('Zahlenwerte als Punkte, Fenster von jetzt zurück, letzter Wert reicht bis jetzt', () => {
    const r = historyOf({
      history: [
        { state: '120', at: at(180) },
        { state: '2', at: at(100) },
        { state: '130', at: at(60) },
      ],
      nowMs: NOW,
      hours: 3,
      trigger: null,
      cooldownMin: 10,
    });
    expect(r.status).toBe('ok');
    expect(r.kind).toBe('numeric');
    expect(r.from).toBe(at(180));
    expect(r.to).toBe(at(0));
    expect(r.points.map((p) => p.v)).toEqual([120, 2, 130, 130]);
    expect(r.points.at(-1)!.at).toBe(at(0));
    expect(r.current).toBe('130');
    expect(r.min).toBe(2);
    expect(r.max).toBe(130);
    expect(r.fired).toEqual([]);
  });

  it('der Auslösepunkt kommt aus derselben Rechnung wie der Probelauf: erst nach der Mindestdauer', () => {
    const r = historyOf({
      history: [
        { state: '300', at: at(170) },
        { state: '2', at: at(100) }, // ab hier unter 5 W
        { state: '300', at: at(50) },
      ],
      nowMs: NOW,
      hours: 3,
      trigger: below5,
      cooldownMin: 10,
    });
    expect(r.fired).toEqual([{ at: at(97) }]); // 100 Minuten zurück plus 3 Minuten
  });

  it('kurze Pausen unter der Mindestdauer lösen nicht aus', () => {
    const r = historyOf({
      history: [
        { state: '300', at: at(170) },
        { state: '2', at: at(100) },
        { state: '300', at: at(98) }, // nur 2 Minuten
      ],
      nowMs: NOW,
      hours: 3,
      trigger: below5,
      cooldownMin: 10,
    });
    expect(r.fired).toEqual([]);
  });

  it('galt die Bedingung schon am Anfang des Fensters, löst sie dort nicht aus', () => {
    const r = historyOf({ history: [{ state: '1', at: at(180) }, { state: '1', at: at(120) }], nowMs: NOW, hours: 3, trigger: below5, cooldownMin: 10 });
    expect(r.fired).toEqual([]);
  });

  it('Zustände (an/aus) werden zu Stufen: Zahl je Zustand, Namen in der Reihenfolge des Auftretens', () => {
    const r = historyOf({
      history: [
        { state: 'off', at: at(150) },
        { state: 'on', at: at(90) },
        { state: 'off', at: at(30) },
      ],
      nowMs: NOW,
      hours: 3,
      trigger: { entityId: 'binary_sensor.tuer', kind: 'state', to: 'on', value: null, forMin: 0, count: 1 },
      cooldownMin: 10,
    });
    expect(r.kind).toBe('state');
    expect(r.states).toEqual(['off', 'on']);
    expect(r.points.map((p) => p.v)).toEqual([0, 1, 0, 0]);
    expect(r.fired).toEqual([{ at: at(90) }]);
    expect(r.min).toBeNull();
    expect(r.current).toBe('off');
  });

  it('unavailable und unknown sind Lücken, keine Werte', () => {
    const r = historyOf({
      history: [
        { state: '10', at: at(170) },
        { state: 'unavailable', at: at(120) },
        { state: 'unknown', at: at(110) },
        { state: '20', at: at(60) },
      ],
      nowMs: NOW,
      hours: 3,
      trigger: null,
      cooldownMin: 10,
    });
    expect(r.kind).toBe('numeric');
    expect(r.points.map((p) => p.v)).toEqual([10, 20, 20]);
  });

  it('Zustände vor dem Fenster rücken an den Anfang, spätere Zeitpunkte bleiben aus, ein einziger Wert ist eine gerade Linie', () => {
    const r = historyOf({
      history: [
        { state: '42', at: at(500) },
        { state: '99', at: new Date(NOW + 60_000).toISOString() }, // liegt in der Zukunft
      ],
      nowMs: NOW,
      hours: 3,
      trigger: null,
      cooldownMin: 10,
    });
    expect(r.points).toEqual([
      { at: at(180), v: 42 },
      { at: at(0), v: 42 },
    ]);
  });

  it('ohne Zustände: keine Daten', () => {
    const r = historyOf({ history: [], nowMs: NOW, hours: 3, trigger: null, cooldownMin: 10 });
    expect(r).toMatchObject({ status: 'no_data', points: [], fired: [], current: null });
    const only = historyOf({ history: [{ state: 'unavailable', at: at(60) }], nowMs: NOW, hours: 3, trigger: null, cooldownMin: 10 });
    expect(only.status).toBe('no_data');
  });

  it('sehr viele Zustände: höchstens so viele Punkte, Ausschläge und Ränder bleiben erhalten', () => {
    const history = Array.from({ length: 10_000 }, (_, i) => ({ state: i === 5_000 ? '9999' : String(i % 7), at: new Date(NOW - 180 * 60_000 + i * 1000).toISOString() }));
    const r = historyOf({ history, nowMs: NOW, hours: 3, trigger: null, cooldownMin: 10 });
    expect(r.points.length).toBeLessThanOrEqual(HISTORY_MAX_POINTS + 2);
    expect(r.max).toBe(9999);
    expect(Math.max(...r.points.map((p) => p.v))).toBe(9999);
    expect(r.points[0]!.at).toBe(history[0]!.at);
    expect(r.points.at(-1)!.at).toBe(at(0));
    const times = r.points.map((p) => Date.parse(p.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('Kalender und Vorhersage haben keine Auslösepunkte', () => {
    const r = historyOf({
      history: [{ state: 'rain', at: at(100) }],
      nowMs: NOW,
      hours: 3,
      trigger: { entityId: 'weather.home', kind: 'forecast', to: null, value: null, forMin: 0, count: 1, forecast: { condition: 'rain', hours: 3 } },
      cooldownMin: 10,
    });
    expect(r.fired).toEqual([]);
  });
});

describe('windowed', () => {
  it('schneidet auf das Fenster zu und behält den letzten Zustand davor', () => {
    const h = [{ state: '1', at: at(500) }, { state: '2', at: at(400) }, { state: '3', at: at(100) }, { state: '4', at: at(10) }];
    expect(windowed(h, NOW - 200 * 60_000).map((p) => p.state)).toEqual(['2', '3', '4']);
    expect(windowed(h, NOW - 5 * 60_000).map((p) => p.state)).toEqual(['4']);
    expect(windowed([], NOW)).toEqual([]);
  });
});

describe('autoWindow', () => {
  const run = (pts: [string, number][]) => autoWindow(pts.map(([state, min]) => ({ state, at: at(min) })), NOW);
  it('Zustände: ein Tag; wenig Bewegung: „slow“; viel: 3 Std., 24 Std., 7 Tage', () => {
    expect(run([['off', 900], ['on', 100]])).toBe(24);
    expect(run([])).toBe(24);
    expect(run([['16', 8000], ['16', 100], ['unavailable', 50], ['16', 40]])).toBe('slow');
    expect(run(Array.from({ length: 80 }, (_, i) => [String(i), 170 - i * 2] as [string, number]))).toBe(3);
    expect(run(Array.from({ length: 10 }, (_, i) => [String(i), 1200 - i * 100] as [string, number]))).toBe(24);
    expect(run(Array.from({ length: 10 }, (_, i) => [String(i), 9000 - i * 800] as [string, number]))).toBe(168);
  });
});

describe('movesInLastMonth', () => {
  const day = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  it('mehr als 5 % Bewegung im letzten Monat', () => {
    expect(movesInLastMonth([{ at: day(300), mean: 100 }, { at: day(20), mean: 16 }, { at: day(1), mean: 16 }], NOW)).toBe(false); // der Sprung liegt vor dem Monat
    expect(movesInLastMonth([{ at: day(25), mean: 30 }, { at: day(1), mean: 16 }], NOW)).toBe(true);
    expect(movesInLastMonth([], NOW)).toBe(false);
  });
});

describe('trendOf', () => {
  const day = 86_400_000;
  const series = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ ms: NOW - (n - i) * day, v: f(i) }));
  it('sinkende Batterie: je Monat und Tage bis zur Schwelle', () => {
    const tr = trendOf(series(200, (i) => 100 - i * 0.3), { kind: 'below', value: 20 }, 40.7)!;
    expect(tr.perMonth).toBeCloseTo(-9, 0);
    expect(tr.reachDays).toBe(69); // (40,7 - 20) / 0,3
  });
  it('Ausreißer stören nicht; neue Batterie in der Mitte: nur der Verlauf danach zählt', () => {
    const pts = series(240, (i) => (i < 100 ? 90 - i * 0.5 : 100 - (i - 100) * 0.25));
    pts[239]!.v = 100; // kurzer Ausschlag am Ende
    pts[50]!.v = 0;
    const tr = trendOf(pts, null, 66)!;
    expect(tr.perMonth).toBeCloseTo(-7.5, 0);
    expect(tr.reachDays).toBeNull();
  });
  it('kein klarer Verlauf (flach, wild, zu kurz): null; steigend gegen „unter“: kein Termin', () => {
    expect(trendOf(series(100, () => 50), null, 50)).toBeNull();
    expect(trendOf(series(100, (i) => (i % 2 ? 10 : 90)), null, 90)).toBeNull();
    expect(trendOf(series(5, (i) => 100 - i * 10), null, 60)).toBeNull();
    expect(trendOf(series(60, (i) => 10 + i), { kind: 'below', value: 5 }, 70)!.reachDays).toBeNull();
    expect(trendOf(series(60, (i) => 10 + i), { kind: 'above', value: 100 }, 70)!.reachDays).toBe(30);
  });
});
