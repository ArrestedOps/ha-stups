/**
 * Die Suche oben auf dem Desktop filtert die schon geladenen Karten im Gerät (keine Suche auf dem Server):
 * Groß- und Kleinschreibung sowie Akzente zählen nicht, jedes Wort der Eingabe muss irgendwo vorkommen.
 */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Passt der Text (zum Beispiel Titel und Beschreibung einer Karte) zur Eingabe? Eine leere Eingabe passt immer. */
export function matchesQuery(query: string, ...texts: (string | null | undefined)[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(texts.filter((x): x is string => !!x).join(' \n '));
  return words.every((w) => hay.includes(w));
}
