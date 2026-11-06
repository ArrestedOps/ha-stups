import type { Board, User } from './api';
import { t } from './i18n/index.svelte';

/**
 * Wer ein Board sieht (der Server entscheidet, die Oberfläche zeigt es nur an): alle, nur der Besitzer oder der Besitzer und die gewählten
 * Mitglieder. Auch Administratoren sehen fremde private oder ausgewählte Boards nicht, darum liefert der Server sie gar nicht erst aus.
 */
export type Visibility = 'all' | 'private' | 'selected';
export type BoardAccess = Pick<Board, 'visibility' | 'ownerId' | 'memberIds'>;

/** Die Personen, die dieses Board sehen (in der Reihenfolge der Personenliste) */
export function boardPeople(board: BoardAccess | undefined, people: User[]): User[] {
  const persons = people.filter((p) => p.isPerson);
  if (!board || !board.visibility || board.visibility === 'all') return persons;
  const allowed = new Set([...(board.ownerId ? [board.ownerId] : []), ...(board.visibility === 'selected' ? board.memberIds : [])]);
  return persons.filter((p) => allowed.has(p.id));
}

/** Wer es sieht, kurz: „Alle", „Rene, Anna" (Besitzer zuerst), „privat" */
export function boardWho(board: BoardAccess | undefined, people: User[]): string {
  if (!board || !board.visibility || board.visibility === 'all') return t('Alle');
  if (board.visibility === 'private') return t('privat');
  const seeing = boardPeople(board, people);
  const owner = seeing.find((p) => p.id === board.ownerId);
  return [...(owner ? [owner] : []), ...seeing.filter((p) => p !== owner)].map((p) => p.displayName).join(', ');
}

/** Zählt das Board zur Fairness der Woche? Ein privates Board nie, egal was gespeichert ist (so bleibt die Wahl beim Zurückstellen erhalten) */
export const boardCounts = (board: Pick<Board, 'visibility' | 'countsForFairness'> | undefined): boolean =>
  !board || (board.visibility !== 'private' && board.countsForFairness !== false);

/** Eine Zeile der Board-Auswahl für Wächter: „Name · Alle", „Name · Rene, Anna"; ein privates Board ist nicht wählbar („🔒 Name · privat") */
export function watcherBoardOption(board: Board, people: User[]): { id: string; label: string; short: string; disabled: boolean } {
  const private_ = board.visibility === 'private';
  return {
    id: board.id,
    label: private_ ? `🔒 ${board.name} · ${t('privat')}` : `${board.name} · ${boardWho(board, people)}`,
    short: board.name,
    disabled: private_,
  };
}

/** Die Art der Zuweisung in einem Wort für die Zeile „Rene (reihum)" im Dialog „Person entfernen" */
export function modeWord(mode: string): string {
  switch (mode) {
    case 'fixed':
      return t('fest');
    case 'rotation':
    case 'rotation_present':
      return t('reihum');
    case 'all_present':
      return t('alle Anwesenden');
    case 'first_home':
      return t('wer zuerst heimkommt');
    case 'suggest':
      return t('erst vorschlagen');
    default:
      return '';
  }
}

/** Was in der Spalte „Danach" steht: „Rene (reihum)"; bleibt niemand, sagt es der Text für die orange Zeile (missing) */
export function afterText(names: string[], mode: string): string {
  if (names.length === 0) return '';
  const word = modeWord(mode);
  return word ? `${names.join(', ')} (${word})` : names.join(', ');
}
