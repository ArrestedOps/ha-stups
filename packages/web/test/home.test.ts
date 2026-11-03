import { beforeEach, describe, expect, it } from 'vitest';
import type { HomeItem } from '../src/lib/api';
import { durationText, homeSections } from '../src/lib/home';
import { setLanguage } from '../src/lib/i18n/index.svelte';

const item = (over: Partial<HomeItem>): HomeItem => ({
  watcherId: 'w',
  name: 'Wächter',
  phase: 'quiet',
  since: null,
  progress: null,
  nextCard: 'Karte',
  entityMissing: false,
  openCard: null,
  nextEvent: null,
  ...over,
});

beforeEach(() => setLanguage('de'));

describe('homeSections', () => {
  it('sortiert nach Phase, die am längsten Wartenden zuerst', () => {
    const items = [
      item({ watcherId: 'a', phase: 'waiting', since: '2026-11-04T09:00:00Z' }),
      item({ watcherId: 'b', phase: 'waiting', since: '2026-11-04T08:00:00Z' }),
      item({ watcherId: 'c', phase: 'running', since: '2026-11-04T07:00:00Z' }),
      item({ watcherId: 'd', phase: 'soon' }),
      item({ watcherId: 'e', phase: 'quiet' }),
    ];
    const s = homeSections(items);
    expect(s.waiting.map((i) => i.watcherId)).toEqual(['b', 'a']);
    expect(s.running.map((i) => i.watcherId)).toEqual(['c']);
    expect(s.soon.map((i) => i.watcherId)).toEqual(['d']);
    expect(s.quiet.map((i) => i.watcherId)).toEqual(['e']);
  });
  it('ohne Wächter sind alle Abschnitte leer', () => {
    expect(homeSections([])).toEqual({ waiting: [], running: [], soon: [], quiet: [] });
  });
});

describe('durationText', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  it('Minuten und Stunden', () => {
    expect(durationText('2026-11-04T11:59:50Z', now)).toBe('gerade erst');
    expect(durationText('2026-11-04T11:35:00Z', now)).toBe('seit 25 Min.');
    expect(durationText('2026-11-04T09:30:00Z', now)).toBe('seit 2 Std.');
  });
});
