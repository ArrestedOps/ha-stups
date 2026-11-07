import { generateNKeysBetween } from 'fractional-indexing';
import { ConflictError, ValidationError } from '../errors.js';
import { t } from '../i18n/index.js';
import type { AssignRule } from '../watcher-types.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { Board, BoardSummary, BoardVisibility, Row } from './types.js';
import { cleanText } from './validate.js';
import type { Viewer } from './visibility.js';

/** Was mit einem Wächter geschieht, dessen Board gelöscht wird: pausieren (Standard), in ein anderes Board umziehen oder löschen */
export type WatcherChoice = { action: 'pause' } | { action: 'move'; boardId: string } | { action: 'delete' };

/** Was das Löschen eines Boards betrifft (für den Bestätigungsdialog); `lock` sperrt es: das letzte sichtbare Board ist nicht löschbar */
export interface BoardDeletePreview {
  cards: { total: number; open: number };
  /** Offene Karten mit Wiederholung: Name und Regel */
  recurring: { id: string; title: string; recurrence: unknown }[];
  /** Wächter, die Karten in dieses Board anlegen */
  watchers: { id: string; name: string; active: boolean }[];
  /** Persönliche Erinnerungen (Nachhaken) an Karten des Boards */
  reminders: number;
  lock: null | 'last';
}

/** Wächter, die eine Aktion am Board angefasst hat (die Routen gleichen danach die Abos der Wächter ab) */
export interface BoardWatcherEffects {
  paused: string[];
  moved: string[];
  removed: string[];
}

/**
 * Lebenslauf eines Boards über Anlegen und Ändern hinaus: Löschen mit der Wahl je Wächter, Archivieren und Wiederherstellen, Duplizieren,
 * Reihenfolge. Wächter, die auf ein Board zeigen, das es nicht gibt oder das archiviert ist, pausieren (Status `target_missing`, aus) und
 * laufen von selbst wieder, sobald das Board zurück ist.
 */
export function createBoardLifecycle(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { iso, one, all, run, tx } = c;
  const { visibleBoard, anyBoard, visibleBoardIds, canSeeBoard, watchersOfBoard, createBoard, addCategory, createCard, addChecklistItem, getBoardView, boardMemberIds, inboxColumn, visibleColumns, peopleSeeing, boardAccessSql, toBoard } =
    lazy(s, [
      'visibleBoard',
      'anyBoard',
      'visibleBoardIds',
      'canSeeBoard',
      'watchersOfBoard',
      'createBoard',
      'addCategory',
      'createCard',
      'addChecklistItem',
      'getBoardView',
      'boardMemberIds',
      'inboxColumn',
      'visibleColumns',
      'peopleSeeing',
      'boardAccessSql',
      'toBoard',
    ] as const);

  // ----- Wächter eines Boards -----

  /** Pausiert die laufenden Wächter eines Boards (Status „Board fehlt", aus). Ein von Hand pausierter Wächter bleibt, wie er ist. */
  function pauseWatchersOfBoard(boardId: string): string[] {
    const ids: string[] = [];
    for (const w of watchersOfBoard(boardId)) {
      const row = one('select active from watchers where id = ?', w.id);
      if (!row || row.active !== 1) continue;
      run("update watchers set active = 0, status = 'target_missing', updated_at = ? where id = ?", iso(), w.id);
      ids.push(w.id);
    }
    return ids;
  }

  /**
   * Lässt die Wächter wieder laufen, die dieses Board pausiert hat (Board wiederhergestellt oder aus dem Archiv geholt): Status weg, an.
   * Nur wenn das Board da ist und die Spalte der Karte noch in ihm liegt; sonst bleibt der Wächter pausiert.
   */
  function resumeWatchersOfBoard(boardId: string): string[] {
    const board = one('select deleted_at, archived_at from boards where id = ?', boardId);
    if (!board || board.deleted_at !== null || board.archived_at !== null) return [];
    const ids: string[] = [];
    for (const r of all("select id, card_json from watchers where status = 'target_missing'")) {
      let card: { boardId?: string; columnId?: string };
      try {
        card = JSON.parse(r.card_json ?? '{}');
      } catch {
        continue;
      }
      if (card.boardId !== boardId) continue;
      if (!card.columnId || !one('select 1 as ok from columns where id = ? and board_id = ? and deleted_at is null', card.columnId, boardId)) continue;
      run("update watchers set active = 1, status = 'ok', updated_at = ? where id = ?", iso(), r.id);
      ids.push(r.id as string);
    }
    return ids;
  }

  /** Warum pausiert der Wächter? `archived`: sein Board ist archiviert; `deleted`: es ist gelöscht (oder weg); sonst null (zum Beispiel fehlt nur die Spalte) */
  function targetGone(boardId: string): 'archived' | 'deleted' | null {
    const b = one('select deleted_at, archived_at from boards where id = ?', boardId);
    if (!b || b.deleted_at !== null) return 'deleted';
    if (b.archived_at !== null) return 'archived';
    return null;
  }

  // ----- Löschen -----

  /** Ist dieses Board für die Person das letzte, das sie sieht (nicht archiviert, nicht gelöscht)? Das letzte lässt sich nicht löschen oder archivieren. */
  const isLastBoard = (id: string, viewer: Viewer): boolean => {
    const ids = visibleBoardIds(viewer);
    return ids.length <= 1 && (ids.length === 0 || ids[0] === id);
  };

  function deletePreview(id: string, viewer: Viewer): BoardDeletePreview {
    visibleBoard(id);
    const n = one(
      `select count(*) as total, coalesce(sum(case when completed_at is null and archived_at is null then 1 else 0 end), 0) as open
         from cards where board_id = ? and deleted_at is null`,
      id,
    )!;
    const recurring = all(
      `select id, title, recurrence from cards where board_id = ? and deleted_at is null and archived_at is null and completed_at is null and recurrence is not null
        order by created_at, rowid`,
      id,
    ).map((r) => ({ id: r.id as string, title: r.title as string, recurrence: JSON.parse(r.recurrence) as unknown }));
    const reminders = one(
      `select count(*) as n from card_reminders r join cards c on c.id = r.card_id
        where c.board_id = ? and c.deleted_at is null and r.user_id is not null and r.done = 0`,
      id,
    )!.n;
    return {
      cards: { total: Number(n.total), open: Number(n.open) },
      recurring,
      watchers: watchersOfBoard(id).map((w) => ({ id: w.id, name: w.name, active: one('select active from watchers where id = ?', w.id)?.active === 1 })),
      reminders: Number(reminders),
      lock: isLastBoard(id, viewer) ? 'last' : null,
    };
  }

  function parseChoice(raw: unknown): WatcherChoice {
    const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    if (o.action === 'pause' || o.action === undefined) return { action: 'pause' };
    if (o.action === 'delete') return { action: 'delete' };
    if (o.action === 'move') {
      if (typeof o.boardId !== 'string' || o.boardId === '') throw new ValidationError(t('Zum Umziehen gehört ein Ziel-Board'));
      return { action: 'move', boardId: o.boardId };
    }
    throw new ValidationError(t('Unbekannte Wahl für einen Wächter'));
  }

  /** Zieht einen Wächter in ein anderes Board um: Karten-Vorlage auf das Ziel, Zuständige nur aus den Personen dort (bleibt niemand: Status „braucht neue Zuständige") */
  function moveWatcher(watcherId: string, from: string, targetId: string): void {
    const row = one('select card_json, assign_json, status from watchers where id = ?', watcherId)!;
    const card = JSON.parse(row.card_json) as { boardId: string; columnId: string; categoryIds: string[] } & Record<string, unknown>;
    const rule = JSON.parse(row.assign_json) as AssignRule;
    const targetColumn = inboxColumn(targetId) ?? visibleColumns(targetId)[0];
    if (!targetColumn) throw new ValidationError(t('Das Board hat keine Spalte'));
    // Kategorien des alten Boards: nur die, die das Ziel unter demselben Namen kennt
    const oldNames = new Map(all('select id, name from categories where board_id = ?', from).map((r) => [r.id as string, String(r.name).toLowerCase()]));
    const newByName = new Map(all('select id, name from categories where board_id = ? and deleted_at is null', targetId).map((r) => [String(r.name).toLowerCase(), r.id as string]));
    const categoryIds = (card.categoryIds ?? []).flatMap((id) => {
      const mapped = newByName.get(oldNames.get(id) ?? '');
      return mapped ? [mapped] : [];
    });
    const seeing = new Set(peopleSeeing(...accessOf(targetId)));
    let missing = false;
    let next = rule;
    if (rule.mode !== 'none') {
      const circle = rule.personIds.filter((id) => seeing.has(id));
      const dropFallback = !!rule.fallbackPersonId && !seeing.has(rule.fallbackPersonId);
      next = {
        ...rule,
        personIds: circle,
        ...(dropFallback ? { fallbackPersonId: null, fallback: rule.fallback === 'fixed' ? 'none' : rule.fallback, waitFallback: rule.waitFallback === 'fixed' ? 'none' : rule.waitFallback } : {}),
      };
      // Ein Kreis, der leer wird, hieße „alle": dahin fällt der Wächter nie zurück, er legt keine Karten an, bis neue Zuständige gewählt sind
      missing = rule.personIds.length > 0 && circle.length === 0;
    }
    const wasPaused = row.status === 'target_missing';
    run(
      `update watchers set card_json = ?, assign_json = ?, assignees_missing = ?, status = case when status = 'target_missing' then 'ok' else status end,
                           active = case when ? = 1 then 1 else active end, updated_at = ? where id = ?`,
      JSON.stringify({ ...card, boardId: targetId, columnId: targetColumn.id, categoryIds }),
      JSON.stringify(next),
      missing ? 1 : 0,
      wasPaused ? 1 : 0,
      iso(),
      watcherId,
    );
  }

  const accessOf = (boardId: string): [BoardVisibility, string | null, string[]] => {
    const r = one('select visibility, owner_id from boards where id = ?', boardId)!;
    return [r.visibility as BoardVisibility, (r.owner_id as string | null) ?? null, boardMemberIds(boardId)];
  };

  /**
   * Löscht ein Board (Papierkorb, 30 Tage) und tut mit jedem Wächter, was die Person gewählt hat (`choices` je Wächter; ohne Angabe
   * pausiert er). Alles in einer Transaktion; das letzte sichtbare Board lässt sich nicht löschen.
   */
  function deleteBoardWith(id: string, choices: unknown, viewer: Viewer): BoardWatcherEffects {
    visibleBoard(id);
    if (isLastBoard(id, viewer)) throw new ConflictError(t('Das letzte Board kann nicht gelöscht werden.'));
    const raw = (typeof choices === 'object' && choices !== null && !Array.isArray(choices) ? choices : {}) as Record<string, unknown>;
    const watchers = watchersOfBoard(id);
    const known = new Set(watchers.map((w) => w.id));
    for (const key of Object.keys(raw)) if (!known.has(key)) throw new ValidationError(t('Der Wächter gehört nicht zu diesem Board'));
    const plan = watchers.map((w) => ({ id: w.id, choice: parseChoice(raw[w.id]) }));
    for (const p of plan) {
      if (p.choice.action !== 'move') continue;
      const target = one('select visibility from boards where id = ? and deleted_at is null and archived_at is null', p.choice.boardId);
      if (!target || p.choice.boardId === id || target.visibility === 'private' || !canSeeBoard(viewer, p.choice.boardId)) {
        throw new ValidationError(t('Das Ziel-Board ist nicht wählbar'));
      }
    }
    return tx(() => {
      const out: BoardWatcherEffects = { paused: [], moved: [], removed: [] };
      for (const p of plan) {
        if (p.choice.action === 'delete') {
          run('delete from watchers where id = ?', p.id);
          out.removed.push(p.id);
        } else if (p.choice.action === 'move') {
          moveWatcher(p.id, id, p.choice.boardId);
          out.moved.push(p.id);
        }
      }
      // Wer nicht umzieht und nicht gelöscht wird, pausiert (ein von Hand pausierter Wächter bleibt, wie er ist)
      out.paused = pauseWatchersOfBoard(id);
      run('update boards set deleted_at = ? where id = ?', iso(), id);
      return out;
    });
  }

  // ----- Archivieren -----

  function archiveBoard(id: string, viewer: Viewer): BoardWatcherEffects {
    const row = anyBoard(id);
    if (row.archived_at) throw new ConflictError(t('Das Board ist schon archiviert'));
    if (isLastBoard(id, viewer)) throw new ConflictError(t('Das letzte Board kann nicht archiviert werden.'));
    return tx(() => {
      run('update boards set archived_at = ?, updated_at = ? where id = ?', iso(), iso(), id);
      return { paused: pauseWatchersOfBoard(id), moved: [], removed: [] };
    });
  }

  function unarchiveBoard(id: string): { resumed: string[] } {
    const row = anyBoard(id);
    if (!row.archived_at) throw new ConflictError(t('Das Board ist nicht archiviert'));
    return tx(() => {
      run('update boards set archived_at = null, updated_at = ? where id = ?', iso(), id);
      return { resumed: resumeWatchersOfBoard(id) };
    });
  }

  /** Archivierte Boards, die die Person sehen dürfte (nur die Sichtbarkeit zählt), neueste Archivierung zuerst */
  function listArchivedBoards(viewer: Viewer): BoardSummary[] {
    const v = boardAccessSql('b', viewer);
    return all(`select * from boards b where b.deleted_at is null and b.archived_at is not null and ${v.sql} order by b.archived_at desc, b.id`, ...v.args).map((r) => ({
      ...toBoard(r),
      openCards: Number(
        one(
          `select count(*) as n from cards c join columns col on col.id = c.column_id
            where c.board_id = ? and c.deleted_at is null and c.archived_at is null and c.completed_at is null and col.is_done = 0 and col.is_planned = 0`,
          r.id,
        )!.n,
      ),
    }));
  }

  // ----- Duplizieren -----

  /**
   * Kopiert ein Board: Name „X (Kopie)", auf Wunsch Spalten und Kategorien, offene Aufgaben (ohne Zuständige und Erledigte, Wiederholungen
   * bleiben) und die Sichtbarkeit des Originals (sonst „alle"). Wächter werden nie mitkopiert. Besitzer der Kopie ist, wer sie anlegt.
   */
  function duplicateBoard(
    id: string,
    input: { name?: unknown; structure?: unknown; openCards?: unknown; keepVisibility?: unknown },
    by: string | null,
  ): Board {
    const src = visibleBoard(id);
    const flag = (v: unknown, fallback: boolean): boolean => {
      if (v === undefined) return fallback;
      if (typeof v !== 'boolean') throw new ValidationError(t('Die Auswahl muss wahr oder falsch sein'));
      return v;
    };
    const structure = flag(input.structure, true);
    const withCards = flag(input.openCards, false);
    const keep = flag(input.keepVisibility, true);
    const name = cleanText(input.name === undefined ? t('{name} (Kopie)', { name: src.name }) : input.name, t('Der Name'), 80);
    const person = by !== null && !!one('select 1 as ok from users where id = ? and is_person = 1', by);
    // Alles außer „alle" braucht eine Person als Besitzer
    const visibility: BoardVisibility = keep && person ? (src.visibility as BoardVisibility) : 'all';
    const members = visibility === 'selected' ? [...(src.owner_id ? [src.owner_id as string] : []), ...boardMemberIds(id)].filter((u) => u !== by) : [];

    return tx(() => {
      const view = getBoardView(id);
      const board = createBoard({
        name,
        icon: src.icon,
        color: src.color,
        withPlanned: true,
        ...(structure ? { columns: view.columns.map((col) => ({ name: col.name, done: col.isDone, planned: col.isPlanned })) } : {}),
        visibility,
        ownerId: person ? by : null,
        countsForFairness: src.counts_for_fairness !== 0,
        ...(visibility === 'selected' ? { memberIds: members } : {}),
      });
      run('update boards set archive_after_days = ? where id = ?', src.archive_after_days, board.id);
      const columns = getBoardView(board.id).columns;
      const categoryIds = new Map<string, string>();
      if (structure) for (const cat of view.categories) categoryIds.set(cat.id, addCategory(board.id, { name: cat.name, color: cat.color }).id);
      if (withCards) {
        const columnIndex = new Map(view.columns.map((col, i) => [col.id, i]));
        const firstOpen = columns.find((col) => !col.isDone && !col.isPlanned) ?? columns[0]!;
        for (const card of view.cards) {
          const srcCol = view.columns.find((col) => col.id === card.columnId);
          if (card.completedAt || srcCol?.isDone) continue;
          const mapped = structure ? columns[columnIndex.get(card.columnId) ?? 0] : undefined;
          const made = createCard(
            board.id,
            {
              columnId: (mapped ?? firstOpen).id,
              title: card.title,
              description: card.description,
              priority: card.priority,
              dueAt: card.dueAt,
              recurrence: card.recurrence,
              categoryIds: card.categoryIds.flatMap((cid) => (categoryIds.has(cid) ? [categoryIds.get(cid)!] : [])),
              effort: card.effort,
              icon: card.icon ?? null,
              iconColor: card.iconColor ?? null,
              costCents: card.costCents,
              remindBeforeMin: card.remindBeforeMin,
            },
            by,
          );
          for (const item of all('select text from checklist_items where card_id = ? order by position, id', card.id)) addChecklistItem(made.id, item.text as string);
        }
      }
      return toBoard(one('select * from boards where id = ?', board.id)!);
    });
  }

  // ----- Reihenfolge -----

  /**
   * Setzt die Reihenfolge der Boards, die die Person sieht (die Spalte `position` gilt für alle). Die Boards, die sie nicht sieht, behalten ihren
   * Platz in der Gesamtreihenfolge; `ids` muss genau die sichtbaren Boards nennen.
   */
  function reorderBoards(ids: unknown, viewer: Viewer): void {
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw new ValidationError(t('Die Reihenfolge muss eine Liste von Boards sein'));
    const wanted = ids as string[];
    const seen = new Set(visibleBoardIds(viewer));
    if (new Set(wanted).size !== wanted.length || wanted.length !== seen.size || wanted.some((x) => !seen.has(x))) {
      throw new ValidationError(t('Die Reihenfolge muss genau die sichtbaren Boards nennen'));
    }
    tx(() => {
      const global = all('select id from boards where deleted_at is null order by position, id').map((r: Row) => r.id as string);
      const queue = [...wanted];
      const order = global.map((gid) => (seen.has(gid) ? queue.shift()! : gid));
      const keys = generateNKeysBetween(null, null, order.length);
      order.forEach((bid, i) => run('update boards set position = ? where id = ?', keys[i]!, bid));
    });
  }

  return {
    pauseWatchersOfBoard,
    resumeWatchersOfBoard,
    targetGone,
    isLastBoard,
    deletePreview,
    deleteBoardWith,
    archiveBoard,
    unarchiveBoard,
    listArchivedBoards,
    duplicateBoard,
    reorderBoards,
  };
}
