import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ageText, dueTone, sourceLine, todaySentence } from '../src/lib/today';

const card = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }) as never);

beforeEach(() => setLanguage('de'));

describe('todaySentence', () => {
  it('beides, nur eins, nichts', () => {
    expect(todaySentence({ mine: card(3), house: card(1) })).toBe('3 für dich · 1 vom Haus');
    expect(todaySentence({ mine: card(2), house: [] })).toBe('2 für dich');
    expect(todaySentence({ mine: [], house: card(1) })).toBe('1 vom Haus');
    expect(todaySentence({ mine: [], house: [] })).toBe('Heute ist nichts offen. Genieß den Tag.');
  });

  it('auf Englisch', () => {
    setLanguage('en');
    expect(todaySentence({ mine: card(3), house: card(1) })).toBe('3 for you · 1 from the house');
    expect(todaySentence({ mine: [], house: [] })).toBe('Nothing open today. Enjoy your day.');
  });
});

describe('ageText', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  it('Minuten, Stunden, Tage', () => {
    expect(ageText('2026-11-04T11:59:40Z', now)).toBe('gerade eben');
    expect(ageText('2026-11-04T11:56:00Z', now)).toBe('vor 4 Min.');
    expect(ageText('2026-11-04T09:00:00Z', now)).toBe('vor 3 Std.');
    expect(ageText('2026-11-03T12:00:00Z', now)).toBe('vor 1 Tag');
    expect(ageText('2026-11-01T12:00:00Z', now)).toBe('vor 3 Tagen');
  });
  it('eine Zeit in der Zukunft zählt als gerade eben', () => {
    expect(ageText('2026-11-04T12:05:00Z', now)).toBe('gerade eben');
  });
});

describe('sourceLine', () => {
  it('Board oder Wächter (türkis)', () => {
    expect(sourceLine({ boardName: 'Haushalt', watcherId: null, watcherName: null })).toEqual({ text: 'Haushalt', house: false });
    expect(sourceLine({ boardName: 'Haushalt', watcherId: 'w', watcherName: 'Waschmaschine fertig' })).toEqual({ text: 'Waschmaschine fertig', house: true });
    expect(sourceLine({ boardName: 'Haushalt', watcherId: 'w', watcherName: null })).toEqual({ text: 'Haushalt', house: true });
  });
});

describe('dueTone', () => {
  const now = Date.parse('2026-11-04T09:00:00Z');
  const tomorrow = Date.parse('2026-11-04T23:00:00Z');
  it('überfällig, heute, später', () => {
    expect(dueTone('2026-11-04T08:00:00Z', now, tomorrow)).toBe('overdue');
    expect(dueTone('2026-11-04T17:00:00Z', now, tomorrow)).toBe('today');
    expect(dueTone('2026-11-05T08:00:00Z', now, tomorrow)).toBe('later');
    expect(dueTone(null, now, tomorrow)).toBe('later');
  });
});
