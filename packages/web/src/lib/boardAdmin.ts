import type { Board, BoardDeletePreview, BoardSummary, User } from './api';
import { boardWho } from './boardAccess';
import { t } from './i18n/index.svelte';

/** Ein Eintrag eine Stelle nach oben (-1) oder unten (+1) schieben; am Rand bleibt die Liste, wie sie ist */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** Zweite Zeile eines Boards in der Auswahl: offene Aufgaben, dahinter klein, wer es sieht (Alle: nichts) */
export function boardMeta(board: Pick<BoardSummary, 'openCards' | 'visibility' | 'ownerId' | 'memberIds'>, people: User[]): { open: string; who: string | null } {
  const open = t('{n} offen', { n: board.openCards });
  if (board.visibility === 'private') return { open, who: `🔒 ${t('nur ich')}` };
  if (board.visibility === 'selected') return { open, who: `👥 ${boardWho(board, people)}` };
  return { open, who: null };
}

/** Boards, in die ein Wächter umziehen darf: nicht das Board selbst, nicht archiviert (die Liste kennt sie nicht), nicht privat */
export const moveTargets = (boards: Board[], from: string): Board[] => boards.filter((b) => b.id !== from && b.visibility !== 'private');

/** Der Satz zur Sperre des Löschens (oder Archivierens); null: nicht gesperrt */
export function lockText(p: Pick<BoardDeletePreview, 'lock' | 'mayManage' | 'ownerName'>, verb: 'delete' | 'archive' = 'delete'): string | null {
  if (!p.mayManage) {
    if (verb === 'delete') return p.ownerName ? t('Nur {owner} oder ein Administrator darf löschen.', { owner: p.ownerName }) : t('Nur ein Administrator darf löschen.');
    return p.ownerName ? t('Nur {owner} oder ein Administrator darf archivieren.', { owner: p.ownerName }) : t('Nur ein Administrator darf archivieren.');
  }
  if (p.lock === 'last') return verb === 'delete' ? t('Das letzte Board kann nicht gelöscht werden.') : t('Das letzte Board kann nicht archiviert werden.');
  return null;
}

/** Wie viele Aufgaben betroffen sind, als Kurzform für den Kopf des Abschnitts: „12 · 3 offen" */
export const cardsHead = (c: { total: number; open: number }): string => `${c.total} · ${t('{n} offen', { n: c.open })}`;

/** Der Standardname einer Kopie */
export const copyName = (name: string): string => t('{name} (Kopie)', { name });

/** Das Kachel-Symbol und die Farbe, die der Mockup als Auswahl zeigt: Haus, Hammer, Einkaufswagen, Blatt */
export const QUICK_SYMBOLS = ['home-outline', 'hammer', 'cart-outline', 'leaf'] as const;

/** Aus der Kachelfarbe (acht Töne, wie im Fenster „Symbol wählen") die Farbe des Boards (zwölf Namen) */
const TILE_TO_BOARD: Record<string, string> = { orange: 'orange', blue: 'blue', green: 'green', violet: 'indigo', purple: 'purple', red: 'red', teal: 'teal', gray: 'gray' };
export const boardColorOfTile = (tile: string): string => TILE_TO_BOARD[tile] ?? 'gray';
