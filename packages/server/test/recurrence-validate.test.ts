import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import { parseRecurrence } from '../src/store/validate.js';

describe('Wiederholung prüfen: stündlich, Zeitfenster, Toleranz', () => {
  it('nimmt stündlich mit und ohne Fenster', () => {
    expect(parseRecurrence({ type: 'fixed', freq: 'hourly', every: 3 })).toEqual({ type: 'fixed', freq: 'hourly', every: 3 });
    expect(parseRecurrence({ type: 'fixed', freq: 'hourly', every: 1, window: { from: '08:00', to: '20:00' }, extra: 1 })).toEqual({
      type: 'fixed',
      freq: 'hourly',
      every: 1,
      window: { from: '08:00', to: '20:00' },
    });
  });

  it('nach Erledigung gibt es auch Stunden', () => {
    expect(parseRecurrence({ type: 'after_completion', every: 2, unit: 'hours' })).toEqual({ type: 'after_completion', every: 2, unit: 'hours' });
    expect(() => parseRecurrence({ type: 'after_completion', every: 2, unit: 'minutes' })).toThrow(ValidationError);
  });

  it('lehnt ein kaputtes Zeitfenster ab', () => {
    const base = { type: 'fixed', freq: 'hourly', every: 1 };
    for (const window of [{ from: '8:00', to: '20:00' }, { from: '08:00', to: '24:00' }, { from: '20:00', to: '08:00' }, { from: '08:00', to: '08:00' }, { from: '08:00' }, 'x', [], null]) {
      expect(() => parseRecurrence({ ...base, window }), JSON.stringify(window)).toThrow(ValidationError);
    }
  });

  it('das Zeitfenster gibt es nur bei stündlich', () => {
    expect(() => parseRecurrence({ type: 'fixed', freq: 'daily', every: 1, window: { from: '08:00', to: '20:00' } })).toThrow(ValidationError);
  });

  it('Toleranz: nur wöchentlich und monatlich, ganze Tage ab 0', () => {
    expect(parseRecurrence({ type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 })).toMatchObject({ lateTolerance: 3 });
    expect(parseRecurrence({ type: 'fixed', freq: 'monthly', every: 1, lateTolerance: 0 })).toMatchObject({ lateTolerance: 0 });
    for (const freq of ['hourly', 'daily', 'yearly']) {
      expect(() => parseRecurrence({ type: 'fixed', freq, every: 1, lateTolerance: 3 }), freq).toThrow(ValidationError);
    }
    for (const lateTolerance of [-1, 1.5, '3', null, 366]) {
      expect(() => parseRecurrence({ type: 'fixed', freq: 'weekly', every: 1, lateTolerance }), String(lateTolerance)).toThrow(ValidationError);
    }
  });

  it('ohne Toleranz bleibt die Regel wie bisher (Standard: Plan bleibt fest)', () => {
    expect(parseRecurrence({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] })).toEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] });
  });
});
