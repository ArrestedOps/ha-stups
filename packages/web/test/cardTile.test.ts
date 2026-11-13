import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS } from '../src/lib/colors';
import { cardTile, tileColorOf } from '../src/lib/cardTile';
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

describe('cardTile: Symbol und Farbe der Kachel einer Aufgabe', () => {
  it('ohne Symbol: „Aufgabe“ (Haken), orange, auch für Wächter-Aufgaben und Wiederholungen', () => {
    expect(cardTile({ icon: null, iconColor: null })).toEqual({ icon: 'checkbox-marked-outline', color: 'orange' });
  });
  it('das Symbol der Aufgabe, Farbe nach Bereich (Auto)', () => {
    expect(cardTile({ icon: 'leaf', iconColor: null })).toEqual({ icon: 'leaf', color: 'green' });
    expect(cardTile({ icon: 'washing-machine', iconColor: null })).toEqual({ icon: 'washing-machine', color: 'orange' });
    expect(cardTile({ icon: 'car-outline', iconColor: null })).toEqual({ icon: 'car-outline', color: 'red' });
  });
  it('eine feste Farbe geht vor Auto, auch beim Standardsymbol', () => {
    expect(cardTile({ icon: 'leaf', iconColor: 'blue' })).toEqual({ icon: 'leaf', color: 'blue' });
    expect(cardTile({ icon: null, iconColor: 'teal' })).toEqual({ icon: 'checkbox-marked-outline', color: 'teal' });
  });
  it('ein unbekanntes Symbol (aus einer neueren Fassung) zeigt das Standardsymbol, die Farbe bleibt', () => {
    expect(cardTile({ icon: 'gibt-es-nicht', iconColor: 'red' })).toEqual({ icon: 'checkbox-marked-outline', color: 'red' });
    expect(cardTile({ icon: 'gibt-es-nicht', iconColor: null })).toEqual({ icon: 'checkbox-marked-outline', color: 'orange' });
  });
});
