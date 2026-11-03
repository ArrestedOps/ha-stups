import { describe, expect, it } from 'vitest';
import { DRY_RUN_MAX_STATES, dryRun, type HistoryPoint } from '../src/dry-run.js';
import type { WatchTrigger } from '../src/watcher-types.js';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const at = (min: number) => new Date(NOW - min * 60_000).toISOString();
const pt = (min: number, state: string): HistoryPoint => ({ state, at: at(min) });
const below = (over: Partial<WatchTrigger> = {}): WatchTrigger => ({ entityId: 'sensor.x', kind: 'below', to: null, value: 5, forMin: 3, count: 1, ...over });
const run = (history: HistoryPoint[], trigger = below(), cooldownMin = 10) => dryRun({ trigger, cooldownMin }, history, NOW);

// drei Trockengänge: 120 W für eine Stunde, dann 1 W
const cycles = (): HistoryPoint[] => [
  pt(2000, '1'), pt(1900, '120'), pt(1840, '1'), // Gang 1 endet bei 1840
  pt(1000, '130'), pt(940, '2'), // Gang 2
  pt(300, '110'), pt(240, '1'), // Gang 3
];

describe('Probelauf: zahlenbasierte Bedingung', () => {
  it('erkennt drei Gänge, kein Fehlalarm', () => {
    const r = run(cycles());
    expect(r.noHistory).toBe(false);
    expect(r.fired).toHaveLength(3);
    // Mindestdauer 3 Min.: Auslösung 3 Minuten nach dem Abfallen
    expect(r.fired[0]!.at).toBe(at(1840 - 3));
    expect(r.quick).toBe(0);
    expect(r.sentence).toBe('3 Auslösungen erkannt, kein Fehlalarm');
  });

  it('Mindestdauer: ein kurzes Abfallen unter 3 Minuten löst nicht aus', () => {
    const h = [pt(500, '120'), pt(400, '1'), pt(398, '90'), pt(300, '1')];
    // zwischen 400 und 398 nur 2 Minuten unter der Schwelle: erst 300 löst aus
    const r = run(h);
    expect(r.fired.map((f) => f.at)).toEqual([at(300 - 3)]);
  });

  it('Wackeln: viele Auslösungen kurz hintereinander werden gezählt und mit Hinweis genannt', () => {
    const h: HistoryPoint[] = [pt(200, '120')];
    // fünf Mal: 3 Minuten unter 5 W, dann wieder darüber, im Abstand von 7 Minuten
    for (let i = 0; i < 5; i += 1) {
      h.push(pt(190 - i * 7, '1'), pt(186 - i * 7, '120'));
    }
    const r = run(h, below(), 0);
    expect(r.fired.length).toBe(5);
    expect(r.quick).toBe(4);
    expect(r.sentence).toBe('5 Mal ausgelöst, davon 4 innerhalb von 10 Minuten: Mindestdauer erhöhen?');
  });

  it('Sperrzeit unterdrückt Auslösungen nach der ersten', () => {
    const h: HistoryPoint[] = [pt(200, '120'), pt(190, '1'), pt(180, '120'), pt(170, '1'), pt(160, '120')];
    expect(run(h, below(), 0).fired).toHaveLength(2);
    expect(run(h, below(), 30).fired).toHaveLength(1);
  });

  it('war die Bedingung schon am Anfang erfüllt, löst erst der nächste Wechsel aus (wie beim Speichern des Wächters)', () => {
    const h = [pt(500, '1'), pt(400, '120'), pt(300, '1')];
    expect(run(h).fired).toHaveLength(1);
  });

  it('unavailable und unknown zählen nicht als erfüllt', () => {
    const h = [pt(500, '120'), pt(400, 'unavailable'), pt(300, 'unknown'), pt(200, '120')];
    expect(run(h).fired).toEqual([]);
    expect(run(h).sentence).toBe('In den letzten 7 Tagen hätte der Wächter nie ausgelöst.');
  });

  it('Zähler: erst bei jedem dritten Auslösen eine Karte', () => {
    const h: HistoryPoint[] = [pt(900, '120')];
    for (let i = 0; i < 4; i += 1) h.push(pt(800 - i * 100, '1'), pt(750 - i * 100, '120'));
    expect(run(h, below({ count: 3 }), 0).fired).toHaveLength(1);
  });
});

describe('Probelauf: Zustandswechsel', () => {
  it('state: Wechsel in den Zielzustand, Diagramm mit 0/1', () => {
    const h = [pt(300, 'run'), pt(200, 'finished'), pt(100, 'run'), pt(50, 'finished')];
    const r = run(h, { entityId: 'sensor.x', kind: 'state', to: 'finished', value: null, forMin: 0, count: 1 });
    expect(r.fired).toHaveLength(2);
    expect(r.points.map((p) => p.v)).toEqual([0, 1, 0, 1]);
  });
});

describe('Probelauf: fehlende oder große Historie', () => {
  it('ohne Historie ein Hinweis statt eines Diagramms', () => {
    for (const h of [[], [pt(10, '1')]]) {
      const r = run(h);
      expect(r).toMatchObject({ noHistory: true, fired: [], points: [] });
      expect(r.sentence).toContain('keine Historie');
    }
  });

  it('nur unavailable ist keine brauchbare Historie', () => {
    expect(run([pt(100, 'unavailable'), pt(50, 'unavailable')]).noHistory).toBe(true);
  });

  it('mehr als 20 000 Zustände: es werden nur die ersten gelesen, und die Antwort sagt es', () => {
    const big: HistoryPoint[] = Array.from({ length: DRY_RUN_MAX_STATES + 500 }, (_, i) => ({ state: i % 2 ? '120' : '1', at: new Date(NOW - (DRY_RUN_MAX_STATES + 500 - i) * 1000).toISOString() }));
    const r = run(big, below({ forMin: 0 }));
    expect(r.truncated).toBe(true);
    expect(r.points.length).toBeLessThanOrEqual(240);
  });

  it('Zeitpunkte in der Zukunft und kaputte Zeiten werden übergangen', () => {
    const h = [pt(300, '120'), { state: '1', at: 'kaputt' }, pt(-60, '1'), pt(200, '1')];
    expect(run(h).fired).toHaveLength(1);
  });
});
