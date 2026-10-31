/** Farbnamen der Kategorien, Stile stehen in app.css (.cat-<name>) */
export const CATEGORY_COLORS = [
  'blue',
  'teal',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'indigo',
  'brown',
  'gray',
  'mint',
] as const;

/** Farbe für eine neue Kategorie: die erste Farbe der Reihe, die noch nicht benutzt wird; sind alle benutzt, reihum */
export function nextColor(used: string[]): string {
  return CATEGORY_COLORS.find((c) => !used.includes(c)) ?? CATEGORY_COLORS[used.length % CATEGORY_COLORS.length]!;
}

/** Kategorie mit diesem Namen (Groß- und Kleinschreibung egal) */
export const findCategory = <T extends { name: string }>(list: T[], name: string): T | undefined =>
  list.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());

/** Gültiger Farbname, sonst grau (für die Punkte an den Karten: var(--c-<name>-fg)) */
export const catKey = (color: string): string => (CATEGORY_COLORS.includes(color as never) ? color : 'gray');

export const catClass = (color: string): string => `cat cat-${CATEGORY_COLORS.includes(color as never) ? color : 'gray'}`;
