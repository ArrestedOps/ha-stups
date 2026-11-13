import { randomUUID } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { type Recurrence } from '../recurrence.js';
import { parseReminder } from '../reminders.js';
import { type OpenNudge, type Card, type ScheduleCard, type ChecklistItem, type CardLink, type ActivityEntry, type CardDetail, type CardInput, type CardPatch, type Row } from './types.js';
import { cleanText, optionalText, parseDue, parsePriority, parseRemind, parseCost, parseEffort, parseIcon, parseIconColor, parseIconSource, parseConfirm, parseCarryOver, resolveCarry, parseRecurrence } from './validate.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import { t } from '../i18n/index.js';
import type { Viewer } from './visibility.js';

/** Aufgaben */
export function createCards(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { iso, one, all, run, tx } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { copyReminders, resetDueReminders, setReminder, boardPeopleIds, boardVisibleSql, visibleBoardsSql, closeOpenNudges, nudgeActivity, watcherActivity, completeCard, firstOpenColumn, inboxColumn, isFutureDue, lastPos, listAttachments, listCompletions, neighbours, plannedColumn, recordCompletion, snapshotOf, visibleBoard, visibleColumn } = lazy(s, ['copyReminders', 'resetDueReminders', 'setReminder', 'boardPeopleIds', 'boardVisibleSql', 'visibleBoardsSql', 'closeOpenNudges', 'nudgeActivity', 'watcherActivity', 'completeCard', 'firstOpenColumn', 'inboxColumn', 'isFutureDue', 'lastPos', 'listAttachments', 'listCompletions', 'neighbours', 'plannedColumn', 'recordCompletion', 'snapshotOf', 'visibleBoard', 'visibleColumn'] as const);

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
      costCents: r.cost_cents,
      effort: r.effort ?? null,
      icon: r.icon ?? null,
      iconColor: r.icon_color ?? null,
      iconSource: r.icon_source ?? null,
      confirm: r.confirm === 'on' || r.confirm === 'off' ? r.confirm : null,
      confirmRequestedAt: r.confirm_requested_at ?? null,
      confirmRequestedBy: r.confirm_requested_by ?? null,
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
    if (!r) throw new NotFoundError(t('Aufgabe nicht gefunden'));
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

  /**
   * Mehrere Aufgaben auf einmal, so wie die Board-Ansicht sie liefert (sichtbar, nicht archiviert); Unbekannte, Gelöschte und Archivierte
   * fehlen, ebenso Aufgaben aus Boards, die `viewer` nicht sieht
   */
  function getCards(ids: string[], viewer: Viewer): Card[] {
    if (ids.length === 0) return [];
    const v = visibleBoardsSql(viewer);
    return loadCards(`id in (${ids.map(() => '?').join(', ')}) and deleted_at is null and archived_at is null and board_id in (${v.sql})`, ...ids, ...v.args);
  }

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

  /** Zuständige einer Aufgabe: nur Personen aus Stups, die das Board sehen (auf einem privaten Board nur der Besitzer) */
  function checkAssignees(ids: unknown, boardId: string): string[] {
    if (!Array.isArray(ids)) throw new ValidationError(t('Zuständige müssen eine Liste sein'));
    if (ids.some((x) => typeof x !== 'string')) throw new ValidationError(t('Zuständige müssen eine Liste sein'));
    const unique = [...new Set(ids as string[])];
    for (const uid of unique) {
      if (!one('select 1 as ok from users where id = ? and is_person = 1', uid)) {
        throw new ValidationError(t('Zugewiesen werden können nur Personen aus Stups'));
      }
    }
    if (unique.length > 0) {
      const seeing = new Set(boardPeopleIds(boardId));
      if (unique.some((uid) => !seeing.has(uid))) throw new ValidationError(t('Zugewiesen werden können nur Personen, die das Board sehen'));
    }
    return unique;
  }

  function checkCategories(boardId: string, ids: unknown): string[] {
    if (!Array.isArray(ids)) throw new ValidationError(t('Kategorien müssen eine Liste sein'));
    if (ids.some((x) => typeof x !== 'string')) throw new ValidationError(t('Kategorien müssen eine Liste sein'));
    const unique = [...new Set(ids as string[])];
    for (const cid of unique) {
      if (!one('select 1 as ok from categories where id = ? and board_id = ? and deleted_at is null', cid, boardId)) {
        throw new ValidationError(t('Die Kategorie gehört nicht zu diesem Board'));
      }
    }
    return unique;
  }

  /**
   * Symbol, Farbe und Quelle aus Eingabe (und bisherigem Stand beim Ändern). Wer ein Symbol angibt, ohne die Quelle zu nennen,
   * hat es von Hand gewählt; ohne Symbol gibt es keine Quelle. Prüft die Form (ungültig → Fehler), nicht die Bibliothek.
   */
  function resolveIcon(
    input: { icon?: unknown; iconColor?: unknown; iconSource?: unknown },
    before: { icon: string | null; iconColor: string | null; iconSource: string | null } = { icon: null, iconColor: null, iconSource: null },
  ) {
    const icon = input.icon !== undefined ? parseIcon(input.icon) : before.icon;
    const iconColor = input.iconColor !== undefined ? parseIconColor(input.iconColor) : before.iconColor;
    let iconSource = input.iconSource !== undefined ? parseIconSource(input.iconSource) : before.iconSource;
    if (input.iconSource === undefined && input.icon !== undefined) iconSource = icon ? 'manual' : null;
    if (!icon) iconSource = null;
    return { icon, iconColor, iconSource };
  }

  /**
   * Aufgaben ohne Symbol (offen, erledigt, archiviert; nicht im Papierkorb) für „Symbole aus Titeln erkennen“, nur aus Boards,
   * die `viewer` sieht: Auch ein Administrator bekommt keine Titel aus fremden privaten oder ausgewählten Boards.
   */
  function cardsWithoutIcon(viewer: Viewer): { id: string; title: string }[] {
    const v = visibleBoardsSql(viewer);
    return all(`select id, title from cards where icon is null and deleted_at is null and board_id in (${v.sql}) order by created_at, id`, ...v.args).map((r) => ({
      id: r.id as string,
      title: r.title as string,
    }));
  }

  /**
   * Setzt erkannte Symbole (Quelle „auto“), aber nur bei Aufgaben, die noch keins haben: Was jemand zwischendurch von Hand
   * gewählt hat, bleibt. Ändert weder Fassung noch Änderungszeit, denn es ist kein Eingriff der Person in die Aufgabe.
   */
  function applyDetectedIcons(items: unknown, viewer: Viewer): { updated: number; skipped: number } {
    if (!Array.isArray(items)) throw new ValidationError(t('Die Liste der Symbole fehlt'));
    if (items.length > 2000) throw new ValidationError(t('Höchstens {max} Aufgaben auf einmal', { max: 2000 }));
    const clean = items.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      if (typeof o.id !== 'string') throw new ValidationError(t('Die Liste der Symbole fehlt'));
      const icon = parseIcon(o.icon);
      if (!icon) throw new ValidationError(t('Das Symbol ist ungültig'));
      return { id: o.id, icon };
    });
    let updated = 0;
    // Die Berechtigung wird hier unabhängig vom Lesen geprüft: Aufgaben fremder Boards zählen als übersprungen, auch mit bekannter Kennung
    const v = visibleBoardsSql(viewer);
    tx(() => {
      for (const it of clean) {
        const res = run(
          `update cards set icon = ?, icon_source = 'auto' where id = ? and icon is null and deleted_at is null and board_id in (${v.sql})`,
          it.icon,
          it.id,
          ...v.args,
        );
        if (res.changes > 0) updated += 1;
      }
    });
    return { updated, skipped: clean.length - updated };
  }

  function createCard(boardId: string, input: CardInput, createdBy: string | null): CardDetail {
    visibleBoard(boardId);
    const col = visibleColumn(input.columnId);
    if (col.board_id !== boardId) throw new ValidationError(t('Die Spalte gehört nicht zu diesem Board'));
    const title = cleanText(input.title, t('Der Titel'), 200);
    const priority = parsePriority(input.priority);
    const dueAt = parseDue(input.dueAt);
    const recurrence = parseRecurrence(input.recurrence);
    if (recurrence && !dueAt) throw new ValidationError(t('Eine Wiederholung braucht eine Fälligkeit'));
    const remind = parseRemind(input.remindBeforeMin);
    const cost = parseCost(input.costCents);
    const effort = parseEffort(input.effort);
    const ico = resolveIcon(input);
    const carry = parseCarryOver(input.carryOver);
    const reminder = input.reminder === null || input.reminder === undefined ? null : parseReminder(input.reminder);
    if (reminder && !createdBy) throw new ValidationError(t('Nachhaken gilt für eine Person: melde dich an'));
    const description = optionalText(input.description, t('Die Beschreibung'), 20000);
    if (remind !== null && !dueAt) throw new ValidationError(t('Eine Vorab-Erinnerung braucht eine Fälligkeit'));
    if (col.is_planned === 1 && !isFutureDue(dueAt)) {
      throw new ValidationError(t('In „Geplant" kommen nur Aufgaben mit einem Termin nach heute'));
    }

    return tx(() => {
      const assignees = checkAssignees(input.assigneeIds ?? [], boardId);
      const categories = checkCategories(boardId, input.categoryIds ?? []);
      const id = randomUUID();
      const t = iso();
      run(
        `insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence,
                            remind_before_min, cost_cents, carry_over, created_by, created_at, updated_at, effort,
                            icon, icon_color, icon_source)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        boardId,
        col.id,
        generateKeyBetween(lastPos('cards', 'column_id = ?', col.id), null),
        title,
        description,
        priority,
        dueAt,
        recurrence ? JSON.stringify(recurrence) : null,
        remind,
        cost,
        carry ? JSON.stringify(carry) : null,
        createdBy,
        t,
        t,
        effort,
        ico.icon,
        ico.iconColor,
        ico.iconSource,
      );
      for (const u of assignees) run('insert into card_assignees (card_id, user_id) values (?, ?)', id, u);
      for (const c of categories) run('insert into card_categories (card_id, category_id) values (?, ?)', id, c);
      if (reminder) setReminder(id, createdBy, reminder, t);
      syncPlannedCard(id);
      return getCard(id);
    });
  }

  /** Aufgabe in die Spalte für Termine nach heute oder zurück in die erste offene Spalte, je nach Termin. */
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
      if (patch.expectedVersion !== undefined) {
        const expected = patch.expectedVersion;
        if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) throw new ValidationError(t('Die erwartete Fassung der Aufgabe ist ungültig'));
        if (expected !== card.version) throw new ConflictError(t('Die Aufgabe wurde zwischenzeitlich geändert'), { version: card.version });
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.title !== undefined) {
        sets.push('title = ?');
        params.push(cleanText(patch.title, t('Der Titel'), 200));
      }
      if (patch.description !== undefined) {
        sets.push('description = ?');
        params.push(optionalText(patch.description, t('Die Beschreibung'), 20000));
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
      if (recurrence && !dueAt) throw new ValidationError(t('Eine Wiederholung braucht eine Fälligkeit'));
      if (patch.dueAt !== undefined) {
        sets.push('due_at = ?');
        params.push(dueAt);
        if (dueAt !== card.due_at) {
          logEvent(id, 'due', by, card.due_at, dueAt);
          resetDueReminders(id); // Nachhaken ab Termin fängt beim neuen Termin von vorn an
        }
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
        if (remind !== null && !dueAt) throw new ValidationError(t('Eine Vorab-Erinnerung braucht eine Fälligkeit'));
        sets.push('remind_before_min = ?');
        params.push(remind);
      }
      if (patch.reminder !== undefined) {
        // Nachhaken ist persönlich: es gehört der Person, die es einstellt, und ändert nie das Nachhaken anderer
        const spec = patch.reminder === null ? null : parseReminder(patch.reminder);
        if (spec && !by) throw new ValidationError(t('Nachhaken gilt für eine Person: melde dich an'));
        if (by) setReminder(id, by, spec, iso());
      }
      if (patch.costCents !== undefined) {
        sets.push('cost_cents = ?');
        params.push(parseCost(patch.costCents));
      }
      if (patch.effort !== undefined) {
        sets.push('effort = ?');
        params.push(parseEffort(patch.effort));
      }
      if (patch.icon !== undefined || patch.iconColor !== undefined || patch.iconSource !== undefined) {
        const ico = resolveIcon(patch, { icon: card.icon ?? null, iconColor: card.icon_color ?? null, iconSource: card.icon_source ?? null });
        sets.push('icon = ?', 'icon_color = ?', 'icon_source = ?');
        params.push(ico.icon, ico.iconColor, ico.iconSource);
      }
      if (patch.confirm !== undefined) {
        sets.push('confirm = ?');
        params.push(parseConfirm(patch.confirm));
      }
      if (patch.carryOver !== undefined) {
        const carry = parseCarryOver(patch.carryOver);
        sets.push('carry_over = ?');
        params.push(carry ? JSON.stringify(carry) : null);
      }
      if (patch.assigneeIds !== undefined) {
        const ids = checkAssignees(patch.assigneeIds, card.board_id);
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
   * Kopie einer Aufgabe: Felder, Zuweisung, Kategorien, Checkliste (zurückgesetzt) und Links.
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
                            remind_before_min, cost_cents, carry_over, created_by, created_at, updated_at, effort,
                            icon, icon_color, icon_source)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        src.cost_cents,
        src.carry_over,
        by,
        t,
        t,
        src.effort ?? null,
        src.icon ?? null,
        src.icon_color ?? null,
        src.icon_source ?? null,
      );
      run('update cards set confirm = ? where id = ?', src.confirm ?? null, newId);
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
      if (by) copyReminders(id, newId, by);
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
    if (col.board_id !== card.board_id) throw new ValidationError(t('Die Spalte gehört nicht zu diesem Board'));
    return tx(() => {
      // „Geplant" nimmt nur Aufgaben mit Termin nach heute, und solche Aufgaben gehören nicht nach „Offen":
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
      // Eine wiederkehrende Aufgabe bleibt nie in der Erledigt-Spalte: Ablegen dort heißt "erledigen".
      if (entersDone && card.recurrence) return completeCard(id, { by, source: 'app' }).card;

      const snapshot = entersDone ? snapshotOf(card) : null;
      const fromName = columnName(card.column_id);
      placeCard(id, target, afterId);
      if (snapshot) {
        run('update cards set completed_at = ?, archived_at = null, confirm_requested_at = null, confirm_requested_by = null where id = ?', iso(), id);
        recordCompletion(id, by, 'app', card.due_at, snapshot);
        closeOpenNudges(id, by, true);
      } else if (target.is_done === 0 && card.completed_at !== null) {
        run('update cards set completed_at = null, archived_at = null, confirm_requested_at = null, confirm_requested_by = null where id = ?', id);
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

  type ScheduleOpts = {
    viewer: Viewer;
    boardIds?: string[];
    from?: string;
    to?: string;
    includeDone?: boolean;
    undated?: boolean;
    completedSince?: string;
    /** Seite aus der Datenbank: höchstens so viele Aufgaben, ab `offset` (ohne `limit` kommen alle) */
    limit?: number;
    offset?: number;
  };

  /**
   * Bedingung und Reihenfolge der Terminliste, an einer Stelle für Liste und Zählung.
   * `undated`: nur offene Aufgaben ohne Termin (Filter „Ohne Termin"); Zeitraum und Erledigte gibt es dort nicht.
   * `completedSince`: nur Aufgaben, die seit diesem Zeitpunkt erledigt wurden („Zuletzt erledigt"); es zählt allein das Datum der
   * Erledigung, Fälligkeit und Zeitraum spielen keine Rolle (eine Aufgabe ohne Termin oder vor Wochen fällig gehört ebenso dazu).
   */
  function scheduleQuery(opts: ScheduleOpts): { where: string; params: unknown[]; order: string } {
    const seen = visibleBoardsSql(opts.viewer);
    const recent = opts.completedSince && !opts.undated;
    const where = [
      recent ? 'completed_at >= ?' : opts.undated ? 'due_at is null' : 'due_at is not null',
      'deleted_at is null',
      'archived_at is null',
      `board_id in (${seen.sql})`,
    ];
    const params: unknown[] = recent ? [new Date(opts.completedSince!).toISOString(), ...seen.args] : [...seen.args];
    if (!recent && (!opts.includeDone || opts.undated)) where.push('completed_at is null');
    if (opts.from && !opts.undated && !recent) {
      where.push('due_at >= ?');
      params.push(new Date(opts.from).toISOString());
    }
    if (opts.to && !opts.undated && !recent) {
      where.push('due_at < ?');
      params.push(new Date(opts.to).toISOString());
    }
    if (opts.boardIds && opts.boardIds.length > 0) {
      where.push(`board_id in (${opts.boardIds.map(() => '?').join(', ')})`);
      params.push(...opts.boardIds);
    }
    // Zeitangaben sind ISO-Zeichenketten gleicher Form: die Sortierung der Datenbank ist die der Zeit. „Zuletzt erledigt": die zuletzt
    // erledigte Aufgabe zuerst. Sonst Termin, dann Anlage, dann Kennung (ohne Termin sind alle gleich, es zählen Anlage und Kennung).
    const order = recent ? 'completed_at desc, id' : 'due_at, created_at, id';
    return { where: where.join(' and '), params, order };
  }

  /** Wie viele Aufgaben die Terminliste insgesamt hat (ohne `limit` und `offset`), für die Gesamtzahl beim seitenweisen Laden */
  function countSchedule(opts: ScheduleOpts): number {
    const q = scheduleQuery(opts);
    return Number(one(`select count(*) as n from cards where ${q.where}`, ...q.params)?.n ?? 0);
  }

  /**
   * Alle Aufgaben mit Termin über alle Boards (für Agenda und Kalender), nach Termin sortiert.
   * `from` ist eingeschlossen, `to` ausgeschlossen; ohne `from` kommt auch alles Überfällige.
   * Mit `limit` und `offset` kommt nur eine Seite, ausgewählt und sortiert in der Datenbank: Geladen werden nur die Aufgaben der Seite.
   */
  function listSchedule(opts: ScheduleOpts): ScheduleCard[] {
    const q = scheduleQuery(opts);
    const paged = opts.limit !== undefined;
    const ids = all(
      `select id from cards where ${q.where} order by ${q.order}${paged ? ' limit ? offset ?' : ''}`,
      ...q.params,
      ...(paged ? [opts.limit, opts.offset ?? 0] : []),
    ).map((r) => r.id as string);
    if (ids.length === 0) return [];
    const sees = boardVisibleSql('b', opts.viewer);
    const boards = new Map(all(`select id, name, color from boards b where b.deleted_at is null and ${sees.sql}`, ...sees.args).map((b) => [b.id as string, b]));
    const cats = new Map(all('select id, name, color from categories where deleted_at is null').map((c) => [c.id as string, { id: c.id as string, name: c.name as string, color: c.color as string }]));
    // Eine Seite lädt nur ihre Aufgaben (höchstens eine Seite voll Parameter); ohne `limit` über die Bedingung, wie die Menge auch wächst
    const loaded = paged ? loadCards(`id in (${ids.map(() => '?').join(', ')})`, ...ids) : loadCards(q.where, ...q.params);
    const byId = new Map(loaded.map((c) => [c.id, c]));
    return ids
      .map((id) => byId.get(id))
      .filter((c): c is Card => c !== undefined)
      .map((c) => ({
        ...c,
        boardName: boards.get(c.boardId)?.name ?? '',
        boardColor: (boards.get(c.boardId)?.color as string | null) ?? null,
        categories: c.categoryIds.map((id) => cats.get(id)).filter((x): x is { id: string; name: string; color: string } => x !== undefined),
      }));
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
    getCards,
    logEvent,
    listActivity,
    checkAssignees,
    checkCategories,
    createCard,
    syncPlannedCard,
    updateCard,
    duplicateCard,
    cardsWithoutIcon,
    applyDetectedIcons,
    touchCard,
    placeCard,
    moveCard,
    deleteCard,
    setArchived,
    listSchedule,
    countSchedule,
    listArchived,
  };
}
