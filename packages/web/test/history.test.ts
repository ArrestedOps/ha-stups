import { afterEach, describe, expect, it } from 'vitest';
import { firedText, graphAlt, graphOf, type EntityHistory, valueText, windowText } from '../src/lib/history';
import { setLanguage } from '../src/lib/i18n/index.svelte';

// Feste Uhr: Mi 04.11.2026, 12:00 UTC = 13:00 Berlin
const NOW = Date.parse('2026-11-04T12:00:00Z');
const TZ = 'Europe/Berlin';
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

const numeric = (over: Partial<EntityHistory> = {}): EntityHistory => ({
  status: 'ok',
  from: at(180),
  to: at(0),
  hours: 3,
  kind: 'numeric',
  states: [],
  points: [
    { at: at(180), v: 0 },
    { at: at(90), v: 100 },
    { at: at(0), v: 50 },
  ],
  fired: [],
  current: '50',
  min: 0,
  max: 100,
  ...over,
});

afterEach(() => setLanguage('de'));

const opts = { width: 340, height: 120, top: 18, bottom: 112 };
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('Diagramm: Linie, Fläche, Schwelle, Auslösepunkt', () => {
  it('Zeit läuft von links nach rechts über die ganze Breite, hohe Werte oben', () => {
    const g = graphOf(numeric(), { ...opts, threshold: null })!;
    // (x, y): 0 → ganz unten, 100 → ganz oben, Ende rechts
    expect(nums(g.line)).toEqual([0, 112, 170, 18, 340, 65]);
    expect(g.thresholdY).toBeNull();
    expect(g.area.startsWith(g.line)).toBe(true);
    expect(g.area.endsWith('L340 120 L0 120 Z')).toBe(true);
  });

  it('die Schwelle gehört zum Wertebereich: eine Schwelle über dem Maximum weitet ihn, die Linie liegt innerhalb', () => {
    const g = graphOf(numeric(), { ...opts, threshold: 200 })!;
    expect(g.thresholdY).toBe(18);
    // 100 liegt jetzt in der Mitte zwischen 0 und 200
    expect(nums(g.line)[3]).toBeCloseTo(65, 1);
    const low = graphOf(numeric(), { ...opts, threshold: 5 })!;
    expect(low.thresholdY).toBeCloseTo(112 - (5 / 100) * 94, 1);
  });

  it('Auslösepunkt sitzt auf der Linie zur Auslösezeit (zwischen den Punkten gerade verbunden)', () => {
    const g = graphOf(numeric({ fired: [{ at: at(135) }] }), { ...opts, threshold: 5 })!;
    expect(g.marks).toHaveLength(1);
    expect(g.marks[0]!.x).toBeCloseTo(85, 1); // 45 von 180 Minuten
    expect(g.marks[0]!.y).toBeCloseTo(112 - 0.5 * 94, 1); // halbe Höhe zwischen 0 und 100
    expect(g.marks[0]!.at).toBe(at(135));
  });

  it('eine gerade Linie (ein Wert) liegt in der Mitte und bricht nichts', () => {
    const g = graphOf(numeric({ points: [{ at: at(180), v: 7 }, { at: at(0), v: 7 }], min: 7, max: 7 }), { ...opts, threshold: null })!;
    expect(nums(g.line)).toEqual([0, 65, 340, 65]);
  });

  it('Zustände: Stufen, die Zielstufe ist die gestrichelte Linie, Anfang der Stufe bleibt bis zum nächsten Wechsel', () => {
    const h = numeric({
      kind: 'state',
      states: ['off', 'on'],
      points: [
        { at: at(180), v: 0 },
        { at: at(90), v: 1 },
        { at: at(0), v: 1 },
      ],
      min: null,
      max: null,
      current: 'on',
    });
    const g = graphOf(h, { ...opts, threshold: null, thresholdState: 'on' })!;
    expect(g.line).toBe('M0 112 L170 112 L170 18 L340 18');
    expect(g.thresholdY).toBe(18);
    expect(graphOf(h, { ...opts, threshold: null, thresholdState: 'gibt-es-nicht' })!.thresholdY).toBeNull();
  });

  it('ohne Verlauf kein Diagramm', () => {
    expect(graphOf(numeric({ status: 'no_data', points: [] }), { ...opts, threshold: null })).toBeNull();
    expect(graphOf(numeric({ status: 'unavailable', points: [] }), { ...opts, threshold: null })).toBeNull();
    expect(graphOf(numeric({ points: [{ at: at(0), v: 1 }] }), { ...opts, threshold: null })).toBeNull();
  });
});

describe('Beschriftung', () => {
  it('„heute 10:58 ausgelöst": Uhrzeit in der Zeitzone des Geräts', () => {
    // 09:58 UTC = 10:58 Berlin
    expect(firedText([{ at: '2026-11-04T09:58:00Z' }], NOW, TZ)).toBe('heute 10:58 ausgelöst');
    expect(firedText([{ at: '2026-11-04T09:58:00Z' }], NOW, 'UTC')).toBe('heute 09:58 ausgelöst');
  });

  it('gestern, wenn das Fenster über Mitternacht reicht (Zeitzone des Geräts, nicht UTC)', () => {
    // 23:30 UTC am 3.11. = 00:30 Berlin am 4.11. → heute; 22:30 UTC = 23:30 Berlin am 3.11. → gestern
    expect(firedText([{ at: '2026-11-03T23:30:00Z' }], NOW, TZ)).toBe('heute 00:30 ausgelöst');
    expect(firedText([{ at: '2026-11-03T22:30:00Z' }], NOW, TZ)).toBe('gestern 23:30 ausgelöst');
  });

  it('mehrere Auslösungen: Anzahl und die letzte; keine: „nicht ausgelöst"', () => {
    expect(firedText([{ at: '2026-11-04T08:00:00Z' }, { at: '2026-11-04T09:58:00Z' }], NOW, TZ)).toBe('2 Mal ausgelöst, zuletzt heute 10:58');
    expect(firedText([], NOW, TZ)).toBe('nicht ausgelöst');
  });

  it('Englisch', () => {
    setLanguage('en');
    expect(firedText([{ at: '2026-11-04T09:58:00Z' }], NOW, TZ)).toBe('triggered today 10:58');
    expect(firedText([], NOW, TZ)).toBe('not triggered');
    expect(windowText(3)).toBe('3 h ago');
  });

  it('Fenster: „vor 3 Std."', () => {
    expect(windowText(3)).toBe('vor 3 Std.');
    expect(windowText(1)).toBe('vor 1 Std.');
  });

  it('Werte mit Einheit und Dezimalkomma', () => {
    expect(valueText('412', 'W')).toBe('412 W');
    expect(valueText('21.54', '°C')).toBe('21,5 °C');
    expect(valueText('on', null)).toBe('on');
    expect(valueText(null, 'W')).toBe('');
  });

  it('Textalternative: Name, jetzt, Spanne, Schwelle und Auslösung', () => {
    const alt = graphAlt(numeric({ fired: [{ at: '2026-11-04T09:58:00Z' }], current: '50' }), { name: 'Waschmaschine Leistung', unit: 'W', threshold: 5, now: NOW, tz: TZ });
    expect(alt).toBe('Verlauf der letzten 3 Stunden: Waschmaschine Leistung, jetzt 50 W, zwischen 0 W und 100 W. Schwelle bei 5 W. heute 10:58 ausgelöst.');
    const states = graphAlt(numeric({ kind: 'state', states: ['off', 'on'], min: null, max: null, current: 'on' }), { name: 'Tür', unit: null, threshold: null, now: NOW, tz: TZ });
    expect(states).toBe('Verlauf der letzten 3 Stunden: Tür, jetzt on, Zustände: off, on. nicht ausgelöst.');
  });
});
