import { randomUUID } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { nextDue, type Recurrence } from '../recurrence.js';
import { type CompletionSource, type Completion, type CompleteResult, type CardDetail, type Row } from './types.js';
import { resolveCarry } from './validate.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import { t } from '../i18n/index.js';

/** Erledigen und Wiederholen */
export function createCompletion(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { now, timeZone, iso, one, all, run, tx } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { copyReminders, closeOpenNudges, columnName, getCard, isFutureDue, lastPos, logEvent, placeCard, plannedColumn, touchCard, visibleCardRow, visibleColumn, visibleColumns } = lazy(s, ['copyReminders', 'closeOpenNudges', 'columnName', 'getCard', 'isFutureDue', 'lastPos', 'logEvent', 'placeCard', 'plannedColumn', 'touchCard', 'visibleCardRow', 'visibleColumn', 'visibleColumns'] as const);

  function listCompletions(cardId: string, limit = 50): Completion[] {
    return all(
      `select c.*, u.display_name as by_name from completions c left join users u on u.id = c.completed_by
       where c.card_id = ? order by c.completed_at desc, c.rowid desc limit ?`,
      cardId,
      limit,
    ).map((r) => ({
      id: r.id,
      cardId: r.card_id,
      completedBy: r.completed_by,
      completedByName: r.by_name,
      completedAt: r.completed_at,
      dueAt: r.due_at,
      source: r.source,
    }));
  }

  interface Snapshot {
    columnId: string;
    position: string;
    dueAt: string | null;
    completedAt: string | null;
    archivedAt: string | null;
    checklistDone: string[];
    /** Wiederholungsregel vor dem Erledigen (JSON). Fehlt bei Erledigungen aus Versionen vor 0.12. */
    recurrence?: string | null;
    /** Die bei der Wiederholung angelegte Karte, die „Rückgängig" wieder entfernt */
    spawnedId?: string | null;
  }

  function snapshotOf(card: Row): Snapshot {
    return {
      columnId: card.column_id,
      position: card.position,
      dueAt: card.due_at,
      completedAt: card.completed_at,
      archivedAt: card.archived_at,
      checklistDone: all('select id from checklist_items where card_id = ? and done = 1', card.id).map((r) => r.id as string),
      recurrence: card.recurrence,
    };
  }

  /**
   * Legt die nächste Karte einer wiederkehrenden Karte an: Titel, Zuweisung, Kategorien, Priorität, Wiederholung und
   * Erinnerungen immer, den Rest nur laut Auswahl der Karte. Fotos teilen sich die Datei mit der erledigten Karte.
   */
  function spawnNextCard(src: Row, nextDueAt: string): string {
    const carry = resolveCarry(src.carry_over);
    const newId = randomUUID();
    const t = iso();
    const planned = plannedColumn(src.board_id);
    const toPlanned = !!planned && isFutureDue(nextDueAt);
    const col = toPlanned ? planned! : firstOpenColumn(src.board_id);
    run(
      `insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence,
                          remind_before_min, cost_cents, carry_over, repeated_from, created_by, created_at, updated_at, effort,
                          icon, icon_color, icon_source)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId,
      src.board_id,
      col.id,
      generateKeyBetween(lastPos('cards', 'column_id = ?', col.id), null),
      src.title,
      carry.includes('description') ? src.description : null,
      src.priority,
      nextDueAt,
      src.recurrence,
      src.remind_before_min,
      carry.includes('cost') ? src.cost_cents : null,
      src.carry_over,
      src.id,
      src.created_by,
      t,
      t,
      src.effort ?? null,
      src.icon ?? null, // das Symbol gehört zur Aufgabe und wird immer übernommen
      src.icon_color ?? null,
      src.icon_source ?? null,
    );
    run('update cards set confirm = ? where id = ?', src.confirm ?? null, newId); // die Bestätigungspflicht gehört zur Aufgabe
    run('insert into card_assignees (card_id, user_id) select ?, user_id from card_assignees where card_id = ?', newId, src.id);
    copyReminders(src.id, newId); // Nachhaken gehört zur Aufgabe: kommt mit, zählt aber bei der neuen Karte von vorn
    run(
      `insert into card_categories (card_id, category_id)
       select ?, cc.category_id from card_categories cc
       join categories c on c.id = cc.category_id and c.deleted_at is null where cc.card_id = ?`,
      newId,
      src.id,
    );
    if (carry.includes('checklist')) {
      for (const item of all('select text, position from checklist_items where card_id = ? order by position, id', src.id)) {
        run('insert into checklist_items (id, card_id, text, done, position) values (?, ?, ?, 0, ?)', randomUUID(), newId, item.text, item.position);
      }
    }
    if (carry.includes('links')) {
      for (const l of all('select url, title, kind, position from links where card_id = ? order by position, id', src.id)) {
        run('insert into links (id, card_id, url, title, kind, position) values (?, ?, ?, ?, ?, ?)', randomUUID(), newId, l.url, l.title, l.kind, l.position);
      }
    }
    if (carry.includes('attachments')) {
      for (const a of all('select * from attachments where card_id = ? order by created_at, rowid', src.id)) {
        run(
          `insert into attachments (id, card_id, filename, mime, size, file, thumb, created_by, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(),
          newId,
          a.filename,
          a.mime,
          a.size,
          a.file,
          a.thumb,
          a.created_by,
          a.created_at,
        );
      }
    }
    if (carry.includes('comments')) {
      for (const c of all('select author_id, text, created_at, edited_at from comments where card_id = ? order by created_at, rowid', src.id)) {
        run(
          'insert into comments (id, card_id, author_id, text, created_at, edited_at) values (?, ?, ?, ?, ?, ?)',
          randomUUID(),
          newId,
          c.author_id,
          c.text,
          c.created_at,
          c.edited_at,
        );
      }
    }
    placeCard(newId, col, toPlanned ? undefined : null);
    return newId;
  }

  function recordCompletion(
    cardId: string,
    by: string | null,
    source: CompletionSource,
    dueAt: string | null,
    snapshot: Snapshot,
  ): string {
    const id = randomUUID();
    run(
      'insert into completions (id, card_id, completed_by, completed_at, due_at, source, snapshot) values (?, ?, ?, ?, ?, ?, ?)',
      id,
      cardId,
      by,
      iso(),
      dueAt,
      source,
      JSON.stringify(snapshot),
    );
    return id;
  }

  function firstOpenColumn(boardId: string): Row {
    const cols = visibleColumns(boardId);
    const col = cols.find((c) => c.is_done !== 1 && c.is_planned !== 1) ?? cols.find((c) => c.is_done !== 1) ?? cols[0];
    if (!col) throw new ConflictError(t('Das Board hat keine Spalte'));
    return col;
  }

  function completeCard(id: string, ctx: { by: string | null; source: CompletionSource }): CompleteResult {
    const card = visibleCardRow(id);
    const recurrence = card.recurrence ? (JSON.parse(card.recurrence) as Recurrence) : null;
    if (!recurrence && card.completed_at !== null) {
      return { card: getCard(id), completionId: null, nextDueAt: null, nextCardId: null };
    }
    return tx(() => {
      const snapshot = snapshotOf(card);
      let nextDueAt: string | null = null;
      let nextCardId: string | null = null;
      // Offene Stupse gehören zur erledigten Karte; die Absender bekommen eine Rückmeldung
      closeOpenNudges(id, ctx.by, true);
      if (recurrence) {
        // Die erledigte Karte bleibt als Nachweis in „Erledigt" (ohne Wiederholung), eine neue Karte
        // mit dem nächsten Termin übernimmt: oben in „Offen" oder, bei Termin nach heute, in „Geplant"
        nextDueAt = nextDue(recurrence, card.due_at ?? iso(), iso(), timeZone());
        nextCardId = spawnNextCard(card, nextDueAt);
        snapshot.spawnedId = nextCardId;
        const done = visibleColumns(card.board_id).find((c) => c.is_done === 1);
        if (done && done.id !== card.column_id) placeCard(id, done, null);
        run('update cards set recurrence = null, completed_at = ?, archived_at = null, confirm_requested_at = null, confirm_requested_by = null where id = ?', iso(), id);
      } else {
        const done = visibleColumns(card.board_id).find((c) => c.is_done === 1);
        if (done && done.id !== card.column_id) placeCard(id, done, null);
        run('update cards set completed_at = ?, archived_at = null, confirm_requested_at = null, confirm_requested_by = null where id = ?', iso(), id);
      }
      const completionId = recordCompletion(id, ctx.by, ctx.source, card.due_at, snapshot);
      touchCard(id);
      return { card: getCard(id), completionId, nextDueAt, nextCardId };
    });
  }

  /** Die Karte einer Erledigung (für die Rechte-Prüfung); null, wenn es sie nicht gibt */
  const cardIdOfCompletion = (id: string): string | null => (one('select card_id from completions where id = ?', id)?.card_id as string | undefined) ?? null;

  /**
   * Hat jemand mit der bei der Wiederholung angelegten Karte gearbeitet? Dann würde „Rückgängig“ sie samt Kommentaren,
   * Anhängen und Checkliste endgültig löschen. Die Version zählt nicht (der Geplant-Abgleich erhöht sie von selbst);
   * geprüft werden die Daten: so wie `spawnNextCard` sie anlegt, sind Kommentare, Anhänge, Stupse und Erledigungen leer,
   * Checkliste und Links entsprechen der Vorgängerin (oder fehlen), Titel, Beschreibung und Priorität stimmen überein.
   */
  function spawnedHasOwnWork(spawnedId: string, src: Row): boolean {
    const n = (sql: string, ...args: unknown[]): number => Number(one(sql, ...args)?.n ?? 0);
    const carry = resolveCarry(src.carry_over);
    if (n('select count(*) as n from comments where card_id = ?', spawnedId) > 0) return true;
    if (n('select count(*) as n from attachments where card_id = ?', spawnedId) !== (carry.includes('attachments') ? n('select count(*) as n from attachments where card_id = ?', src.id) : 0)) return true;
    if (n('select count(*) as n from nudges where card_id = ?', spawnedId) > 0) return true;
    if (n('select count(*) as n from checklist_items where card_id = ? and done = 1', spawnedId) > 0) return true;
    const expected = (table: 'checklist_items' | 'links', key: 'checklist' | 'links'): number =>
      carry.includes(key) ? n(`select count(*) as n from ${table} where card_id = ?`, src.id) : 0;
    if (n('select count(*) as n from checklist_items where card_id = ?', spawnedId) !== expected('checklist_items', 'checklist')) return true;
    if (n('select count(*) as n from links where card_id = ?', spawnedId) !== expected('links', 'links')) return true;
    const sp = one('select title, description, priority from cards where id = ?', spawnedId);
    if (!sp) return false;
    const description = carry.includes('description') ? (src.description ?? null) : null;
    return sp.title !== src.title || (sp.description ?? null) !== description || sp.priority !== src.priority;
  }

  function undoCompletion(completionId: string): CardDetail {
    const c = one('select * from completions where id = ?', completionId);
    if (!c) throw new NotFoundError(t('Erledigung nicht gefunden'));
    const latest = one(
      'select id from completions where card_id = ? order by completed_at desc, rowid desc limit 1',
      c.card_id,
    );
    if (latest?.id !== c.id) throw new ConflictError(t('Nur die letzte Erledigung lässt sich rückgängig machen'));
    if (!c.snapshot) throw new ConflictError(t('Diese Erledigung lässt sich nicht rückgängig machen'));
    const card = visibleCardRow(c.card_id);
    const snap = JSON.parse(c.snapshot) as Snapshot;
    return tx(() => {
      // Die bei der Wiederholung angelegte Karte verschwindet wieder, solange niemand mit ihr gearbeitet hat
      if (snap.spawnedId) {
        if (one('select 1 as x from completions where card_id = ?', snap.spawnedId)) {
          throw new ConflictError(t('Die nächste Karte wurde schon erledigt, deshalb lässt sich das nicht mehr rückgängig machen'));
        }
        if (spawnedHasOwnWork(snap.spawnedId, card)) {
          throw new ConflictError(t('Die nächste Karte wurde schon bearbeitet, deshalb lässt sich das nicht mehr rückgängig machen'));
        }
        run('delete from cards where id = ?', snap.spawnedId);
      }
      if (snap.recurrence !== undefined) run('update cards set recurrence = ? where id = ?', snap.recurrence, card.id);
      const col = one('select * from columns where id = ? and deleted_at is null', snap.columnId);
      if (col) {
        run('update cards set column_id = ?, position = ? where id = ?', snap.columnId, snap.position, card.id);
      } else {
        placeCard(card.id, firstOpenColumn(card.board_id), null);
      }
      run(
        'update cards set due_at = ?, completed_at = ?, archived_at = ? where id = ?',
        snap.dueAt,
        snap.completedAt,
        snap.archivedAt,
        card.id,
      );
      run('update checklist_items set done = 0 where card_id = ?', card.id);
      for (const itemId of snap.checklistDone) run('update checklist_items set done = 1 where id = ?', itemId);
      run('delete from completions where id = ?', completionId);
      touchCard(card.id);
      return getCard(card.id);
    });
  }

  function archiveDone(): number {
    const rows = all(
      `select c.id, c.completed_at, b.archive_after_days as days
       from cards c join boards b on b.id = c.board_id
       where c.deleted_at is null and c.archived_at is null and c.completed_at is not null
         and b.deleted_at is null and b.archive_after_days > 0`,
    );
    let n = 0;
    for (const r of rows) {
      if (Date.parse(r.completed_at) + r.days * 86_400_000 <= now().getTime()) {
        run('update cards set archived_at = ?, updated_at = ?, version = version + 1 where id = ?', iso(), iso(), r.id);
        n++;
      }
    }
    return n;
  }

  function restoreArchived(cardId: string, columnId: string, by: string | null = null): CardDetail {
    const card = visibleCardRow(cardId);
    if (card.archived_at === null) throw new ConflictError(t('Die Karte ist nicht archiviert'));
    const col = visibleColumn(columnId);
    if (col.board_id !== card.board_id) throw new ValidationError(t('Die Spalte gehört nicht zu diesem Board'));
    return tx(() => {
      placeCard(cardId, col, null);
      run('update cards set archived_at = null, completed_at = null, confirm_requested_at = null, confirm_requested_by = null where id = ?', cardId);
      logEvent(cardId, 'reopened', by, columnName(card.column_id), col.name);
      touchCard(cardId);
      return getCard(cardId);
    });
  }

  return {
    listCompletions,
    snapshotOf,
    spawnNextCard,
    recordCompletion,
    firstOpenColumn,
    completeCard,
    undoCompletion,
    cardIdOfCompletion,
    archiveDone,
    restoreArchived,
  };
}
