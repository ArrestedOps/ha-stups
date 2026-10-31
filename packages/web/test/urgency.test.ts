import { describe, expect, it } from 'vitest';
import { urgency, urgencyColor } from '../src/lib/urgency';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-04T10:00:00Z'); // Mi 11:00 Berlin
const card = (dueAt: string | null, completedAt: string | null = null) => ({ dueAt, completedAt });

describe('urgency', () => {
  it('überfällig, wenn der Termin vorbei ist', () => {
    expect(urgency(card('2026-11-04T09:59:00Z'), false, NOW, TZ)).toBe('over');
    expect(urgency(card('2026-10-01T09:00:00Z'), false, NOW, TZ)).toBe('over');
  });

  it('heute, wenn der Termin noch heute kommt', () => {
    expect(urgency(card('2026-11-04T10:00:00Z'), false, NOW, TZ)).toBe('today');
    expect(urgency(card('2026-11-04T22:30:00Z'), false, NOW, TZ)).toBe('today'); // 23:30 Berlin
  });

  it('bald: morgen und übermorgen, danach später', () => {
    expect(urgency(card('2026-11-04T23:30:00Z'), false, NOW, TZ)).toBe('soon'); // 00:30 Berlin am Do
    expect(urgency(card('2026-11-06T12:00:00Z'), false, NOW, TZ)).toBe('soon'); // Fr
    expect(urgency(card('2026-11-07T12:00:00Z'), false, NOW, TZ)).toBe('later'); // Sa
  });

  it('ohne Termin: keiner, erledigt: erledigt', () => {
    expect(urgency(card(null), false, NOW, TZ)).toBe('none');
    expect(urgency(card('2026-11-01T09:00:00Z', '2026-11-04T09:00:00Z'), false, NOW, TZ)).toBe('done');
    expect(urgency(card('2026-11-01T09:00:00Z'), true, NOW, TZ)).toBe('done');
  });

  it('ordnet jeder Stufe eine Farbe zu, „keine" und „erledigt" haben keinen Balken', () => {
    expect(urgencyColor('over')).toBe('var(--u-over)');
    expect(urgencyColor('today')).toBe('var(--u-today)');
    expect(urgencyColor('soon')).toBe('var(--u-soon)');
    expect(urgencyColor('later')).toBe('var(--u-later)');
    expect(urgencyColor('none')).toBeNull();
    expect(urgencyColor('done')).toBeNull();
  });
});
