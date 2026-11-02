import { randomUUID } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import { NotFoundError, ValidationError } from '../errors.js';
import { type Recurrence } from '../recurrence.js';
import { type OpenNudge, type Card, type ScheduleCard, type ChecklistItem, type CardLink, type ActivityEntry, type CardDetail, type CardInput, type CardPatch, type Row } from './types.js';
import { cleanText, parseDue, parsePriority, parseRemind, parseCost, parseCarryOver, resolveCarry, parseBool, parseRecurrence } from './validate.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';

/** Karten */
export function createCards(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { iso, one, all, run, tx } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { closeOpenNudges, nudgeActivity, watcherActivity, completeCard, firstOpenColumn, inboxColumn, isFutureDue, lastPos, listAttachments, listCompletions, neighbours, plannedColumn, recordCompletion, snapshotOf, visibleBoard, visibleColumn } = lazy(s, ['closeOpenNudges', 'nudgeActivity', 'watcherActivity', 'completeCard', 'firstOpenColumn', 'inboxColumn', 'isFutureDue', 'lastPos', 'listAttachments', 'listCompletions', 'neighbours', 'plannedColumn', 'recordCompletion', 'snapshotOf', 'visibleBoard', 'visibleColumn'] as const);

  function loadCards(where: string, ...params: unknown[]): Card[] {
    const rows = all(`select * from cards where ${where} order by position, id`, ...params);
    if (rows.length === 0) return [];
    const sub = `select id from cards where ${where}`;

    const group = <T>(list: Row[], key: string, value: (r: Row) => T): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of list) {
        const arr = m.get(r[key]) ?? [];
        arr.push(value(r));
        m.set(r[key], arr);
      }
      return m;
    };
    const assignees = group(
      all(`select card_id, user_id from card_assignees where card_id in (${sub}) order by rowid`, ...params),
      'card_id',
      (r) => r.user_id as string,
    );
    const categories = group(
      all(
        `select cc.card_id, cc.category_id from card_categories cc
         join categories cat on cat.id = cc.category_id and cat.deleted_at is null
         where cc.card_id in (${sub}) order by cat.position, cat.id`,
        ...params,
      ),
      'card_id',
      (r) => r.category_id as string,
    );
    const checklist = new Map<string, { done: number; total: number }>();
    for (const r of all(
      `select card_id, count(*) as total, coalesce(sum(done), 0) as done from checklist_items
       where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      checklist.set(r.card_id, { done: r.done, total: r.total });
    }
    const links = new Map<string, number>();
    for (const r of all(
      `select card_id, count(*) as n from links where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      links.set(r.card_id, r.n);
    }
    const attachmentCounts = new Map<string, number>();
    for (const r of all(
      `select card_id, count(*) as n from attachments where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      attachmentCounts.set(r.card_id, r.n);
    }
    const nudges = group(
      all(
        `select card_id, id, from_user, to_user, delivered_round from nudges where reply is null and card_id in (${sub}) order by created_at, rowid`,
        ...params,
      ),
      'card_id',
      (r): OpenNudge => ({ id: r.id, fromId: r.from_user, toId: r.to_user, delivered: r.delivered_round >= 0 }),
    );
    const commentCounts = new Map<string, number>();
    for (const r of all(
      `select card_id, count(*) as n from comments where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      commentCounts.set(r.card_id, r.n);
    }

    return rows.map((r) => ({
      id: r.id,
      boardId: r.board_id,
      columnId: r.column_id,
      position: r.position,
      title: r.title,
      description: r.description,
      priority: r.priority,
      dueAt: r.due_at,
      recurrence: r.recurrence ? (JSON.parse(r.recurrence) as Recurrence) : null,
      completedAt: r.completed_at,
      archivedAt: r.archived_at,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      version: r.version,
      remindBeforeMin: r.remind_before_min,
      overdueNag: r.overdue_nag === 1,
      costCents: r.cost_cents,
      carryOver: resolveCarry(r.carry_over),
      openNudges: nudges.get(r.id) ?? [],
      repeatedFrom: r.repeated_from ?? null,
      watcherId: r.watcher_id ?? null,
      assigneeIds: assignees.get(r.id) ?? [],
      categoryIds: categories.get(r.id) ?? [],
      checklist: checklist.get(r.id) ?? { done: 0, total: 0 },
      linkCount: links.get(r.id) ?? 0,
      commentCount: commentCounts.get(r.id) ?? 0,
      attachmentCount: attachmentCounts.get(r.id) ?? 0,
    }));
  }

  const columnName = (id: string): string | null => one('select name from columns where id = ?', id)?.name ?? null;

  function visibleCardRow(id: string): Row {
    const r = one('select * from cards where id = ? and deleted_at is null', id);
    if (!r) throw new NotFoundError('Karte nicht gefunden');
    return r;
  }

  const toItem = (r: Row): ChecklistItem => ({
    id: r.id,
    cardId: r.card_id,
    text: r.text,
    done: r.done === 1,
    position: r.position,
  });

  const toLink = (r: Row): CardLink => ({
    id: r.id,
    cardId: r.card_id,
    url: r.url,
    title: r.title,
    kind: r.kind,
    position: r.position,
  });

  function getCard(id: string): CardDetail {
    visibleCardRow(id);
    const [card] = loadCards('id = ?', id);
    return {
      ...card!,
      checklistItems: all('select * from checklist_items where card_id = ? order by position, id', id).map(toItem),
      links: all('select * from links where card_id = ? order by position, id', id).map(toLink),
      history: listCompletions(id, 10),
      activity: listActivity(id, card!),
      attachments: listAttachments(id),
    };
  }

  function logEvent(
    cardId: string,
    kind: 'moved' | 'reopened' | 'due',
    by: string | null,
    from: string | null,
    to: string | null,
  ): void {
    run(
      'insert into card_events (id, card_id, kind, by_user, at, from_v, to_v) values (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      cardId,
      kind,
      by,
      iso(),
      from,
      to,
    );
  }

  function listActivity(cardId: string, card: Card, limit = 50): ActivityEntry[] {
    const created = card.createdBy ? one('select display_name from users where id = ?', card.createdBy) : undefined;
    const watcher = card.watcherId ? one('select name from watchers where id = ?', card.watcherId) : undefined;
    const entries: ActivityEntry[] = [
      {
        id: `created-${cardId}`,
        kind: card.repeatedFrom ? 'repeated' : 'created',
        at: card.createdAt,
        byName: watcher ? `Wächter „${watcher.name}“` : (created?.display_name ?? null),
      },
    ];
    for (const c of listCompletions(cardId, limit)) {
      entries.push({ id: c.id, kind: 'completed', at: c.completedAt, byName: c.completedByName, source: c.source });
    }
    for (const r of all(
      `select e.*, u.display_name as by_name from card_events e left join users u on u.id = e.by_user
       where e.card_id = ? order by e.at desc, e.rowid desc limit ?`,
      cardId,
      limit,
    )) {
      entries.push({ id: r.id, kind: r.kind, at: r.at, byName: r.by_name, from: r.from_v, to: r.to_v });
    }
    entries.push(...nudgeActivity(cardId));
    entries.push(...watcherActivity(cardId));
    // Neueste zuerst; „angelegt" steht bei gleicher Zeit ganz unten
    const isStart = (e: ActivityEntry) => e.kind === 'created' || e.kind === 'repeated';
    return entries
      .sort((a, b) => (a.at === b.at ? Number(isStart(a)) - Number(isStart(b)) : a.at < b.at ? 1 : -1))
      .slice(0, limit);
  }

  function checkAssignees(ids: unknown): string[] {
    if (!Array.isArray(ids)) throw new ValidationError('Zuständige müssen eine Liste sein');
    const unique = [...new Set(ids as string[])];
    for (const uid of unique) {
      if (!one('select 1 as ok from users where id = ? and is_person = 1', uid)) {
        throw new ValidationError('Zugewiesen werden können nur Personen aus Stups');
      }
    }
    return unique;
  }

  function checkCategories(boardId: string, ids: unknown): string[] {
    if (!Array.isArray(ids)) throw new ValidationError('Kategorien müssen eine Liste sein');
    const unique = [...new Set(ids as string[])];
    for (const cid of unique) {
      if (!one('select 1 as ok from categories where id = ? and board_id = ? and deleted_at is null', cid, boardId)) {
        throw new ValidationError('Die Kategorie gehört nicht zu diesem Board');
      }
    }
    return unique;
  }

  function createCard(boardId: string, input: CardInput, createdBy: string | null): CardDetail {
    visibleBoard(boardId);
    const col = visibleColumn(input.columnId);
    if (col.board_id !== boardId) throw new ValidationError('Die Spalte gehört nicht zu diesem Board');
    const title = cleanText(input.title, 'Der Titel', 200);
    const priority = parsePriority(input.priority);
    const dueAt = parseDue(input.dueAt);
    const recurrence = parseRecurrence(input.recurrence);
    if (recurrence && !dueAt) throw new ValidationError('Eine Wiederholung braucht eine Fälligkeit');
    const remind = parseRemind(input.remindBeforeMin);
    const cost = parseCost(input.costCents);
    const carry = parseCarryOver(input.carryOver);
    const nag = parseBool(input.overdueNag, 'Nachhaken');
    if (remind !== null && !dueAt) throw new ValidationError('Eine Vorab-Erinnerung braucht eine Fälligkeit');
    if (col.is_planned === 1 && !isFutureDue(dueAt)) {
      throw new ValidationError('In „Geplant" kommen nur Karten mit einem Termin nach heute');
    }

    return tx(() => {
      const assignees = checkAssignees(input.assigneeIds ?? []);
      const categories = checkCategories(boardId, input.categoryIds ?? []);
      const id = randomUUID();
      const t = iso();
      run(
        `insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence,
                            remind_before_min, overdue_nag, cost_cents, carry_over, created_by, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        boardId,
        col.id,
        generateKeyBetween(lastPos('cards', 'column_id = ?', col.id), null),
        title,
        input.description ?? null,
        priority,
        dueAt,
        recurrence ? JSON.stringify(recurrence) : null,
        remind,
        nag ? 1 : 0,
        cost,
        carry ? JSON.stringify(carry) : null,
        createdBy,
        t,
        t,
      );
      for (const u of assignees) run('insert into card_assignees (card_id, user_id) values (?, ?)', id, u);
      for (const c of categories) run('insert into card_categories (card_id, category_id) values (?, ?)', id, c);
      syncPlannedCard(id);
      return getCard(id);
    });
  }

  /** Karte in die Spalte für Termine nach heute oder zurück in die erste offene Spalte, je nach Termin. */
  function syncPlannedCard(id: string): void {
    const card = one('select * from cards where id = ? and deleted_at is null', id);
    if (!card || card.completed_at !== null || card.archived_at !== null) return;
    const planned = plannedColumn(card.board_id);
    const inbox = inboxColumn(card.board_id);
    if (!planned || !inbox) return;
    const future = isFutureDue(card.due_at);
    if (card.column_id === inbox.id && future) {
      placeCard(id, planned, undefined);
      touchCard(id);
    } else if (card.column_id === planned.id && !future) {
      placeCard(id, inbox, null);
      touchCard(id);
    }
  }

  function updateCard(id: string, patch: CardPatch, by: string | null = null): CardDetail {
    const card = visibleCardRow(id);
    return tx(() => {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.title !== undefined) {
        sets.push('title = ?');
        params.push(cleanText(patch.title, 'Der Titel', 200));
      }
      if (patch.description !== undefined) {
        sets.push('description = ?');
        params.push(patch.description);
      }
      if (patch.priority !== undefined) {
        sets.push('priority = ?');
        params.push(parsePriority(patch.priority));
      }
      const dueAt = patch.dueAt !== undefined ? parseDue(patch.dueAt) : (card.due_at as string | null);
      const recurrence =
        patch.recurrence !== undefined
          ? parseRecurrence(patch.recurrence)
          : card.recurrence
            ? (JSON.parse(card.recurrence) as Recurrence)
            : null;
      if (recurrence && !dueAt) throw new ValidationError('Eine Wiederholung braucht eine Fälligkeit');
      if (patch.dueAt !== undefined) {
        sets.push('due_at = ?');
        params.push(dueAt);
        if (dueAt !== card.due_at) logEvent(id, 'due', by, card.due_at, dueAt);
        // Ohne Fälligkeit gibt es nichts, wovor erinnert werden könnte.
        if (dueAt === null && patch.remindBeforeMin === undefined) {
          sets.push('remind_before_min = ?');
          params.push(null);
        }
      }
      if (patch.recurrence !== undefined) {
        sets.push('recurrence = ?');
        params.push(recurrence ? JSON.stringify(recurrence) : null);
      }
      if (patch.remindBeforeMin !== undefined) {
        const remind = parseRemind(patch.remindBeforeMin);
        if (remind !== null && !dueAt) throw new ValidationError('Eine Vorab-Erinnerung braucht eine Fälligkeit');
        sets.push('remind_before_min = ?');
        params.push(remind);
      }
      if (patch.overdueNag !== undefined) {
        sets.push('overdue_nag = ?');
        params.push(parseBool(patch.overdueNag, 'Nachhaken') ? 1 : 0);
      }
      if (patch.costCents !== undefined) {
        sets.push('cost_cents = ?');
        params.push(parseCost(patch.costCents));
      }
      if (patch.carryOver !== undefined) {
        const carry = parseCarryOver(patch.carryOver);
        sets.push('carry_over = ?');
        params.push(carry ? JSON.stringify(carry) : null);
      }
      if (patch.assigneeIds !== undefined) {
        const ids = checkAssignees(patch.assigneeIds);
        run('delete from card_assignees where card_id = ?', id);
        for (const u of ids) run('insert into card_assignees (card_id, user_id) values (?, ?)', id, u);
      }
      if (patch.categoryIds !== undefined) {
        const ids = checkCategories(card.board_id, patch.categoryIds);
        run('delete from card_categories where card_id = ?', id);
        for (const c of ids) run('insert into card_categories (card_id, category_id) values (?, ?)', id, c);
      }
      run(
        `update cards set ${[...sets, 'updated_at = ?', 'version = version + 1'].join(', ')} where id = ?`,
        ...params,
        iso(),
        id,
      );
      syncPlannedCard(id);
      return getCard(id);
    });
  }

  /**
   * Kopie einer Karte: Felder, Zuweisung, Kategorien, Checkliste (zurückgesetzt) und Links.
   * Nicht kopiert werden Kommentare, Anhänge und der Verlauf. Die Kopie ist immer offen.
   */
  function duplicateCard(id: string, by: string | null): CardDetail {
    const src = visibleCardRow(id);
    return tx(() => {
      const newId = randomUUID();
      const t = iso();
      const sameColumn = src.completed_at === null;
      const col = sameColumn ? visibleColumn(src.column_id) : firstOpenColumn(src.board_id);
      const next = sameColumn
        ? (one(
            `select position from cards where column_id = ? and deleted_at is null and archived_at is null
             and position > ? order by position limit 1`,
            col.id,
            src.position,
          )?.position as string | undefined)
        : undefined;
      const position = sameColumn
        ? generateKeyBetween(src.position, next ?? null)
        : generateKeyBetween(lastPos('cards', 'column_id = ?', col.id), null);
      run(
        `insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence,
                            remind_before_min, overdue_nag, cost_cents, carry_over, created_by, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId,
        src.board_id,
        col.id,
        position,
        `${src.title} (Kopie)`.slice(0, 200),
        src.description,
        src.priority,
        src.due_at,
        src.recurrence,
        src.remind_before_min,
        src.overdue_nag,
        src.cost_cents,
        src.carry_over,
        by,
        t,
        t,
      );
      run('insert into card_assignees (card_id, user_id) select ?, user_id from card_assignees where card_id = ?', newId, id);
      run(
        `insert into card_categories (card_id, category_id)
         select ?, cc.category_id from card_categories cc
         join categories c on c.id = cc.category_id and c.deleted_at is null where cc.card_id = ?`,
        newId,
        id,
      );
      for (const item of all('select text, position from checklist_items where card_id = ? order by position, id', id)) {
        run(
          'insert into checklist_items (id, card_id, text, done, position) values (?, ?, ?, 0, ?)',
          randomUUID(),
          newId,
          item.text,
          item.position,
        );
      }
      for (const l of all('select url, title, kind, position from links where card_id = ? order by position, id', id)) {
        run(
          'insert into links (id, card_id, url, title, kind, position) values (?, ?, ?, ?, ?, ?)',
          randomUUID(),
          newId,
          l.url,
          l.title,
          l.kind,
          l.position,
        );
      }
      syncPlannedCard(newId);
      return getCard(newId);
    });
  }

  function touchCard(id: string): void {
    run('update cards set updated_at = ?, version = version + 1 where id = ?', iso(), id);
  }

  /** Setzt Spalte und Position. Erhöht die Version nicht, das macht der Aufrufer über touchCard. */
  function placeCard(id: string, col: Row, afterId: string | null | undefined): void {
    const others = all(
      'select id, position from cards where column_id = ? and deleted_at is null and archived_at is null and id <> ? order by position, id',
      col.id,
      id,
    ) as { id: string; position: string }[];
    const { prev, next } = neighbours(others, afterId);
    run('update cards set column_id = ?, position = ? where id = ?', col.id, generateKeyBetween(prev, next), id);
  }

  function moveCard(
    id: string,
    to: { columnId: string; afterId?: string | null },
    by: string | null = null,
  ): CardDetail {
    const card = visibleCardRow(id);
    const col = visibleColumn(to.columnId);
    if (col.board_id !== card.board_id) throw new ValidationError('Die Spalte gehört nicht zu diesem Board');
    return tx(() => {
      // „Geplant" nimmt nur Karten mit Termin nach heute, und solche Karten gehören nicht nach „Offen":
      // Wer dort ablegt, was nicht passt, landet in der passenden Nachbarspalte.
      const planned = plannedColumn(card.board_id);
      const inbox = inboxColumn(card.board_id);
      let target = col;
      if (planned && inbox && card.completed_at === null) {
        if (col.id === planned.id && !isFutureDue(card.due_at)) target = inbox;
        else if (col.id === inbox.id && isFutureDue(card.due_at)) target = planned;
      }
      const afterId = target.id === col.id ? to.afterId : target.id === planned?.id ? undefined : null;

      const entersDone = target.is_done === 1 && card.completed_at === null;
      // Eine wiederkehrende Karte bleibt nie in der Erledigt-Spalte: Ablegen dort heißt "erledigen".
      if (entersDone && card.recurrence) return completeCard(id, { by, source: 'app' }).card;

      const snapshot = entersDone ? snapshotOf(card) : null;
      const fromName = columnName(card.column_id);
      placeCard(id, target, afterId);
      if (snapshot) {
        run('update cards set completed_at = ?, archived_at = null where id = ?', iso(), id);
        recordCompletion(id, by, 'app', card.due_at, snapshot);
        closeOpenNudges(id, by, true);
      } else if (target.is_done === 0 && card.completed_at !== null) {
        run('update cards set completed_at = null, archived_at = null where id = ?', id);
        logEvent(id, 'reopened', by, fromName, target.name);
      } else if (target.id !== card.column_id) {
        logEvent(id, 'moved', by, fromName, target.name);
      }
      touchCard(id);
      return getCard(id);
    });
  }

  function deleteCard(id: string): void {
    visibleCardRow(id);
    run('update cards set deleted_at = ?, updated_at = ?, version = version + 1 where id = ?', iso(), iso(), id);
    closeOpenNudges(id, null, false);
  }

  function setArchived(id: string, archived: boolean): void {
    visibleCardRow(id);
    run(
      'update cards set archived_at = ?, updated_at = ?, version = version + 1 where id = ?',
      archived ? iso() : null,
      iso(),
      id,
    );
  }

  /**
   * Alle Karten mit Termin über alle Boards (für Agenda und Kalender), nach Termin sortiert.
   * `from` ist eingeschlossen, `to` ausgeschlossen; ohne `from` kommt auch alles Überfällige.
   */
  function listSchedule(opts: { boardIds?: string[]; from?: string; to?: string; includeDone?: boolean }): ScheduleCard[] {
    const where = ['due_at is not null', 'deleted_at is null', 'archived_at is null', 'board_id in (select id from boards where deleted_at is null)'];
    const params: unknown[] = [];
    if (!opts.includeDone) where.push('completed_at is null');
    if (opts.from) {
      where.push('due_at >= ?');
      params.push(new Date(opts.from).toISOString());
    }
    if (opts.to) {
      where.push('due_at < ?');
      params.push(new Date(opts.to).toISOString());
    }
    if (opts.boardIds && opts.boardIds.length > 0) {
      where.push(`board_id in (${opts.boardIds.map(() => '?').join(', ')})`);
      params.push(...opts.boardIds);
    }
    const boards = new Map(all('select id, name, color from boards where deleted_at is null').map((b) => [b.id as string, b]));
    return loadCards(where.join(' and '), ...params)
      .map((c) => ({ ...c, boardName: boards.get(c.boardId)?.name ?? '', boardColor: (boards.get(c.boardId)?.color as string | null) ?? null }))
      .sort((a, b) => (a.dueAt === b.dueAt ? (a.id < b.id ? -1 : 1) : a.dueAt! < b.dueAt! ? -1 : 1));
  }

  function listArchived(boardId: string): Card[] {
    visibleBoard(boardId);
    return loadCards('board_id = ? and deleted_at is null and archived_at is not null', boardId).sort((a, b) =>
      (b.archivedAt ?? '') < (a.archivedAt ?? '') ? -1 : 1,
    );
  }

  return {
    loadCards,
    columnName,
    visibleCardRow,
    toItem,
    toLink,
    getCard,
    logEvent,
    listActivity,
    checkAssignees,
    checkCategories,
    createCard,
    syncPlannedCard,
    updateCard,
    duplicateCard,
    touchCard,
    placeCard,
    moveCard,
    deleteCard,
    setArchived,
    listSchedule,
    listArchived,
  };
}
