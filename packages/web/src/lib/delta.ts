import type { BoardView, Card } from './api';

/** Was der Server bei einer Meldung mitschickt: einzelne Aufgaben oder „alles" */
export interface Changes {
  full: boolean;
  cards: string[];
}

/** Einzelne Aufgaben in einem Aufruf holen, nicht mehr als der Server erlaubt */
export const MAX_DELTA_CARDS = 50;

/**
 * Welche Aufgaben nachgeladen werden. `null` heißt: alles neu laden (keine Angabe, „alles" gemeldet,
 * eine Lücke in der Nummerierung oder zu viele Aufgaben auf einmal).
 */
export function deltaIds(changes: Changes | undefined, gap: boolean): string[] | null {
  if (!changes || changes.full || gap) return null;
  if (changes.cards.length > MAX_DELTA_CARDS) return null;
  return changes.cards;
}

const byPosition = (a: Card, b: Card) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Setzt die frisch geholten Aufgaben in die Ansicht ein: Aufgaben der Liste, die der Server nicht mehr liefert
 * (gelöscht, archiviert), verschwinden; Aufgaben eines anderen Boards gehören nicht hinein. Die Reihenfolge ist wie auf dem Server.
 * `null`, wenn sich die Summe der Kosten ändern könnte: die steht nur im ganzen Board und lässt sich hier nicht nachrechnen.
 */
export function applyCards(view: BoardView, ids: string[], fetched: Card[]): BoardView | null {
  const wanted = new Set(ids);
  if (view.cards.some((c) => wanted.has(c.id) && c.costCents !== null)) return null;
  if (fetched.some((c) => c.costCents !== null)) return null;
  const incoming = fetched.filter((c) => wanted.has(c.id) && c.boardId === view.board.id);
  const cards = [...view.cards.filter((c) => !wanted.has(c.id)), ...incoming].sort(byPosition);
  return { ...view, cards };
}
