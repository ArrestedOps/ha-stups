import { generateKeyBetween } from 'fractional-indexing';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { type TrashType, type TrashItem, type Row } from './types.js';
import { TRASH_DAYS } from './constants.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';

/** Papierkorb */
export function createTrash(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { now, iso, one, all, run, tx } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { lastPos, visibleColumns } = lazy(s, ['lastPos', 'visibleColumns'] as const);

  const purgeAt = (deletedAt: string) =>
    new Date(Date.parse(deletedAt) + TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  function listTrash(): TrashItem[] {
    const rows: Row[] = [
      ...all("select 'board' as type, id, name as title, id as board_id, deleted_at from boards where deleted_at is not null"),
      ...all("select 'column' as type, id, name as title, board_id, deleted_at from columns where deleted_at is not null"),
      ...all("select 'category' as type, id, name as title, board_id, deleted_at from categories where deleted_at is not null"),
      ...all("select 'card' as type, id, title, board_id, deleted_at from cards where deleted_at is not null"),
    ];
    return rows
      .map((r) => ({
        type: r.type as TrashType,
        id: r.id as string,
        title: r.title as string,
        boardId: r.board_id as string,
        deletedAt: r.deleted_at as string,
        purgeAt: purgeAt(r.deleted_at),
      }))
      .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0));
  }

  function restoreFromTrash(type: TrashType, id: string): void {
    const table = { board: 'boards', column: 'columns', category: 'categories', card: 'cards' }[type];
    if (!table) throw new ValidationError('Unbekannter Typ');
    const row = one(`select * from ${table} where id = ? and deleted_at is not null`, id);
    if (!row) throw new NotFoundError('Nicht im Papierkorb');
    tx(() => {
      if (type !== 'board') {
        const board = one('select deleted_at from boards where id = ?', row.board_id);
        if (board?.deleted_at) throw new ConflictError('Das Board ist gelöscht. Bitte zuerst das Board wiederherstellen');
      }
      if (type === 'card') {
        const col = one('select deleted_at from columns where id = ?', row.column_id);
        if (col?.deleted_at) {
          const first = visibleColumns(row.board_id)[0];
          if (!first) throw new ConflictError('Das Board hat keine Spalte');
          run('update cards set column_id = ?, position = ? where id = ?', first.id, generateKeyBetween(lastPos('cards', 'column_id = ?', first.id), null), id);
        }
        run('update cards set deleted_at = null, updated_at = ?, version = version + 1 where id = ?', iso(), id);
      } else if (type === 'column') {
        const hasDone = one('select 1 as ok from columns where board_id = ? and is_done = 1 and deleted_at is null', row.board_id);
        if (row.is_done === 1 && hasDone) run('update columns set is_done = 0 where id = ?', id);
        const hasPlanned = one('select 1 as ok from columns where board_id = ? and is_planned = 1 and deleted_at is null', row.board_id);
        if (row.is_planned === 1 && hasPlanned) run('update columns set is_planned = 0 where id = ?', id);
        run('update columns set deleted_at = null where id = ?', id);
      } else {
        run(`update ${table} set deleted_at = null where id = ?`, id);
      }
    });
  }

  function purgeTrash(): number {
    const cutoff = new Date(now().getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return tx(() => {
      let n = 0;
      n += Number(run('delete from cards where deleted_at is not null and deleted_at < ?', cutoff).changes);
      n += Number(run('delete from categories where deleted_at is not null and deleted_at < ?', cutoff).changes);
      n += Number(
        run(
          `delete from columns where deleted_at is not null and deleted_at < ?
           and not exists (select 1 from cards where cards.column_id = columns.id)`,
          cutoff,
        ).changes,
      );
      n += Number(run('delete from boards where deleted_at is not null and deleted_at < ?', cutoff).changes);
      return n;
    });
  }

  return {
    purgeAt,
    listTrash,
    restoreFromTrash,
    purgeTrash,
  };
}
