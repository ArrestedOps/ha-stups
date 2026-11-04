import { describe, expect, it } from 'vitest';
import { migrateTab, startTab, visibleTabs } from '../src/lib/tabs';

describe('migrateTab', () => {
  it('bildet die alten Reiter auf die neuen ab', () => {
    for (const old of ['today', 'agenda', 'calendar']) expect(migrateTab(old), old).toBe('tasks');
    for (const old of ['home', 'watchers']) expect(migrateTab(old), old).toBe('watchers');
  });
  it('behält gültige Reiter', () => {
    for (const t of ['tasks', 'boards', 'watchers'] as const) expect(migrateTab(t)).toBe(t);
  });
  it('Unbekanntes, Leeres und fehlender Wert ergeben Aufgaben', () => {
    for (const bad of [null, undefined, '', 'unsinn', 'Boards']) expect(migrateTab(bad as string | null), String(bad)).toBe('tasks');
  });
});

describe('startTab: die App startet auf Aufgaben, nie auf Wächter', () => {
  const all = ['tasks', 'boards', 'watchers'] as const;
  it('gemerkt wird nur Boards', () => {
    expect(startTab('boards', [...all])).toBe('boards');
    expect(startTab('tasks', [...all])).toBe('tasks');
  });
  it('alte Namen für Heute und Kalender führen zu Aufgaben', () => {
    for (const old of ['today', 'agenda', 'calendar']) expect(startTab(old, [...all]), old).toBe('tasks');
  });
  it('Wächter, auch als alte Namen „home" und „watchers", führt zu Aufgaben', () => {
    for (const old of ['watchers', 'home']) expect(startTab(old, [...all]), old).toBe('tasks');
  });
  it('Unbekanntes, Leeres und nicht vorhandene Reiter führen zu Aufgaben', () => {
    expect(startTab(null, [...all])).toBe('tasks');
    expect(startTab('unsinn', [...all])).toBe('tasks');
    expect(startTab('boards', ['tasks'])).toBe('tasks');
  });
});

describe('visibleTabs: drei Reiter, für Kind und Docker ohne Home Assistant zwei', () => {
  it('Administrator und Mitglied im Add-on: alle drei', () => {
    expect(visibleTabs({ watchers: true, isChild: false })).toEqual(['tasks', 'boards', 'watchers']);
  });
  it('Kind: ohne Wächter, auch wenn Wächter laufen', () => {
    expect(visibleTabs({ watchers: true, isChild: true })).toEqual(['tasks', 'boards']);
    expect(visibleTabs({ watchers: false, isChild: true })).toEqual(['tasks', 'boards']);
  });
  it('Docker ohne Home Assistant: zwei; mit Wächtern im Container: drei', () => {
    expect(visibleTabs({ watchers: false, isChild: false })).toEqual(['tasks', 'boards']);
    expect(visibleTabs({ watchers: true, isChild: false })).toContain('watchers');
  });
});
