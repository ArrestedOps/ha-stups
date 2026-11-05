import { readFileSync } from 'node:fs';
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

describe('startTab: die App startet immer auf Aufgaben', () => {
  it('Aufgaben, nie Boards oder Wächter', () => {
    expect(startTab()).toBe('tasks');
  });
  it('ein früher gemerkter Reiter (auch einer der alten Namen) ändert daran nichts: der Speicher wird nicht mehr gelesen', () => {
    const store = readFileSync(new URL('../src/lib/store.svelte.ts', import.meta.url), 'utf8');
    expect(store).not.toMatch(/stups\.tab/);
    expect(store).toMatch(/ui\.tab = startTab\(\)/);
  });
  it('die alten Namen werden weiter zu den neuen Reitern abgebildet (für Verweise und alte Einträge)', () => {
    for (const old of ['today', 'agenda', 'calendar']) expect(migrateTab(old), old).toBe('tasks');
    for (const old of ['watchers', 'home']) expect(migrateTab(old), old).toBe('watchers');
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
