import { randomUUID } from 'node:crypto';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { startOfTomorrow } from '../time.js';
import { type Board, type BoardSummary, type Column, type Category, type BoardView, type Row } from './types.js';
import { cleanText } from './validate.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import { t } from '../i18n/index.js';

/** Boards, Spalten, „Geplant" und Kategorien */
export function createBoards(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { now, timeZone, iso, one, all, run, tx } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { loadCards, placeCard, touchCard } = lazy(s, ['loadCards', 'placeCard', 'touchCard'] as const);

  const toBoard = (r: Row): Board => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    position: r.position,
    archiveAfterDays: r.archive_after_days,
  });

  function visibleBoard(id: string): Row {
    const r = one('select * from boards where id = ? and deleted_at is null', id);
    if (!r) throw new NotFoundError(t('Board nicht gefunden'));
    return r;
  }

  const lastPos = (table: string, where: string, ...p: unknown[]): string | null =>
    (one(`select max(position) as p from ${table} where ${where}`, ...p)?.p as string | null) ?? null;

  function createBoard(input: {
    name: string;
    icon?: string | null;
    color?: string | null;
    /** Spalte „Geplant" gleich mit anlegen (Standard der App) */
    withPlanned?: boolean;
  }): Board {
    const name = cleanText(input.name, t('Der Name'), 80);
    return tx(() => {
      const id = randomUUID();
      const stamp = iso();
      run(
        'insert into boards (id, name, icon, color, position, archive_after_days, created_at, updated_at) values (?, ?, ?, ?, ?, 7, ?, ?)',
        id,
        name,
        input.icon ?? null,
        input.color ?? null,
        generateKeyBetween(lastPos('boards', '1 = 1'), null),
        stamp,
        stamp,
      );
      const defaults: { name: string; done?: boolean; planned?: boolean }[] = [
        { name: t('Offen') },
        ...(input.withPlanned ? [{ name: t('Geplant'), planned: true }] : []),
        { name: t('In Arbeit') },
        { name: t('Erledigt'), done: true },
      ];
      const positions = generateNKeysBetween(null, null, defaults.length);
      defaults.forEach((col, i) => {
        run(
          'insert into columns (id, board_id, name, position, is_done, is_planned) values (?, ?, ?, ?, ?, ?)',
          randomUUID(),
          id,
          col.name,
          positions[i]!,
          col.done ? 1 : 0,
          col.planned ? 1 : 0,
        );
      });
      return toBoard(one('select * from boards where id = ?', id)!);
    });
  }

  function listBoards(): BoardSummary[] {
    return all('select * from boards where deleted_at is null order by position, id').map((r) => ({
      ...toBoard(r),
      openCards: one(
        `select count(*) as n from cards c join columns col on col.id = c.column_id
         where c.board_id = ? and c.deleted_at is null and c.archived_at is null
           and col.is_done = 0 and col.is_planned = 0`,
        r.id,
      )!.n as number,
    }));
  }

  function updateBoard(
    id: string,
    patch: { name?: string; icon?: string | null; color?: string | null; archiveAfterDays?: number },
  ): Board {
    visibleBoard(id);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(cleanText(patch.name, t('Der Name'), 80));
    }
    if (patch.icon !== undefined) {
      sets.push('icon = ?');
      params.push(patch.icon);
    }
    if (patch.color !== undefined) {
      sets.push('color = ?');
      params.push(patch.color);
    }
    if (patch.archiveAfterDays !== undefined) {
      if (!Number.isInteger(patch.archiveAfterDays) || patch.archiveAfterDays < 0 || patch.archiveAfterDays > 3650) {
        throw new ValidationError(t('Die Archivfrist muss zwischen 0 und 3650 Tagen liegen'));
      }
      sets.push('archive_after_days = ?');
      params.push(patch.archiveAfterDays);
    }
    if (sets.length > 0) {
      run(`update boards set ${sets.join(', ')}, updated_at = ? where id = ?`, ...params, iso(), id);
    }
    return toBoard(one('select * from boards where id = ?', id)!);
  }

  function deleteBoard(id: string): void {
    visibleBoard(id);
    run('update boards set deleted_at = ? where id = ?', iso(), id);
  }

  const toColumn = (r: Row): Column => ({
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    position: r.position,
    isDone: r.is_done === 1,
    isPlanned: r.is_planned === 1,
  });

  function visibleColumn(id: string): Row {
    const r = one(
      `select c.* from columns c join boards b on b.id = c.board_id
       where c.id = ? and c.deleted_at is null and b.deleted_at is null`,
      id,
    );
    if (!r) throw new NotFoundError(t('Spalte nicht gefunden'));
    return r;
  }

  const visibleColumns = (boardId: string): Row[] =>
    all('select * from columns where board_id = ? and deleted_at is null order by position, id', boardId);

  function addColumn(boardId: string, input: { name: string; isDone?: boolean; isPlanned?: boolean }): Column {
    visibleBoard(boardId);
    const name = cleanText(input.name, t('Der Name'), 60);
    if (input.isDone && input.isPlanned) {
      throw new ValidationError(t('Eine Spalte kann nicht gleichzeitig „Erledigt" und „Geplant" sein'));
    }
    return tx(() => {
      const id = randomUUID();
      if (input.isDone) run('update columns set is_done = 0 where board_id = ? and is_done = 1', boardId);
      if (input.isPlanned) run('update columns set is_planned = 0 where board_id = ? and is_planned = 1', boardId);
      run(
        'insert into columns (id, board_id, name, position, is_done, is_planned) values (?, ?, ?, ?, ?, ?)',
        id,
        boardId,
        name,
        generateKeyBetween(lastPos('columns', 'board_id = ?', boardId), null),
        input.isDone ? 1 : 0,
        input.isPlanned ? 1 : 0,
      );
      if (input.isPlanned) syncPlannedBoard(boardId);
      return toColumn(one('select * from columns where id = ?', id)!);
    });
  }

  function updateColumn(id: string, patch: { name?: string; isDone?: boolean; isPlanned?: boolean }): Column {
    const col = visibleColumn(id);
    return tx(() => {
      if (patch.name !== undefined) {
        run('update columns set name = ? where id = ?', cleanText(patch.name, t('Der Name'), 60), id);
      }
      if (patch.isDone === true && (col.is_planned === 1 || patch.isPlanned === true)) {
        throw new ValidationError(t('Eine Spalte kann nicht gleichzeitig „Erledigt" und „Geplant" sein'));
      }
      if (patch.isPlanned === true && col.is_done === 1 && patch.isDone !== false) {
        throw new ValidationError(t('Eine Spalte kann nicht gleichzeitig „Erledigt" und „Geplant" sein'));
      }
      if (patch.isDone === true) {
        run('update columns set is_done = 0 where board_id = ? and is_done = 1 and id <> ?', col.board_id, id);
        run('update columns set is_done = 1 where id = ?', id);
      } else if (patch.isDone === false) {
        run('update columns set is_done = 0 where id = ?', id);
      }
      if (patch.isPlanned === true) {
        run('update columns set is_planned = 0 where board_id = ? and is_planned = 1 and id <> ?', col.board_id, id);
        run('update columns set is_planned = 1 where id = ?', id);
        syncPlannedBoard(col.board_id);
      } else if (patch.isPlanned === false) {
        run('update columns set is_planned = 0 where id = ?', id);
      }
      return toColumn(one('select * from columns where id = ?', id)!);
    });
  }

  const plannedColumn = (boardId: string): Row | undefined => visibleColumns(boardId).find((c) => c.is_planned === 1);

  /** Die Spalte, in die neue Karten kommen: die erste, die weder „Erledigt" noch „Geplant" ist */
  const inboxColumn = (boardId: string): Row | undefined =>
    visibleColumns(boardId).find((c) => c.is_done !== 1 && c.is_planned !== 1);

  /** Termin heute oder später als heute? Dann ist die Karte „geplant", nicht „offen". */
  function isFutureDue(dueAt: string | null): boolean {
    return dueAt !== null && Date.parse(dueAt) >= startOfTomorrow(now().getTime(), timeZone());
  }

  /**
   * Hält „Offen" und „Geplant" sauber: Karten mit Termin nach heute wandern nach „Geplant",
   * Karten in „Geplant" ohne Termin oder mit Termin heute oder früher zurück nach „Offen".
   * Andere Spalten (z. B. „In Arbeit") bleiben unangetastet.
   */
  function syncPlannedBoard(boardId: string): number {
    const planned = plannedColumn(boardId);
    const inbox = inboxColumn(boardId);
    if (!planned || !inbox) return 0;
    let moved = 0;
    const cards = all(
      `select id, column_id, due_at from cards
       where board_id = ? and column_id in (?, ?) and deleted_at is null and archived_at is null and completed_at is null
       order by position, id`,
      boardId,
      inbox.id,
      planned.id,
    );
    for (const c of cards) {
      const future = isFutureDue(c.due_at);
      if (c.column_id === inbox.id && future) {
        placeCard(c.id, planned, undefined);
        touchCard(c.id);
        moved++;
      } else if (c.column_id === planned.id && !future) {
        placeCard(c.id, inbox, null);
        touchCard(c.id);
        moved++;
      }
    }
    return moved;
  }

  /** Alle Boards abgleichen. Gibt die Zahl der verschobenen Karten zurück. */
  function syncPlanned(): number {
    return tx(() => all('select id from boards where deleted_at is null').reduce((n, b) => n + syncPlannedBoard(b.id), 0));
  }

  /**
   * Einmalig für Boards, die es vor der Spalte „Geplant" gab: Spalte hinter der ersten Spalte anlegen.
   * Wer sie später löscht, bekommt sie nicht zurück.
   */
  function ensurePlannedColumns(): void {
    if (one("select 1 as ok from settings where key = 'plannedColumnsAdded'")) return;
    tx(() => {
      for (const b of all('select id from boards where deleted_at is null')) {
        if (all('select id from columns where board_id = ? and is_planned = 1', b.id).length > 0) continue;
        const cols = visibleColumns(b.id);
        const inbox = inboxColumn(b.id);
        if (!inbox) continue;
        const next = cols[cols.findIndex((c) => c.id === inbox.id) + 1];
        run(
          'insert into columns (id, board_id, name, position, is_done, is_planned) values (?, ?, ?, ?, 0, 1)',
          randomUUID(),
          b.id,
          'Geplant',
          generateKeyBetween(inbox.position, next?.position ?? null),
        );
        syncPlannedBoard(b.id);
      }
      run("insert into settings (key, value) values ('plannedColumnsAdded', '1')");
    });
  }

  function neighbours(
    items: { id: string; position: string }[],
    afterId: string | null | undefined,
  ): { prev: string | null; next: string | null } {
    if (afterId === undefined) return { prev: items.at(-1)?.position ?? null, next: null };
    if (afterId === null) return { prev: null, next: items[0]?.position ?? null };
    const i = items.findIndex((x) => x.id === afterId);
    if (i < 0) throw new ValidationError(t('Die Bezugsposition liegt nicht in dieser Liste'));
    return { prev: items[i]!.position, next: items[i + 1]?.position ?? null };
  }

  function moveColumn(id: string, afterId: string | null): Column {
    const col = visibleColumn(id);
    const others = visibleColumns(col.board_id).filter((c) => c.id !== id);
    const { prev, next } = neighbours(others as { id: string; position: string }[], afterId);
    run('update columns set position = ? where id = ?', generateKeyBetween(prev, next), id);
    return toColumn(one('select * from columns where id = ?', id)!);
  }

  function deleteColumn(id: string, moveToColumnId?: string): void {
    const col = visibleColumn(id);
    tx(() => {
      if (visibleColumns(col.board_id).length <= 1) {
        throw new ConflictError(t('Die letzte Spalte kann nicht gelöscht werden'));
      }
      const cards = all(
        'select id from cards where column_id = ? and deleted_at is null order by position, id',
        id,
      );
      if (cards.length > 0) {
        if (!moveToColumnId) {
          throw new ConflictError(t('Die Spalte enthält Karten. Bitte eine Spalte zum Verschieben wählen'));
        }
        const target = visibleColumn(moveToColumnId);
        if (target.board_id !== col.board_id || target.id === id) {
          throw new ValidationError(t('Die Zielspalte ist ungültig'));
        }
        let prev = lastPos('cards', 'column_id = ?', target.id);
        for (const c of cards) {
          const pos = generateKeyBetween(prev, null);
          run('update cards set column_id = ?, position = ?, updated_at = ?, version = version + 1 where id = ?', target.id, pos, iso(), c.id);
          prev = pos;
        }
      }
      run('update columns set deleted_at = ? where id = ?', iso(), id);
    });
  }

  const toCategory = (r: Row): Category => ({
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    color: r.color,
    position: r.position,
  });

  function visibleCategory(id: string): Row {
    const r = one('select * from categories where id = ? and deleted_at is null', id);
    if (!r) throw new NotFoundError(t('Kategorie nicht gefunden'));
    return r;
  }

  function addCategory(boardId: string, input: { name: string; color: string }): Category {
    visibleBoard(boardId);
    const name = cleanText(input.name, t('Der Name'), 40);
    const color = cleanText(input.color, t('Die Farbe'), 32);
    const id = randomUUID();
    run(
      'insert into categories (id, board_id, name, color, position) values (?, ?, ?, ?, ?)',
      id,
      boardId,
      name,
      color,
      generateKeyBetween(lastPos('categories', 'board_id = ?', boardId), null),
    );
    return toCategory(one('select * from categories where id = ?', id)!);
  }

  function updateCategory(id: string, patch: { name?: string; color?: string }): Category {
    visibleCategory(id);
    if (patch.name !== undefined) run('update categories set name = ? where id = ?', cleanText(patch.name, t('Der Name'), 40), id);
    if (patch.color !== undefined) run('update categories set color = ? where id = ?', cleanText(patch.color, t('Die Farbe'), 32), id);
    return toCategory(one('select * from categories where id = ?', id)!);
  }

  function deleteCategory(id: string): void {
    visibleCategory(id);
    run('update categories set deleted_at = ? where id = ?', iso(), id);
  }

  function getBoardView(boardId: string): BoardView {
    const board = visibleBoard(boardId);
    return {
      board: toBoard(board),
      columns: visibleColumns(boardId).map(toColumn),
      categories: all(
        'select * from categories where board_id = ? and deleted_at is null order by position, id',
        boardId,
      ).map(toCategory),
      cards: loadCards('board_id = ? and deleted_at is null and archived_at is null', boardId),
      costTotalCents: Number(
        one(
          'select coalesce(sum(cost_cents), 0) as total from cards where board_id = ? and deleted_at is null',
          boardId,
        )!.total,
      ),
    };
  }

  function ensureDefaultBoard(): void {
    if (one('select count(*) as n from boards')!.n === 0) createBoard({ name: t('Haushalt'), withPlanned: true });
  }

  return {
    toBoard,
    visibleBoard,
    lastPos,
    createBoard,
    listBoards,
    updateBoard,
    deleteBoard,
    toColumn,
    visibleColumn,
    visibleColumns,
    addColumn,
    updateColumn,
    plannedColumn,
    inboxColumn,
    isFutureDue,
    syncPlannedBoard,
    syncPlanned,
    ensurePlannedColumns,
    neighbours,
    moveColumn,
    deleteColumn,
    toCategory,
    visibleCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    getBoardView,
    ensureDefaultBoard,
  };
}
