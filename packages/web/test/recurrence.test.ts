import { describe, expect, it } from 'vitest';
import {
  describeRecurrence,
  editorFromRule,
  ruleFromEditor,
  type Recurrence,
  type RecurrenceEditor,
} from '../src/lib/recurrence';

const TZ = 'Europe/Berlin';

describe('describeRecurrence', () => {
  it.each([
    [{ type: 'fixed', freq: 'daily', every: 1 }, 'täglich'],
    [{ type: 'fixed', freq: 'daily', every: 3 }, 'alle 3 Tage'],
    [{ type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] }, 'jeden Samstag'],
    [{ type: 'fixed', freq: 'weekly', every: 1, weekdays: [1, 4] }, 'jeden Mo + Do'],
    [{ type: 'fixed', freq: 'weekly', every: 2, weekdays: [1] }, 'alle 2 Wochen (Mo)'],
    [{ type: 'fixed', freq: 'weekly', every: 1 }, 'wöchentlich'],
    [{ type: 'fixed', freq: 'monthly', every: 1, monthDay: 15 }, 'monatlich am 15.'],
    [{ type: 'fixed', freq: 'monthly', every: 1, monthDay: -1 }, 'monatlich am letzten Tag'],
    [{ type: 'fixed', freq: 'monthly', every: 2, monthDay: 1 }, 'alle 2 Monate am 1.'],
    [{ type: 'fixed', freq: 'yearly', every: 1 }, 'jährlich'],
    [{ type: 'after_completion', every: 3, unit: 'months' }, 'alle 3 Monate nach Erledigung'],
    [{ type: 'after_completion', every: 1, unit: 'weeks' }, 'jede Woche nach Erledigung'],
    [{ type: 'after_completion', every: 10, unit: 'days' }, 'alle 10 Tage nach Erledigung'],
  ] as const)('%j → %s', (rule, text) => {
    expect(describeRecurrence(rule as unknown as Recurrence)).toBe(text);
  });
});

describe('Editor ↔ Regel', () => {
  const due = '2026-11-14T09:00:00.000Z'; // Sa 14.11. 10:00 Berlin

  it('keine Wiederholung → null', () => {
    expect(ruleFromEditor({ mode: 'none', every: 1, weekdays: [], monthDay: 1, unit: 'days' }, due, TZ)).toBeNull();
  });

  it('wöchentlich ohne Auswahl nimmt den Wochentag des Termins', () => {
    const e: RecurrenceEditor = { mode: 'weekly', every: 1, weekdays: [], monthDay: 1, unit: 'days' };
    expect(ruleFromEditor(e, due, TZ)).toEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] });
  });

  it('monatlich merkt sich den Tag des Termins, damit der 31. nicht abdriftet', () => {
    const e: RecurrenceEditor = { mode: 'monthly', every: 1, weekdays: [], monthDay: 0, unit: 'days' };
    expect(ruleFromEditor(e, '2026-01-31T09:00:00.000Z', TZ)).toEqual({
      type: 'fixed',
      freq: 'monthly',
      every: 1,
      monthDay: 31,
    });
  });

  it('monthDay -1 steht für den letzten Tag', () => {
    const e: RecurrenceEditor = { mode: 'monthly', every: 1, weekdays: [], monthDay: -1, unit: 'days' };
    expect(ruleFromEditor(e, due, TZ)).toMatchObject({ monthDay: -1 });
  });

  it('nach Erledigung', () => {
    const e: RecurrenceEditor = { mode: 'after', every: 3, weekdays: [], monthDay: 1, unit: 'months' };
    expect(ruleFromEditor(e, due, TZ)).toEqual({ type: 'after_completion', every: 3, unit: 'months' });
  });

  it('begrenzt den Abstand auf mindestens 1', () => {
    const e: RecurrenceEditor = { mode: 'daily', every: 0, weekdays: [], monthDay: 1, unit: 'days' };
    expect(ruleFromEditor(e, due, TZ)).toEqual({ type: 'fixed', freq: 'daily', every: 1 });
  });

  it('liest eine gespeicherte Regel zurück in den Editor', () => {
    expect(editorFromRule({ type: 'fixed', freq: 'weekly', every: 2, weekdays: [1, 4] })).toMatchObject({
      mode: 'weekly',
      every: 2,
      weekdays: [1, 4],
    });
    expect(editorFromRule({ type: 'after_completion', every: 3, unit: 'months' })).toMatchObject({
      mode: 'after',
      every: 3,
      unit: 'months',
    });
    expect(editorFromRule(null).mode).toBe('none');
  });
});
