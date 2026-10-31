import { describe, expect, it } from 'vitest';
import { toLocal } from '../src/recurrence.js';
import { DEFAULT_QUIET, quietEnd, type QuietWindow } from '../src/quiet.js';

const TZ = 'Europe/Berlin';
const night: QuietWindow = { start: '22:00', end: '07:00', off: false };
const hm = (ms: number) => {
  const l = toLocal(ms, TZ);
  return `${String(l.d).padStart(2, '0')}.${String(l.m).padStart(2, '0')}. ${String(l.h).padStart(2, '0')}:${String(l.mi).padStart(2, '0')}`;
};

describe('quietEnd (Ende der Ruhezeit, wenn jetzt Ruhezeit ist)', () => {
  it('Vorgabe ist 22:00 bis 07:00, eingeschaltet', () => {
    expect(DEFAULT_QUIET).toEqual({ start: '22:00', end: '07:00', off: false });
  });

  it('abends vor Mitternacht: Ende ist morgen früh', () => {
    const now = Date.parse('2026-11-04T22:30:00Z'); // 23:30 Berlin
    expect(hm(quietEnd(now, TZ, night)!)).toBe('05.11. 07:00');
  });

  it('nach Mitternacht: Ende ist am selben Morgen', () => {
    const now = Date.parse('2026-11-05T01:15:00Z'); // 02:15 Berlin
    expect(hm(quietEnd(now, TZ, night)!)).toBe('05.11. 07:00');
  });

  it('genau zu Beginn und knapp vor dem Ende gilt noch Ruhezeit, genau zum Ende nicht mehr', () => {
    expect(quietEnd(Date.parse('2026-11-04T21:00:00Z'), TZ, night)).not.toBeNull(); // 22:00
    expect(quietEnd(Date.parse('2026-11-05T05:59:00Z'), TZ, night)).not.toBeNull(); // 06:59
    expect(quietEnd(Date.parse('2026-11-05T06:00:00Z'), TZ, night)).toBeNull(); // 07:00
  });

  it('tagsüber keine Ruhezeit', () => {
    expect(quietEnd(Date.parse('2026-11-04T11:00:00Z'), TZ, night)).toBeNull();
    expect(quietEnd(Date.parse('2026-11-04T20:59:00Z'), TZ, night)).toBeNull(); // 21:59
  });

  it('ein Fenster innerhalb eines Tages (13:00 bis 14:30)', () => {
    const lunch: QuietWindow = { start: '13:00', end: '14:30', off: false };
    expect(hm(quietEnd(Date.parse('2026-11-04T12:10:00Z'), TZ, lunch)!)).toBe('04.11. 14:30'); // 13:10
    expect(quietEnd(Date.parse('2026-11-04T13:30:00Z'), TZ, lunch)).toBeNull(); // 14:30
    expect(quietEnd(Date.parse('2026-11-04T11:59:00Z'), TZ, lunch)).toBeNull(); // 12:59
  });

  it('abgeschaltet oder Beginn gleich Ende: nie Ruhezeit', () => {
    const now = Date.parse('2026-11-04T23:30:00Z');
    expect(quietEnd(now, TZ, { ...night, off: true })).toBeNull();
    expect(quietEnd(now, TZ, { start: '07:00', end: '07:00', off: false })).toBeNull();
  });

  it('Herbst: in der Nacht der Zeitumstellung (25.10.2026, 03:00 → 02:00) endet sie um 07:00 Ortszeit', () => {
    const before = Date.parse('2026-10-24T20:30:00Z'); // 22:30 Berlin (MESZ)
    expect(hm(quietEnd(before, TZ, night)!)).toBe('25.10. 07:00');
    const inRepeatedHour = Date.parse('2026-10-25T00:30:00Z'); // 02:30 MESZ, erste Stunde
    expect(hm(quietEnd(inRepeatedHour, TZ, night)!)).toBe('25.10. 07:00');
    const after = Date.parse('2026-10-25T01:30:00Z'); // 02:30 MEZ, zweite Stunde
    expect(hm(quietEnd(after, TZ, night)!)).toBe('25.10. 07:00');
  });

  it('Frühjahr: in der Nacht der Zeitumstellung (29.03.2026, 02:00 → 03:00) endet sie um 07:00 Ortszeit', () => {
    const before = Date.parse('2026-03-28T21:30:00Z'); // 22:30 Berlin (MEZ)
    const end = quietEnd(before, TZ, night)!;
    expect(hm(end)).toBe('29.03. 07:00');
    // zwischen 22:30 und 07:00 liegen wegen der übersprungenen Stunde nur 7,5 Stunden
    expect((end - before) / 3_600_000).toBe(7.5);
  });

  it('Ende in der übersprungenen Stunde: die Ruhezeit endet nach der Lücke', () => {
    const w: QuietWindow = { start: '22:00', end: '02:30', off: false };
    const now = Date.parse('2026-03-28T22:30:00Z'); // 23:30 Berlin
    const end = quietEnd(now, TZ, w)!;
    expect(end).toBeGreaterThan(now);
    expect(toLocal(end, TZ).h).toBe(3); // 02:30 gibt es nicht, es wird 03:30
  });
});
