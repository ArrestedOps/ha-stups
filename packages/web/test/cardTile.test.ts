import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS } from '../src/lib/colors';
import { cardIcon, tileColorOf } from '../src/lib/cardTile';
import { TILE_COLORS } from '../src/components/ui/Tile.svelte';

describe('tileColorOf', () => {
  it('jede Kategoriefarbe ergibt eine der acht Kachelfarben', () => {
    for (const c of CATEGORY_COLORS) expect(TILE_COLORS, c).toContain(tileColorOf(c));
  });
  it('Unbekanntes und Fehlendes ist grau', () => {
    for (const bad of [null, undefined, '', 'lila']) expect(tileColorOf(bad)).toBe('gray');
  });
  it('Blau bleibt Blau, Rosa wird Rot, Gelb wird Orange', () => {
    expect([tileColorOf('blue'), tileColorOf('pink'), tileColorOf('yellow')]).toEqual(['blue', 'red', 'orange']);
  });
});

describe('cardIcon', () => {
  it('Wächter, Wiederholung, sonst Checkliste', () => {
    expect(cardIcon({ watcherId: 'w', recurrence: null })).toBe('eye');
    expect(cardIcon({ watcherId: null, recurrence: { every: 1 } })).toBe('repeat');
    expect(cardIcon({ watcherId: null, recurrence: null })).toBe('checklist');
  });
});
