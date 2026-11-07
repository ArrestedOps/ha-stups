import { beforeEach, describe, expect, it } from 'vitest';
import { firstAt as serverFirst, nextAfter as serverNext, schedule as serverSchedule, type ReminderSpec as ServerSpec } from '../../server/src/reminders';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import {
  firstAt,
  firstChoiceOf,
  nextAfter,
  normalize,
  nudgeSentence,
  nudgeSteps,
  nudgeTimes,
  plan,
  repeatChoiceOf,
  schedule,
  splitMinutes,
  toMinutes,
  usesClock,
  validMax,
  validMinutes,
  type ReminderSpec,
} from '../src/lib/reminder';

beforeEach(() => setLanguage('de'));

const spec = (extra: Partial<ReminderSpec> = {}): ReminderSpec => ({ anchor: 'due', afterMin: 60, everyMin: null, max: 1, atTime: null, ...extra });

// Die Oberfläche zeigt den Ablauf mit ihrer Kopie der Rechnung: Sie muss dem Server auf die Minute genau entsprechen.
const SPECS: ReminderSpec[] = [
  spec({ afterMin: 60 }),
  spec({ afterMin: 5, everyMin: 5, max: 4 }),
  spec({ afterMin: 30, everyMin: 30, max: 6 }),
  spec({ afterMin: 1440, everyMin: 1440, max: 5, atTime: '09:00' }),
  spec({ afterMin: 4320, everyMin: 1440, max: 3, atTime: '18:00' }),
  spec({ afterMin: 10080, everyMin: 10080, max: 4, atTime: '07:30' }),
  spec({ afterMin: 120, everyMin: 1440, max: 3, atTime: '08:00' }),
  spec({ afterMin: 1440, everyMin: 60, max: 3, atTime: '12:00' }),
  spec({ afterMin: 2880, atTime: null }),
];
const BASES = ['2026-03-27T17:00:00Z', '2026-03-28T17:30:00Z', '2026-10-24T16:00:00Z', '2026-10-25T00:30:00Z', '2026-11-14T09:00:00Z', '2027-01-31T08:30:00Z'];
const ZONES = ['Europe/Berlin', 'America/New_York', 'Asia/Kolkata'];

describe('Nachhaken: Oberfläche und Server rechnen gleich', () => {
  it('erster Zeitpunkt, nächster und ganzer Ablauf für viele Regeln, Zeitpunkte und Zeitzonen (auch über die Zeitumstellung)', () => {
    let n = 0;
    for (const tz of ZONES)
      for (const b of BASES)
        for (const s of SPECS) {
          const base = Date.parse(b);
          expect(firstAt(s, base, tz, '18:00'), JSON.stringify({ tz, b, s })).toBe(serverFirst(s as ServerSpec, base, tz, '18:00'));
          expect(nextAfter(s, base, tz, '19:15'), JSON.stringify({ tz, b, s })).toBe(serverNext(s as ServerSpec, base, tz, '19:15'));
          expect(schedule(s, base, tz, '18:00'), JSON.stringify({ tz, b, s })).toEqual(serverSchedule(s as ServerSpec, base, tz, '18:00'));
          n += 1;
        }
    expect(n).toBe(ZONES.length * BASES.length * SPECS.length);
  });
});

describe('Nachhaken: Auswahl', () => {
  it('erkennt die Chips aus den Minuten, alles andere ist „Eigene …“', () => {
    expect(firstChoiceOf(null)).toBe('off');
    expect(firstChoiceOf(spec({ afterMin: 60 }))).toBe('h1');
    expect(firstChoiceOf(spec({ afterMin: 1440 }))).toBe('d1');
    expect(firstChoiceOf(spec({ afterMin: 4320 }))).toBe('d3');
    expect(firstChoiceOf(spec({ afterMin: 10080 }))).toBe('w1');
    expect(firstChoiceOf(spec({ afterMin: 90 }))).toBe('custom');
    expect(repeatChoiceOf(spec({ everyMin: null }))).toBe('no');
    expect(repeatChoiceOf(spec({ everyMin: 60 }))).toBe('hourly');
    expect(repeatChoiceOf(spec({ everyMin: 1440 }))).toBe('daily');
    expect(repeatChoiceOf(spec({ everyMin: 10080 }))).toBe('weekly');
    expect(repeatChoiceOf(spec({ everyMin: 45 }))).toBe('custom');
  });

  it('Zahl und Einheit hin und zurück; unfertige oder zu kleine Eingaben speichern nicht', () => {
    expect(splitMinutes(90)).toEqual({ n: 90, unit: 'min' });
    expect(splitMinutes(120)).toEqual({ n: 2, unit: 'h' });
    expect(splitMinutes(4320)).toEqual({ n: 3, unit: 'd' });
    expect(splitMinutes(20160)).toEqual({ n: 2, unit: 'w' });
    expect(toMinutes(3, 'd')).toBe(4320);
    expect(validMinutes('3', 'd')).toBe(4320);
    expect(validMinutes('4', 'min')).toBeNull();
    expect(validMinutes('', 'h')).toBeNull();
    expect(validMinutes('1,5', 'h')).toBeNull();
    expect(validMinutes('9999', 'w')).toBeNull();
    expect(validMax('5')).toBe(5);
    expect(validMax('0')).toBeNull();
    expect(validMax('100')).toBeNull();
    expect(validMax('')).toBeNull();
  });

  it('die Uhrzeit gibt es nur bei Tagen und Wochen; ohne Wiederholung ist es genau einmal', () => {
    expect(usesClock(spec({ afterMin: 60, everyMin: 60 }))).toBe(false);
    expect(usesClock(spec({ afterMin: 1440 }))).toBe(true);
    expect(usesClock(spec({ afterMin: 60, everyMin: 1440 }))).toBe(true);
    expect(normalize(spec({ afterMin: 60, everyMin: 60, max: 4, atTime: '09:00' }), '18:00')).toMatchObject({ atTime: null, max: 4 });
    expect(normalize(spec({ afterMin: 1440, everyMin: null, max: 4, atTime: null }), '18:00')).toMatchObject({ atTime: '18:00', max: 1 });
  });
});

describe('Nachhaken: Ablauf als Text', () => {
  const tz = 'Europe/Berlin';
  const due = Date.parse('2026-11-14T09:00:00Z'); // Sa 14.11. 10:00

  it('die Zeitpunkte, der letzte ist markiert', () => {
    const items = plan(spec({ afterMin: 4320, everyMin: 1440, max: 5, atTime: '09:00' }), due, tz, '18:00');
    expect(items.map((i) => i.when)).toEqual(['Di 17.11. 09:00', 'Mi 18.11. 09:00', 'Do 19.11. 09:00', 'Fr 20.11. 09:00', 'Sa 21.11. 09:00']);
    expect(items.map((i) => i.last)).toEqual([false, false, false, false, true]);
  });

  it('bei vielen Wiederholungen: der Anfang, „…“ und der letzte', () => {
    const items = plan(spec({ afterMin: 60, everyMin: 60, max: 30 }), due, tz, '18:00');
    expect(items).toHaveLength(5);
    expect(items[3]).toMatchObject({ when: '…', gap: true });
    expect(items.map((i) => i.when).slice(0, 3)).toEqual(['Sa 14.11. 11:00', 'Sa 14.11. 12:00', 'Sa 14.11. 13:00']);
    expect(items[4]!.last).toBe(true);
  });

  it('einmal: ein Zeitpunkt, nichts ist „letzte“', () => {
    expect(plan(spec({ afterMin: 60 }), due, tz, '18:00')).toEqual([{ when: 'Sa 14.11. 11:00', last: false }]);
  });
});

describe('Wächter: Stupsen', () => {
  it('Beispiel mit echten Werten: 12:00 → 12:30 · 13:00 · 13:30 (letzter)', () => {
    expect(nudgeTimes({ afterMin: 30, everyMin: 30, max: 3 })).toEqual([
      { text: '12:30', last: false },
      { text: '13:00', last: false },
      { text: '13:30', last: true },
    ]);
    expect(nudgeTimes({ afterMin: 45, everyMin: null, max: 1 })).toEqual([{ text: '12:45', last: false }]);
    expect(nudgeTimes({ afterMin: 600, everyMin: 600, max: 2 }).map((x) => x.text)).toEqual(['22:00', '+1 T. 08:00']);
  });

  it('gekürzt bei vielen', () => {
    const s = nudgeSteps({ afterMin: 10, everyMin: 10, max: 20 });
    expect(s.map((x) => x.text)).toEqual(['12:10', '12:20', '…', '15:20']);
    expect(s.at(-1)!.last).toBe(true);
  });

  it('der Satz in der Vorschau', () => {
    expect(nudgeSentence({ afterMin: 30, everyMin: 30, max: 3 })).toBe('Wird nach 30 Min. nicht erledigt, gibt es bis zu 3 Stups.');
    expect(nudgeSentence({ afterMin: 60, everyMin: null, max: 1 })).toBe('Wird nach 1 Std. nicht erledigt, gibt es einen Stups.');
    expect(nudgeSentence({ afterMin: 1440, everyMin: 60, max: 1 })).toBe('Wird nach 1 Tag nicht erledigt, gibt es einen Stups.');
  });

  it('englisch', () => {
    setLanguage('en');
    expect(nudgeSentence({ afterMin: 30, everyMin: 30, max: 3 })).toBe("If it isn't done after 30 min, there are up to 3 nudges.");
  });
});
