import { describe, expect, it } from 'vitest';
import { clampHours, HISTORY_MAX_POINTS, historyOf } from '../src/entity-history.js';
import type { WatchTrigger } from '../src/watcher-types.js';

// Feste Uhr: 4. November 2026, 12:00 UTC
const NOW = Date.parse('2026-11-04T12:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const below5: WatchTrigger = { entityId: 'sensor.leistung', kind: 'below', to: null, value: 5, forMin: 3, count: 1 };

describe('clampHours', () => {
  it('begrenzt auf 1 bis 24 ganze Stunden, Vorgabe 3', () => {
    expect(clampHours(undefined)).toBe(3);
    expect(clampHours('')).toBe(3);
    expect(clampHours('abc')).toBe(3);
    expect(clampHours('0')).toBe(1);
    expect(clampHours('-4')).toBe(1);
    expect(clampHours('2.6')).toBe(3);
    expect(clampHours('6')).toBe(6);
    expect(clampHours('99')).toBe(24);
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
