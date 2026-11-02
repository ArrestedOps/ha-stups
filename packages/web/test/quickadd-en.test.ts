import { describe, expect, it } from 'vitest';
import { toInputValue } from '../src/lib/datetime';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { parseQuickAdd, type QuickContext } from '../src/lib/quickadd';
import { blockingProblem, chipLabel } from '../src/lib/quickadd/labels';

const TZ = 'Europe/Berlin';
/** Monday, 2 November 2026, 10:00 in Berlin */
const NOW = Date.parse('2026-11-02T09:00:00Z');

const ctx: QuickContext = {
  now: NOW,
  tz: TZ,
  lang: 'en',
  defaultTime: '09:00',
  people: [
    { id: 'p-ben', name: 'Ben', displayName: 'Ben' },
    { id: 'p-anna', name: 'Anna', displayName: 'Anna' },
  ],
  categories: [{ id: 'c-home', name: 'Home' }],
};
const p = (text: string) => parseQuickAdd(text, ctx);
const due = (text: string) => {
  const r = p(text);
  return r.dueAt ? toInputValue(r.dueAt, TZ) : null;
};

describe('Schnell-Eingabe auf Englisch', () => {
  it('der ganze Satz: Titel, Termin, Person, Kategorie, Wiederholung, Priorität', () => {
    const r = p('Take out trash tomorrow 7pm @Ben #Home every week !!');
    expect(r.title).toBe('Take out trash');
    expect(toInputValue(r.dueAt!, TZ)).toBe('2026-11-03T19:00');
    expect(r.assignees).toEqual([{ name: 'Ben', personId: 'p-ben', status: 'ok' }]);
    expect(r.categories).toEqual([{ name: 'Home', categoryId: 'c-home', status: 'ok' }]);
    expect(r.recurrence).toMatchObject({ type: 'fixed', freq: 'weekly', every: 1 });
    expect(r.priority).toBe('high');
  });

  it('Tage: today, tomorrow, Wochentage, next …', () => {
    expect(due('Call mum today 6pm')).toBe('2026-11-02T18:00');
    expect(due('Pay rent tomorrow')).toBe('2026-11-03T09:00');
    expect(due('Dentist friday')).toBe('2026-11-06T09:00');
    expect(due('Dentist on Friday')).toBe('2026-11-06T09:00');
    expect(due('Dentist next Monday')).toBe('2026-11-09T09:00');
    expect(p('Dentist on Friday').title).toBe('Dentist');
  });

  it('relative Angaben: in 3 days, in a week', () => {
    expect(due('Tax in 3 days')).toBe('2026-11-05T09:00');
    expect(due('Tax in a week')).toBe('2026-11-09T09:00');
    expect(due('Tax in 2 months')).toBe('2027-01-02T09:00');
  });

  it('Datum mit Monatsnamen: 1 December, 1st Dec, Dec 1, December 1st 2027', () => {
    expect(due('Party 1 December')).toBe('2026-12-01T09:00');
    expect(due('Party 1st Dec')).toBe('2026-12-01T09:00');
    expect(due('Party Dec 1')).toBe('2026-12-01T09:00');
    expect(due('Party December 1st 2027')).toBe('2027-12-01T09:00');
    expect(due('Party 3 May')).toBe('2027-05-03T09:00');
    expect(p('Party 1 December').title).toBe('Party');
  });

  it('Uhrzeiten: 7pm, 7:30pm, 7 am, 12am, 12pm, at 19:30, at 7', () => {
    expect(due('A tomorrow 7pm')).toBe('2026-11-03T19:00');
    expect(due('A tomorrow 7:30pm')).toBe('2026-11-03T19:30');
    expect(due('A tomorrow 7 am')).toBe('2026-11-03T07:00');
    expect(due('A tomorrow 12am')).toBe('2026-11-03T00:00');
    expect(due('A tomorrow 12pm')).toBe('2026-11-03T12:00');
    expect(due('A tomorrow at 19:30')).toBe('2026-11-03T19:30');
    expect(due('A tomorrow at 7')).toBe('2026-11-03T07:00');
    expect(due('A tomorrow 13pm')).toBe('2026-11-03T09:00'); // keine Uhrzeit, aber das Datum gilt
  });

  it('Wiederholungen: every day/week/month/year, every Monday, every 2 weeks', () => {
    expect(p('Bins every day').recurrence).toMatchObject({ freq: 'daily', every: 1 });
    expect(p('Bins weekly').recurrence).toMatchObject({ freq: 'weekly', every: 1 });
    expect(p('Bins every month').recurrence).toMatchObject({ freq: 'monthly', every: 1 });
    expect(p('Bins every year').recurrence).toMatchObject({ freq: 'yearly', every: 1 });
    expect(p('Bins every 2 weeks').recurrence).toMatchObject({ freq: 'weekly', every: 2 });
    const monday = p('Bins every Monday');
    expect(monday.recurrence).toMatchObject({ freq: 'weekly', every: 1 });
    expect(toInputValue(monday.dueAt!, TZ)).toBe('2026-11-09T09:00');
    expect(monday.title).toBe('Bins');
  });

  it('Priorität: !, !!, important, urgent; „Warning!" bleibt Titel', () => {
    expect(p('A !').priority).toBe('medium');
    expect(p('A !!').priority).toBe('high');
    expect(p('A important').priority).toBe('high');
    expect(p('A urgent').priority).toBe('high');
    expect(p('Warning!').priority).toBeNull();
  });

  it('ein normaler englischer Titel bleibt unverändert', () => {
    for (const title of ['Buy 2 crates of water', 'Sun cream', 'Wedding gift', 'Mark the date on the calendar', 'Fix the 3rd shelf']) {
      const r = p(title);
      expect(r.title, title).toBe(title);
      expect(r.tokens, title).toEqual([]);
    }
  });

  it('Wörter, die es nur auf Deutsch gibt, werden auf Englisch nicht erkannt', () => {
    expect(p('Müll morgen 19 Uhr').dueAt).toBeNull();
  });
});

describe('Chips auf Englisch', () => {
  const labels = (text: string) => {
    const r = p(text);
    return r.tokens.map((t) => chipLabel(t, r, TZ, NOW));
  };

  it('Datum, Uhrzeit, Priorität, Person, Kategorie', () => {
    setLanguage('en');
    expect(labels('A tomorrow')).toEqual(['Tue 3 Nov · 09:00']);
    expect(labels('A tomorrow 7pm')).toEqual(['Tue 3 Nov', '19:00']);
    expect(labels('A 7pm')).toEqual(['today 19:00']);
    expect(labels('A !!')).toEqual(['High priority']);
    expect(labels('A !')).toEqual(['Medium priority']);
    expect(labels('A @Ben')).toEqual(['@Ben']);
    expect(labels('A @Zoe')).toEqual(['“Zoe” unknown']);
    expect(labels('A #Travel')).toEqual(['new: Travel']);
  });

  it('Hinweis, wenn eine Person fehlt', () => {
    setLanguage('en');
    expect(blockingProblem(p('A @Zoe'))).toMatch(/^There is no person “Zoe”/);
    expect(blockingProblem(p('A @Ben'))).toBeNull();
  });
});
