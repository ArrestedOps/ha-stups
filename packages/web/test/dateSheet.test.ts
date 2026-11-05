import { describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { compose, defaultPick, localParts, minuteOptions, monthCells, pickedIso, shiftMonth, stepWheel, summaryFull, summaryTitle, todayOf, wheelWindow, ymdKey } from '../src/lib/dateSheet';
import { isFuture } from '../src/lib/datetime';

const TZ = 'Europe/Berlin';
// Der Rechner läuft in UTC, die App in Europe/Berlin: rund um Mitternacht gehen beide um eine Stunde (Winter) bzw. zwei (Sommer) auseinander
const BEFORE_MIDNIGHT = Date.parse('2026-11-04T22:59:59Z'); // 04.11., 23:59:59 in Berlin
const AT_MIDNIGHT = Date.parse('2026-11-04T23:00:00Z'); // 05.11., 00:00:00 in Berlin
const SUMMER_BEFORE = Date.parse('2026-07-14T21:59:59Z'); // 14.07., 23:59:59 in Berlin
const SUMMER_AT = Date.parse('2026-07-14T22:00:00Z'); // 15.07., 00:00:00 in Berlin

describe('heute rund um Mitternacht (Zeitzone des Geräts, nicht UTC)', () => {
  it('eine Sekunde vor und nach Mitternacht, Winter', () => {
    expect(ymdKey(todayOf(BEFORE_MIDNIGHT, TZ))).toBe('2026-11-04');
    expect(ymdKey(todayOf(AT_MIDNIGHT, TZ))).toBe('2026-11-05');
  });
  it('Sommerzeit', () => {
    expect(ymdKey(todayOf(SUMMER_BEFORE, TZ))).toBe('2026-07-14');
    expect(ymdKey(todayOf(SUMMER_AT, TZ))).toBe('2026-07-15');
  });
  it('in einer anderen Zeitzone ist es noch ein anderer Tag', () => {
    expect(ymdKey(todayOf(AT_MIDNIGHT, 'America/New_York'))).toBe('2026-11-04');
    expect(ymdKey(todayOf(AT_MIDNIGHT, 'Asia/Tokyo'))).toBe('2026-11-05');
  });
  it('„heute“ und „morgen“ in der Überschrift wechseln genau um Mitternacht', () => {
    setLanguage('de');
    const due = compose({ y: 2026, m: 11, d: 5 }, 8, 30, TZ);
    expect(summaryTitle(due, BEFORE_MIDNIGHT, TZ)).toBe('Morgen, 08:30');
    expect(summaryTitle(due, AT_MIDNIGHT, TZ)).toBe('Heute, 08:30');
  });
  it('die Regel „Geplant nur mit Termin nach heute“: ein Termin um 00:00 des nächsten Tages liegt nach heute, bis Mitternacht vorbei ist', () => {
    const due = compose({ y: 2026, m: 11, d: 5 }, 0, 0, TZ);
    expect(isFuture(due, BEFORE_MIDNIGHT, TZ)).toBe(true);
    expect(isFuture(due, AT_MIDNIGHT, TZ)).toBe(false);
    const evening = compose({ y: 2026, m: 11, d: 4 }, 23, 55, TZ);
    expect(isFuture(evening, BEFORE_MIDNIGHT, TZ)).toBe(false);
  });
  it('die Vorbelegung ohne Termin ist heute um die Standardzeit, auch kurz vor Mitternacht', () => {
    expect(defaultPick(BEFORE_MIDNIGHT, TZ, '09:00')).toEqual({ ymd: { y: 2026, m: 11, d: 4 }, h: 9, mi: 0 });
    expect(defaultPick(AT_MIDNIGHT, TZ, '18:30')).toEqual({ ymd: { y: 2026, m: 11, d: 5 }, h: 18, mi: 30 });
    expect(defaultPick(AT_MIDNIGHT, TZ, 'kaputt')).toEqual({ ymd: { y: 2026, m: 11, d: 5 }, h: 9, mi: 0 });
  });
});

describe('Termin zerlegen und zusammensetzen', () => {
  it('Hin und zurück in Ortszeit (Winter und Sommer)', () => {
    for (const iso of ['2026-11-04T18:00:00.000Z', '2026-07-14T07:30:00.000Z', '2026-03-29T01:30:00.000Z']) {
      const p = localParts(iso, TZ)!;
      expect(compose(p.ymd, p.h, p.mi, TZ)).toBe(iso);
    }
  });
  it('19:00 in Berlin ist 18:00 UTC im Winter', () => {
    expect(compose({ y: 2026, m: 11, d: 5 }, 19, 0, TZ)).toBe('2026-11-05T18:00:00.000Z');
    expect(localParts('2026-11-05T18:00:00.000Z', TZ)).toEqual({ ymd: { y: 2026, m: 11, d: 5 }, h: 19, mi: 0 });
  });
  it('kein Termin: nichts zu zerlegen', () => {
    expect(localParts(null, TZ)).toBeNull();
  });
  it('die Lücke der Sommerzeit-Umstellung (02:30 am 29.03.2026 gibt es nicht) ergibt eine gültige Uhrzeit', () => {
    const iso = compose({ y: 2026, m: 3, d: 29 }, 2, 30, TZ);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
    expect(Math.abs(Date.parse(iso) - Date.parse('2026-03-29T01:00:00Z'))).toBeLessThanOrEqual(3_600_000);
  });
  it('pickedIso setzt aus Auswahl und Uhrzeit den Termin zusammen', () => {
    expect(pickedIso({ ymd: { y: 2026, m: 12, d: 24 }, h: 9, mi: 5 }, TZ)).toBe('2026-12-24T08:05:00.000Z');
  });
});

describe('Monatskalender', () => {
  it('beginnt am Montag und füllt ganze Wochen: Januar 2025 hat fünf Zeilen wie im Mockup', () => {
    const cells = monthCells(2025, 1);
    expect(cells).toHaveLength(35);
    expect(ymdKey(cells[0]!.ymd)).toBe('2024-12-30');
    expect(cells[0]!.inMonth).toBe(false);
    expect(ymdKey(cells[2]!.ymd)).toBe('2025-01-01');
    expect(cells[2]!.inMonth).toBe(true);
    expect(ymdKey(cells[34]!.ymd)).toBe('2025-02-02');
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });
  it('sechs Zeilen, wenn der Monat sie braucht (Mai 2027 beginnt am Samstag)', () => {
    const cells = monthCells(2027, 5);
    expect(cells).toHaveLength(42);
    expect(ymdKey(cells[0]!.ymd)).toBe('2027-04-26');
    expect(ymdKey(cells[41]!.ymd)).toBe('2027-06-06');
  });
  it('vier Zeilen gibt es nicht zu füllen: Februar 2027 (beginnt am Montag, 28 Tage) hat genau vier', () => {
    expect(monthCells(2027, 2)).toHaveLength(28);
  });
  it('Schaltjahr', () => {
    expect(monthCells(2028, 2).filter((c) => c.inMonth)).toHaveLength(29);
  });
  it('Monat vor und zurück, über den Jahreswechsel', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ y: 2026, m: 5 });
    expect(shiftMonth(2026, 3, -15)).toEqual({ y: 2024, m: 12 });
  });
});

describe('Überschrift', () => {
  it('Deutsch: heute, morgen, sonst Wochentag und Datum', () => {
    setLanguage('de');
    const now = Date.parse('2026-11-04T10:00:00Z');
    expect(summaryTitle(compose({ y: 2026, m: 11, d: 4 }, 19, 0, TZ), now, TZ)).toBe('Heute, 19:00');
    expect(summaryTitle(compose({ y: 2026, m: 11, d: 5 }, 19, 0, TZ), now, TZ)).toBe('Morgen, 19:00');
    expect(summaryTitle(compose({ y: 2026, m: 11, d: 3 }, 19, 0, TZ), now, TZ)).toBe('Gestern, 19:00');
    expect(summaryTitle(compose({ y: 2026, m: 11, d: 12 }, 9, 5, TZ), now, TZ)).toBe('Do, 12. Nov, 09:05');
    expect(summaryTitle(compose({ y: 2027, m: 1, d: 2 }, 9, 5, TZ), now, TZ)).toBe('Sa, 2. Jan 2027, 09:05');
  });
  it('Englisch', () => {
    setLanguage('en');
    const now = Date.parse('2026-11-04T10:00:00Z');
    expect(summaryTitle(compose({ y: 2026, m: 11, d: 5 }, 19, 0, TZ), now, TZ)).toBe('Tomorrow, 19:00');
    expect(summaryTitle(compose({ y: 2026, m: 11, d: 12 }, 9, 5, TZ), now, TZ)).toBe('Thu, 12 Nov, 09:05');
  });
  it('ganzes Datum darunter', () => {
    setLanguage('de');
    expect(summaryFull({ y: 2025, m: 1, d: 30 })).toBe('Donnerstag, 30. Januar 2025');
    setLanguage('en');
    expect(summaryFull({ y: 2025, m: 1, d: 30 })).toBe('Thursday, 30 January 2025');
  });
});

describe('Uhrzeit-Rad', () => {
  it('Minuten in Fünferschritten; eine andere Minute des Termins bleibt wählbar', () => {
    expect(minuteOptions(0)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(minuteOptions(7)).toEqual([0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(minuteOptions(30)).toHaveLength(12);
  });
  it('das Fenster zeigt fünf Werte rund um den gewählten und läuft im Kreis (23 → 0)', () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    expect(wheelWindow(hours, 19)).toEqual([17, 18, 19, 20, 21]);
    expect(wheelWindow(hours, 0)).toEqual([22, 23, 0, 1, 2]);
    expect(wheelWindow(hours, 23)).toEqual([21, 22, 23, 0, 1]);
  });
  it('Schritte rechnen im Kreis', () => {
    expect(stepWheel(24, 23, 1)).toBe(0);
    expect(stepWheel(24, 0, -1)).toBe(23);
    expect(stepWheel(12, 11, 1)).toBe(0);
    expect(stepWheel(24, 5, 30)).toBe(11);
    expect(stepWheel(24, 5, -30)).toBe(23);
  });
});
