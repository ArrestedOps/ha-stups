import { describe, expect, it } from 'vitest';
import { migrateTab, startTab, visibleTabs } from '../src/lib/tabs';

describe('migrateTab', () => {
  it('bildet die alten Reiter auf die neuen ab', () => {
    expect(migrateTab('agenda')).toBe('today');
    expect(migrateTab('watchers')).toBe('home');
  });
  it('behält gültige Reiter', () => {
    for (const t of ['today', 'boards', 'calendar', 'home'] as const) expect(migrateTab(t)).toBe(t);
  });
  it('Unbekanntes, Leeres und fehlender Wert ergeben Heute', () => {
    for (const bad of [null, undefined, '', 'unsinn', 'Boards']) expect(migrateTab(bad as string | null), String(bad)).toBe('today');
  });
});

describe('startTab: die App startet auf Heute, nie auf Zuhause', () => {
  const all = ['today', 'boards', 'calendar', 'home'] as const;
  it('gemerkt werden nur Boards und Kalender', () => {
    expect(startTab('boards', [...all])).toBe('boards');
    expect(startTab('calendar', [...all])).toBe('calendar');
    expect(startTab('today', [...all])).toBe('today');
  });
  it('Zuhause, auch als alter Name „watchers", führt zu Heute', () => {
    expect(startTab('home', [...all])).toBe('today');
    expect(startTab('watchers', [...all])).toBe('today');
    expect(startTab('agenda', [...all])).toBe('today');
  });
  it('Unbekanntes, Leeres und nicht vorhandene Reiter führen zu Heute', () => {
    expect(startTab(null, [...all])).toBe('today');
    expect(startTab('unsinn', [...all])).toBe('today');
    expect(startTab('calendar', ['today', 'boards'])).toBe('today');
  });
});

describe('visibleTabs', () => {
  it('Add-on (Administrator oder Mitglied): alle vier', () => {
    expect(visibleTabs({ watchers: true, isChild: false })).toEqual(['today', 'boards', 'calendar', 'home']);
  });
  it('Kind: ohne Zuhause', () => {
    expect(visibleTabs({ watchers: true, isChild: true })).toEqual(['today', 'boards', 'calendar']);
  });
  it('Docker ohne Home Assistant: ohne Zuhause; mit Wächtern im Container: mit Zuhause', () => {
    expect(visibleTabs({ watchers: false, isChild: false })).toEqual(['today', 'boards', 'calendar']);
    expect(visibleTabs({ watchers: true, isChild: false })).toContain('home');
  });
});
