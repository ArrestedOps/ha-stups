import { describe, expect, it } from 'vitest';
import {
  baseOf,
  describeRecurrence,
  editorFromRule,
  emptyEditor,
  firstDue,
  handlingOf,
  lateExamples,
  ruleFromEditor,
  shortWhen,
  upcoming,
  withBase,
  withHandling,
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

const due = '2026-11-14T09:00:00.000Z'; // Sa 14.11. 10:00 Berlin

describe('stündlich und Verspätung: Anzeige und Editor', () => {
  it.each([
    [{ type: 'fixed', freq: 'hourly', every: 1 }, 'stündlich'],
    [{ type: 'fixed', freq: 'hourly', every: 3 }, 'alle 3 Std.'],
    [{ type: 'fixed', freq: 'hourly', every: 2, window: { from: '08:00', to: '20:00' } }, 'alle 2 Std. 08:00–20:00'],
    [{ type: 'after_completion', every: 1, unit: 'hours' }, 'jede Stunde nach Erledigung'],
    [{ type: 'after_completion', every: 4, unit: 'hours' }, 'alle 4 Stunden nach Erledigung'],
    [{ type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 }, 'alle 2 Wochen (Sa)'],
  ] as const)('%j → %s', (rule, text) => {
    expect(describeRecurrence(rule as unknown as Recurrence)).toBe(text);
  });

  it('stündlich mit Fenster und Toleranz laufen durch den Editor und zurück', () => {
    const hourly: Recurrence = { type: 'fixed', freq: 'hourly', every: 3, window: { from: '08:00', to: '20:00' } };
    expect(ruleFromEditor(editorFromRule(hourly), due, TZ)).toEqual(hourly);
    const tol: Recurrence = { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 };
    expect(ruleFromEditor(editorFromRule(tol), due, TZ)).toEqual(tol);
    const plain: Recurrence = { type: 'fixed', freq: 'monthly', every: 1, monthDay: 14 };
    expect(ruleFromEditor(editorFromRule(plain), due, TZ)).toEqual(plain);
  });

  it('Toleranz und Fenster gelten nur dort, wo sie erlaubt sind', () => {
    const e = { ...emptyEditor(), mode: 'daily' as const, tolerance: 3, window: { from: '08:00', to: '20:00' } };
    expect(ruleFromEditor(e, due, TZ)).toEqual({ type: 'fixed', freq: 'daily', every: 1 });
  });

  it('Rhythmus wechseln: Toleranz fällt weg, wo sie nicht erlaubt ist; „Neu zählen“ rechnet Einheit und Abstand um', () => {
    const tol = editorFromRule({ type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 });
    expect(withBase(tol, 'daily', 1).tolerance).toBeNull();
    expect(withBase(tol, 'monthly', 1).tolerance).toBe(3);
    const after = withHandling(tol, 'after');
    expect(after).toMatchObject({ mode: 'after', every: 2, unit: 'weeks', tolerance: null });
    expect(baseOf(after)).toEqual({ freq: 'weekly', every: 2 });
    expect(withBase(after, 'hourly', 5)).toMatchObject({ mode: 'after', unit: 'hours', every: 5 });
    const yearly = withHandling(withBase(emptyEditor(), 'yearly', 2), 'after');
    expect(yearly).toMatchObject({ mode: 'after', unit: 'months', every: 24 });
    expect(baseOf(yearly)).toEqual({ freq: 'yearly', every: 2 });
    expect(handlingOf(withHandling(after, 'fixed'))).toBe('fixed');
    expect(withHandling(after, 'tolerant')).toMatchObject({ mode: 'weekly', tolerance: 3, weekdays: [6] });
    // Stündlich kennt keine Toleranz
    expect(handlingOf(withHandling(withBase(emptyEditor(), 'hourly', 1), 'tolerant'))).toBe('fixed');
  });
});

describe('erster Termin ohne Termin', () => {
  const now = Date.parse('2026-11-10T10:00:00Z'); // Di 10.11. 11:00 Berlin

  it('täglich: heute zur Standardzeit, wenn sie noch kommt, sonst morgen', () => {
    const e = withBase(emptyEditor(), 'daily', 1);
    expect(firstDue(e, now, TZ, '18:30')).toBe('2026-11-10T17:30:00.000Z');
    expect(firstDue(e, now, TZ, '09:00')).toBe('2026-11-11T08:00:00.000Z');
  });

  it('wöchentlich: der nächste gewählte Wochentag', () => {
    const e = { ...withBase(emptyEditor(), 'weekly', 2), weekdays: [6] };
    expect(firstDue(e, now, TZ, '09:00')).toBe('2026-11-14T08:00:00.000Z'); // Sa 14.11.
  });

  it('monatlich: der nächste passende Tag, auch der letzte des Monats', () => {
    expect(firstDue({ ...withBase(emptyEditor(), 'monthly', 1), monthDay: 15 }, now, TZ, '09:00')).toBe('2026-11-15T08:00:00.000Z');
    expect(firstDue({ ...withBase(emptyEditor(), 'monthly', 1), monthDay: -1 }, now, TZ, '09:00')).toBe('2026-11-30T08:00:00.000Z');
  });

  it('stündlich mit Fenster, Standardzeit außerhalb: Fensteranfang', () => {
    const e = { ...withBase(emptyEditor(), 'hourly', 1), window: { from: '10:00', to: '20:00' } };
    expect(firstDue(e, now, TZ, '09:00')).toBe('2026-11-11T09:00:00.000Z');
  });

  it('die Vorschau zählt den ersten Termin und die nächsten beiden', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6] };
    expect(upcoming(rule, '2026-11-14T09:00:00.000Z', TZ)).toEqual(['2026-11-14T09:00:00.000Z', '2026-11-28T09:00:00.000Z', '2026-12-12T09:00:00.000Z']);
  });
});

describe('Beispiele der drei Karten (live gerechnet)', () => {
  const due = '2026-11-14T09:00:00.000Z'; // Sa 14.11. 10:00 Berlin
  const e = { ...withBase(emptyEditor(), 'weekly', 2), weekdays: [6], tolerance: 3 };

  it('Sa alle 2 Wochen, Toleranz 3: Plan bleibt Sa 28.11., Neustart Sa 5.12., Neu zählen Mi 2.12.', () => {
    const ex = lateExamples(e, due, TZ)!;
    expect(ex.fixed).toEqual({ doneIso: '2026-11-18T09:00:00.000Z', nextIso: '2026-11-28T09:00:00.000Z' });
    expect(ex.tolerant!.days).toBe(3);
    expect(ex.tolerant!.ok).toEqual({ doneIso: '2026-11-16T09:00:00.000Z', nextIso: '2026-11-28T09:00:00.000Z' }); // Mo 16.11.
    expect(ex.tolerant!.late).toEqual({ doneIso: '2026-11-18T09:00:00.000Z', nextIso: '2026-12-05T09:00:00.000Z' }); // Mi 18.11.
    expect(ex.after).toEqual({ doneIso: '2026-11-18T09:00:00.000Z', nextIso: '2026-12-02T09:00:00.000Z' });
    expect(shortWhen(ex.after.nextIso, TZ)).toBe('Mi 2.12.');
    expect(shortWhen(ex.tolerant!.late.nextIso, TZ)).toBe('Sa 5.12.');
  });

  it('die Toleranz-Karte gibt es nur bei wöchentlich und monatlich', () => {
    for (const freq of ['hourly', 'daily', 'yearly'] as const) expect(lateExamples(withBase(emptyEditor(), freq, 1), due, TZ)!.tolerant, freq).toBeUndefined();
    expect(lateExamples(withBase(emptyEditor(), 'monthly', 1), due, TZ)!.tolerant).toBeDefined();
    expect(lateExamples(emptyEditor(), due, TZ)).toBeNull();
  });

  it('stündlich: Erledigt 30 Minuten nach dem Termin', () => {
    const h = withBase(emptyEditor(), 'hourly', 3);
    const ex = lateExamples(h, '2026-11-10T08:00:00.000Z', TZ)!;
    expect(ex.fixed.nextIso).toBe('2026-11-10T11:00:00.000Z');
    expect(ex.after.nextIso).toBe('2026-11-10T11:30:00.000Z');
  });
});
