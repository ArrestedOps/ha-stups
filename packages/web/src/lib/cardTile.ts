import type { TileColor } from '../components/ui/Tile.svelte';
import { DEFAULT_SYMBOL, symbolById, symbolColor } from './symbols/library';

/** Aus der Kategorie- und Boardfarbe (zwölf Namen) wird die Kachelfarbe (acht Töne); Unbekanntes ist grau */
const MAP: Record<string, TileColor> = {
  orange: 'orange',
  yellow: 'orange',
  blue: 'blue',
  indigo: 'violet',
  purple: 'purple',
  teal: 'teal',
  green: 'green',
  mint: 'green',
  red: 'red',
  pink: 'red',
  brown: 'gray',
  gray: 'gray',
};

export const tileColorOf = (colorKey: string | null | undefined): TileColor => MAP[colorKey ?? ''] ?? 'gray';

/**
 * Symbol und Farbe der Kachel einer Karte: das Symbol der Karte, sonst „Aufgabe“ (Haken); die feste Farbe der Karte, sonst die
 * des Bereichs ihres Symbols, ohne Symbol Orange. Kategorie und Board bestimmen die Kachel nicht mehr (Kategorien stehen als
 * Wort in der Meta-Zeile und im Filter).
 */
export function cardTile(card: { icon: string | null; iconColor: string | null }): { icon: string; color: TileColor } {
  return { icon: symbolById(card.icon) ? card.icon! : DEFAULT_SYMBOL, color: symbolColor(card) };
}
