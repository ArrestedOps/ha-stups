import { describe, expect, it } from 'vitest';
import { dayDiff, formatDue, formatLead, localDateKey, minutesOfDay, parseHm } from '../src/time.js';

const TZ = 'Europe/Berlin';
const t = (iso: string) => Date.parse(iso);
const NOW = t('2026-10-30T10:00:00Z'); // Fr 30.10., 11:00 Ortszeit

describe('formatDue', () => {
  it.each([
    ['2026-10-30T09:00:00Z', 'heute 10:00'],
    ['2026-10-30T22:30:00Z', 'heute 23:30'],
    ['2026-10-30T23:30:00Z', 'morgen 00:30'], // Mitternacht in Ortszeit überschritten
    ['2026-10-31T17:00:00Z', 'morgen 18:00'],
    ['2026-10-29T19:00:00Z', 'gestern 20:00'],
    ['2026-11-02T13:00:00Z', 'Mo 14:00'],
    ['2026-11-05T08:00:00Z', 'Do 09:00'],
    ['2026-11-12T17:00:00Z', '12. Nov 18:00'],
    ['2026-10-20T08:00:00Z', '20. Okt 10:00'],
    ['2027-01-05T08:00:00Z', '5. Jan 2027 09:00'],
  ])('%s → %s', (iso, expected) => {
    expect(formatDue(t(iso), NOW, TZ)).toBe(expected);
  });
});

describe('Hilfen', () => {
  it('localDateKey zählt in Ortszeit', () => {
    expect(localDateKey(t('2026-10-30T23:30:00Z'), TZ)).toBe('2026-10-31');
    expect(localDateKey(t('2026-10-30T22:30:00Z'), TZ)).toBe('2026-10-30');
  });

  it('minutesOfDay und parseHm', () => {
    expect(minutesOfDay(t('2026-10-30T07:05:00Z'), TZ)).toBe(8 * 60 + 5);
    expect(parseHm('18:30')).toBe(18 * 60 + 30);
  });

  it('dayDiff', () => {
    expect(dayDiff(t('2026-11-01T09:00:00Z'), NOW, TZ)).toBe(2);
    expect(dayDiff(t('2026-10-30T00:00:00Z'), NOW, TZ)).toBe(0);
  });

  it('formatLead', () => {
    expect(formatLead(30)).toBe('30 Min.');
    expect(formatLead(60)).toBe('1 Std.');
    expect(formatLead(120)).toBe('2 Std.');
    expect(formatLead(1440)).toBe('1 Tag');
    expect(formatLead(2880)).toBe('2 Tage');
    expect(formatLead(90)).toBe('90 Min.');
  });
});
