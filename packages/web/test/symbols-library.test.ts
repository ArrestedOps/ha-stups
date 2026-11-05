import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TILE_COLORS } from '../src/components/ui/Tile.svelte';
import { DEFAULT_SYMBOL, SECTIONS, SYMBOLS, SYMBOL_COLORS, sectionColor, symbolById, symbolColor, symbolName } from '../src/lib/symbols/library';
import { PATHS } from '../src/lib/symbols/paths';
import { DE } from '../src/lib/symbols/keywords.de';
import { EN } from '../src/lib/symbols/keywords.en';
import { WATCHER_ICON_IDS } from '../../server/src/watcher-icons';
import { setLanguage } from '../src/lib/i18n/index.svelte';

/** Obergrenze für die eingebauten Pfade (roh, in Zeichen); gemessen: rund 126 000 roh und 50 000 gzip bei 302 Symbolen */
const MAX_RAW = 140_000;
const MAX_GZIP = 60_000;

describe('Symbol-Bibliothek', () => {
  it('hat rund 300 Symbole in sechs Bereichen, ohne Doppelungen', () => {
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(280);
    expect(SYMBOLS.length).toBeLessThanOrEqual(330);
    expect(SECTIONS).toEqual(['haus', 'kueche', 'garten', 'familie', 'technik', 'weg']);
    const ids = SYMBOLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of SECTIONS) expect(SYMBOLS.filter((s) => s.section === section).length, section).toBeGreaterThanOrEqual(25);
  });

  it('jedes Symbol hat einen Pfad und Namen samt Suchwörtern in beiden Sprachen', () => {
    for (const s of SYMBOLS) {
      expect(PATHS[s.id], s.id).toMatch(/^M[\d.\-,\sA-Za-z]+$/);
      for (const [lang, table] of [['de', DE], ['en', EN]] as const) {
        const entry = table[s.id];
        expect(entry, `${s.id} ${lang}`).toBeDefined();
        expect(entry![0]!.trim().length, `${s.id} ${lang} Name`).toBeGreaterThan(0);
        expect(entry!.length, `${s.id} ${lang} Suchwörter`).toBeGreaterThanOrEqual(3);
        for (const w of entry!.slice(1)) expect(w, `${s.id} ${lang}`).toBe(w.trim().toLowerCase());
      }
    }
  });

  it('keine verwaisten Einträge: Pfade und Suchwörter gehören zu Symbolen des Katalogs', () => {
    const ids = new Set(SYMBOLS.map((s) => s.id));
    for (const table of [PATHS, DE, EN]) for (const id of Object.keys(table)) expect(ids.has(id), id).toBe(true);
  });

  it('bleibt unter der festgelegten Größe', () => {
    const raw = JSON.stringify(PATHS);
    expect(raw.length).toBeLessThan(MAX_RAW);
    expect(gzipSync(raw).length).toBeLessThan(MAX_GZIP);
  });

  it('das Standardsymbol „Aufgabe“ gibt es, jedes Symbol hat eine Kachelfarbe', () => {
    expect(symbolById(DEFAULT_SYMBOL)).toBeDefined();
    for (const s of SYMBOLS) expect(TILE_COLORS).toContain(sectionColor(s.section));
    expect(SYMBOL_COLORS.every((c) => TILE_COLORS.includes(c))).toBe(true);
  });

  it('Farbe: fest gewählt vor Auto (Bereich des Symbols); ohne Symbol Orange; Unbekanntes wird zum Standard', () => {
    expect(symbolColor({ icon: 'leaf', iconColor: null })).toBe('green');
    expect(symbolColor({ icon: 'leaf', iconColor: 'red' })).toBe('red');
    expect(symbolColor({ icon: null, iconColor: null })).toBe('orange');
    expect(symbolColor({ icon: null, iconColor: 'blue' })).toBe('blue');
    expect(symbolColor({ icon: 'gibt-es-nicht', iconColor: null })).toBe('orange');
    expect(symbolColor({ icon: 'leaf', iconColor: 'lila' })).toBe('green');
  });

  it('Namen in der Sprache der Oberfläche', () => {
    setLanguage('de');
    expect(symbolName('trash-can-outline')).toBe('Mülleimer');
    setLanguage('en');
    expect(symbolName('trash-can-outline')).toBe('Rubbish bin');
    expect(symbolName('gibt-es-nicht')).toBe(symbolName(DEFAULT_SYMBOL));
  });

  it('die Symbole, die der Server Wächter-Karten gibt, gehören zur Bibliothek', () => {
    const ids = new Set(SYMBOLS.map((s) => s.id));
    expect(WATCHER_ICON_IDS.length).toBeGreaterThan(10);
    for (const n of WATCHER_ICON_IDS) expect(ids.has(n), n).toBe(true);
  });
});
