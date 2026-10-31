import { describe, expect, it } from 'vitest';
import {
  formatCost,
  formatCreated,
  formatDue,
  formatLead,
  fromInputValue,
  isFuture,
  isOverdue,
  parseCost,
  startOfTomorrow,
  toInputValue,
} from '../src/lib/datetime';

const TZ = 'Europe/Berlin';
const t = (iso: string) => Date.parse(iso);
const NOW = t('2026-10-30T10:00:00Z'); // Fr 30.10., 11:00 Berlin

describe('formatDue', () => {
  it.each([
    ['2026-10-30T09:00:00Z', 'heute 10:00'],
    ['2026-10-30T23:30:00Z', 'morgen 00:30'],
    ['2026-10-31T17:00:00Z', 'morgen 18:00'],
    ['2026-10-29T19:00:00Z', 'gestern 20:00'],
    ['2026-11-02T13:00:00Z', 'Mo 14:00'],
    ['2026-11-12T17:00:00Z', '12. Nov 18:00'],
    ['2027-01-05T08:00:00Z', '5. Jan 2027 09:00'],
  ])('%s → %s', (iso, expected) => {
    expect(formatDue(iso, NOW, TZ)).toBe(expected);
  });
});

describe('Eingabefeld (datetime-local) ↔ UTC', () => {
  it('wandelt Ortszeit in UTC und zurück', () => {
    expect(fromInputValue('2026-11-01T10:00', TZ)).toBe('2026-11-01T09:00:00.000Z');
    expect(toInputValue('2026-11-01T09:00:00.000Z', TZ)).toBe('2026-11-01T10:00');
  });

  it('beachtet die Sommerzeit', () => {
    expect(fromInputValue('2026-07-01T10:00', TZ)).toBe('2026-07-01T08:00:00.000Z');
    expect(toInputValue('2026-07-01T08:00:00.000Z', TZ)).toBe('2026-07-01T10:00');
  });

  it('nimmt bei einer doppelten Uhrzeit das erste Vorkommen und schiebt eine fehlende nach vorn', () => {
    expect(fromInputValue('2026-10-25T02:30', TZ)).toBe('2026-10-25T00:30:00.000Z');
    expect(fromInputValue('2026-03-29T02:30', TZ)).toBe('2026-03-29T01:30:00.000Z');
  });

  it('liefert für leere oder kaputte Eingaben null', () => {
    expect(fromInputValue('', TZ)).toBeNull();
    expect(fromInputValue('morgen', TZ)).toBeNull();
    expect(toInputValue(null, TZ)).toBe('');
  });
});

describe('startOfTomorrow und isFuture', () => {
  it('der Tag endet um Mitternacht Ortszeit', () => {
    expect(new Date(startOfTomorrow(NOW, TZ)).toISOString()).toBe('2026-10-30T23:00:00.000Z');
  });

  it('beachtet die Zeitumstellung (Winterzeit am 25.10.)', () => {
    expect(new Date(startOfTomorrow(t('2026-10-24T10:00:00Z'), TZ)).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(new Date(startOfTomorrow(t('2026-10-25T10:00:00Z'), TZ)).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('isFuture: heute 23:59 ist noch nicht „geplant", ab 00:00 morgen schon', () => {
    expect(isFuture('2026-10-30T22:59:00Z', NOW, TZ)).toBe(false);
    expect(isFuture('2026-10-30T23:00:00Z', NOW, TZ)).toBe(true);
    expect(isFuture(null, NOW, TZ)).toBe(false);
  });
});

describe('isOverdue', () => {
  it('ist wahr nur für vergangene Termine', () => {
    expect(isOverdue('2026-10-30T09:59:00Z', NOW)).toBe(true);
    expect(isOverdue('2026-10-30T10:00:01Z', NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });
});

describe('Kosten', () => {
  it('formatiert Cent als Euro', () => {
    expect(formatCost(420000).replace(/\s/g, ' ')).toBe('4.200,00 €');
    expect(formatCost(5)).toContain('0,05');
  });

  it('liest Eingaben in deutscher und englischer Schreibweise', () => {
    expect(parseCost('4200')).toBe(420000);
    expect(parseCost('4.200,50')).toBe(420050);
    expect(parseCost('4200,5')).toBe(420050);
    expect(parseCost('12.5')).toBe(1250);
    expect(parseCost(' 19,99 € ')).toBe(1999);
    expect(parseCost('')).toBeNull();
    expect(parseCost('abc')).toBeNaN();
    expect(parseCost('-5')).toBeNaN();
  });
});

describe('formatLead', () => {
  it('benennt Vorlaufzeiten', () => {
    expect(formatLead(15)).toBe('15 Min.');
    expect(formatLead(60)).toBe('1 Std.');
    expect(formatLead(1440)).toBe('1 Tag');
    expect(formatLead(2880)).toBe('2 Tage');
  });
});

describe('formatCreated', () => {
  it.each([
    ['2026-10-30T08:00:00Z', 'heute'],
    ['2026-10-29T20:00:00Z', 'gestern'],
    ['2026-10-27T08:00:00Z', 'vor 3 Tagen'],
    ['2026-10-24T08:00:00Z', 'vor 6 Tagen'],
    ['2026-10-23T08:00:00Z', '23. Okt'],
    ['2025-12-24T08:00:00Z', '24. Dez 2025'],
  ])('%s → %s', (iso, expected) => {
    expect(formatCreated(iso, NOW, TZ)).toBe(expected);
  });

  it('zählt Kalendertage in der Ortszeit, nicht 24-Stunden-Abstände', () => {
    expect(formatCreated('2026-10-29T23:30:00Z', NOW, TZ)).toBe('heute'); // 00:30 Berlin am 30.10.
  });
});