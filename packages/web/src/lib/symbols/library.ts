import type { TileColor } from '../../components/ui/Tile.svelte';
import { i18n, t } from '../i18n/index.svelte';
import catalog from './catalog.json';
import { DE } from './keywords.de';
import { EN } from './keywords.en';
import { PATHS } from './paths';

/** Die Symbol-Bibliothek: rund 300 mdi-Symbole, fest eingebaut (Pfade aus @mdi/js über scripts/build-symbols.mjs, Namen und Suchwörter von Hand) */
export type SymbolSection = 'haus' | 'kueche' | 'garten' | 'familie' | 'technik' | 'weg';

export interface SymbolInfo {
  /** mdi-Name ohne Präfix, z. B. `washing-machine` (so steht er an der Karte) */
  id: string;
  section: SymbolSection;
}

/** Das Standardsymbol „Aufgabe“ (Haken), auch für Karten ohne Symbol */
export const DEFAULT_SYMBOL = 'checkbox-marked-outline';
/** Standardfarbe: Orange */
export const DEFAULT_COLOR: TileColor = 'orange';

export const SECTIONS = catalog.sections as SymbolSection[];
export const SYMBOLS: SymbolInfo[] = (catalog.icons as [string, SymbolSection][]).map(([id, section]) => ({ id, section }));

/** Farbe eines Bereichs, wenn die Karte keine feste Farbe hat („Auto“): wie im Mockup */
const SECTION_COLOR: Record<SymbolSection, TileColor> = {
  haus: 'orange',
  kueche: 'blue',
  garten: 'green',
  familie: 'violet',
  technik: 'purple',
  weg: 'red',
};
export const sectionColor = (s: SymbolSection): TileColor => SECTION_COLOR[s];

/** Die Farben zur Wahl im Symbol-Fenster (Reihenfolge wie im Mockup) */
export const SYMBOL_COLORS: TileColor[] = ['orange', 'blue', 'green', 'violet', 'purple', 'red', 'teal'];
/** Alle Namen, die der Server als Farbe annimmt */
export const ICON_COLORS: TileColor[] = ['orange', 'purple', 'violet', 'blue', 'teal', 'green', 'red', 'gray'];

const byId = new Map(SYMBOLS.map((s) => [s.id, s]));
export const symbolById = (id: string | null | undefined): SymbolInfo | undefined => (id ? byId.get(id) : undefined);

/** Pfad des Symbols; unbekannte Namen (etwa aus einer neueren Fassung oder von Home Assistant) zeigen das Standardsymbol */
export const symbolPath = (id: string | null | undefined): string => PATHS[id && byId.has(id) ? id : DEFAULT_SYMBOL]!;

/** Welche Kachelfarbe eine Karte hat: feste Farbe, sonst die des Bereichs ihres Symbols, ohne Symbol Orange */
export function symbolColor(card: { icon: string | null; iconColor: string | null }): TileColor {
  if (card.iconColor && (ICON_COLORS as string[]).includes(card.iconColor)) return card.iconColor as TileColor;
  const s = symbolById(card.icon);
  return s ? sectionColor(s.section) : DEFAULT_COLOR;
}

/** Name des Symbols in der Sprache der Oberfläche (für aria-label und Anzeige) */
export function symbolName(id: string | null | undefined, lang = i18n.lang): string {
  const key = id && byId.has(id) ? id : DEFAULT_SYMBOL;
  return (lang === 'de' ? DE : EN)[key]![0]!;
}

/** Überschrift eines Bereichs */
export function sectionTitle(s: SymbolSection): string {
  switch (s) {
    case 'haus':
      return t('Haushalt');
    case 'kueche':
      return t('Küche und Einkauf');
    case 'garten':
      return t('Garten und Tiere');
    case 'familie':
      return t('Familie');
    case 'technik':
      return t('Technik und Reparatur');
    case 'weg':
      return t('Unterwegs und Finanzen');
  }
}
