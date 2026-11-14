import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { BoardVisibility, Row } from './types.js';

/**
 * Für wen eine Abfrage gilt: die Kennung der Person, oder `null` (niemand Bestimmtes, zum Beispiel ein Hintergrunddienst für alle):
 * dann zählen nur Boards, die alle sehen. Jede Abfrage, die Boards oder Aufgaben liefert, fragt hier, was gesehen werden darf.
 */
export type Viewer = string | null;

/**
 * Sichtbarkeit von Boards. Die einzige Stelle, die entscheidet, wer ein Board sieht (`canSeeBoard`, `boardVisibleSql`):
 * - all: jede Person mit Zugriff
 * - private: nur der Besitzer
 * - selected: der Besitzer und die gewählten Mitglieder
 * Auch Administratoren sehen fremde private oder ausgewählte Boards nicht. Wer nicht (mehr) in der Liste der Personen steht, sieht nur
 * Boards für alle: Eine entfernte Person kommt so nicht mehr an ihre privaten Boards, sie bleiben verborgen (und tauchen nur in der Liste
 * „Boards ohne Besitzer" für Administratoren auf, ohne Inhalt).
 */
export function createVisibility(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { one, all } = c;
  const { people } = lazy(s, ['people'] as const);

  /**
   * SQL-Bedingung: `viewer` darf dieses Board sehen, ohne auf Archiv zu achten (nur die Sichtbarkeit); für die Liste „Archivierte Boards"
   * und das Wiederherstellen. Alles andere fragt `boardVisibleSql`.
   */
  function boardAccessSql(alias: string, viewer: Viewer): { sql: string; args: (string | null)[] } {
    return {
      sql: `(${alias}.visibility = 'all' or (? in (select pu.id from users pu where pu.is_person = 1) and (${alias}.owner_id = ? or (${alias}.visibility = 'selected' and exists (select 1 from board_members bm where bm.board_id = ${alias}.id and bm.user_id = ?)))))`,
      args: [viewer, viewer, viewer],
    };
  }

  /** SQL-Bedingung: `viewer` sieht das Board mit diesem Alias (Platzhalter in `args`, in dieser Reihenfolge); ein archiviertes Board sieht niemand */
  function boardVisibleSql(alias: string, viewer: Viewer): { sql: string; args: (string | null)[] } {
    const a = boardAccessSql(alias, viewer);
    return { sql: `(${alias}.archived_at is null and ${a.sql})`, args: a.args };
  }

  /** SQL-Teilabfrage: die Kennungen aller (nicht gelöschten) Boards, die `viewer` sieht, für `board_id in (…)` */
  function visibleBoardsSql(viewer: Viewer): { sql: string; args: (string | null)[] } {
    const v = boardVisibleSql('vb', viewer);
    return { sql: `select vb.id from boards vb where vb.deleted_at is null and ${v.sql}`, args: v.args };
  }

  /** Sieht die Person dieses Board? (Auch ein gelöschtes Board bleibt geschützt: es steht im Papierkorb nur für Berechtigte.) Unbekannt: nein. */
  function canSeeBoard(viewer: Viewer, boardId: string): boolean {
    const v = boardVisibleSql('b', viewer);
    return !!one(`select 1 as ok from boards b where b.id = ? and ${v.sql}`, boardId, ...v.args);
  }

  /** Darf die Person das Board sehen, auch wenn es archiviert ist? (Wiederherstellen aus dem Archiv, Zugriffsprüfung der Routen.) Unbekannt: nein. */
  function canAccessBoard(viewer: Viewer, boardId: string): boolean {
    const v = boardAccessSql('b', viewer);
    return !!one(`select 1 as ok from boards b where b.id = ? and ${v.sql}`, boardId, ...v.args);
  }

  /** Die Kennungen aller (nicht gelöschten) Boards, die die Person sieht */
  function visibleBoardIds(viewer: Viewer): string[] {
    const v = visibleBoardsSql(viewer);
    return all(v.sql, ...v.args).map((r) => r.id as string);
  }

  /** Das Board einer Aufgabe, auch einer gelöschten (für die Zugriffsprüfung); null, wenn es die Aufgabe nicht gibt */
  const boardIdOfCardAny = (cardId: string): string | null =>
    (one('select board_id from cards where id = ?', cardId)?.board_id as string | undefined) ?? null;

  /** Sieht die Person das Board dieser Aufgabe? Unbekannte Aufgabe: nein. */
  function canSeeCard(viewer: Viewer, cardId: string): boolean {
    const board = boardIdOfCardAny(cardId);
    return board !== null && canSeeBoard(viewer, board);
  }

  const boardRow = (boardId: string): Row | undefined => one('select visibility, owner_id from boards where id = ?', boardId);

  /** Die gewählten Mitglieder (Tabelle board_members), ohne den Besitzer */
  const boardMemberIds = (boardId: string): string[] =>
    all('select user_id from board_members where board_id = ? order by rowid', boardId).map((r) => r.user_id as string);

  /**
   * Die Personen (Kennungen, in der Reihenfolge der Personenliste), die ein Board mit diesen Angaben sehen: Zuständige einer Aufgabe und
   * Kreise der Wächter kommen nur aus ihnen.
   */
  function peopleSeeing(visibility: BoardVisibility, ownerId: string | null, memberIds: string[]): string[] {
    const everyone = people().map((p) => p.id);
    if (visibility === 'all') return everyone;
    const allowed = new Set([...(ownerId ? [ownerId] : []), ...(visibility === 'selected' ? memberIds : [])]);
    return everyone.filter((id) => allowed.has(id));
  }

  /** Die Personen, die dieses Board sehen (unbekanntes Board: niemand) */
  function boardPeopleIds(boardId: string): string[] {
    const r = boardRow(boardId);
    if (!r) return [];
    return peopleSeeing(r.visibility as BoardVisibility, (r.owner_id as string | null) ?? null, boardMemberIds(boardId));
  }

  return { boardAccessSql, boardVisibleSql, visibleBoardsSql, canSeeBoard, canAccessBoard, visibleBoardIds, boardIdOfCardAny, canSeeCard, boardMemberIds, peopleSeeing, boardPeopleIds };
}
