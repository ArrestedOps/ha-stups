import { beforeEach, describe, expect, it } from 'vitest';
import { busyRange, dateKey, formatBusy } from '../src/lib/busy';
import { setLanguage } from '../src/lib/i18n/index.svelte';

beforeEach(() => setLanguage('de'));

describe('Wenig Zeit: Daten', () => {
  it('dateKey ist der Ortstag', () => {
    expect(dateKey(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
    expect(dateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
  it('busyRange: heute bis 90 Tage', () => {
    expect(busyRange(new Date(2026, 10, 4, 10, 0))).toEqual({ min: '2026-11-04', max: '2027-02-02' });
  });
  it('formatBusy nennt den Wochentag (mittags gerechnet)', () => {
    expect(formatBusy('2026-11-06')).toContain('6');
    expect(formatBusy('2026-11-06')).toMatch(/Fr/);
  });
});
