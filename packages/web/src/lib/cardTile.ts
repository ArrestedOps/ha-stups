import type { TileColor } from '../components/ui/Tile.svelte';

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

/** Das Standardsymbol einer Karte (bis es Symbole pro Karte gibt): Wächter ein Auge, wiederholte Karten Pfeile, sonst die Checkliste */
export function cardIcon(card: { watcherId: string | null; recurrence: unknown }): string {
  if (card.watcherId) return 'eye';
  return card.recurrence ? 'repeat' : 'checklist';
}
