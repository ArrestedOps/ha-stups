import { randomUUID } from 'node:crypto';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { Row } from './types.js';
import { type ReminderSpec, usesClock } from '../reminders.js';

/** Eine fällige (oder noch nicht geplante) Erinnerung samt dem, was der Planer zum Senden braucht */
export interface DueReminder {
  id: string;
  cardId: string;
  title: string;
  boardId: string;
  boardName: string;
  dueAt: string | null;
  watcherId: string | null;
  /** null = die jeweils Zuständigen */
  userId: string | null;
  spec: ReminderSpec;
  /** Beginn der Zählung: der Termin (Anker „due“ mit Termin), sonst der Zeitpunkt des Anlegens bzw. Zuweisens */
  baseMs: number;
  sentCount: number;
  nextAt: string | null;
  /** die Zuständigen der Aufgabe, die das Board sehen */
  assigneeIds: string[];
}

/** Nachhaken (Tabelle card_reminders): Erinnerungen „wenn noch nicht erledigt“ je Aufgabe und Person */
export function createReminders(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { iso, all, one, run } = c;
  const { canSeeBoard } = lazy(s, ['canSeeBoard'] as const);

  const specOf = (r: Row): ReminderSpec => ({ anchor: r.anchor, afterMin: r.after_min, everyMin: r.every_min, max: r.max_count, atTime: r.at_time });

  /** Die Erinnerung dieser Person an diese Aufgabe (null: keine). Nur die eigene Zeile: andere Personen sehen sie nie. */
  function myReminder(cardId: string, userId: string | null): ReminderSpec | null {
    if (!userId) return null;
    const r = one('select * from card_reminders where card_id = ? and user_id = ?', cardId, userId);
    return r ? specOf(r) : null;
  }

  /** Legt die Erinnerung an oder ersetzt sie; `spec` null löscht sie. `userId` null: die jeweils Zuständigen (Wächter). */
  function setReminder(cardId: string, userId: string | null, spec: ReminderSpec | null, anchorAt: string | null = null): void {
    run('delete from card_reminders where card_id = ? and ifnull(user_id, \'\') = ?', cardId, userId ?? '');
    if (!spec) return;
    const now = iso();
    run(
      `insert into card_reminders (id, card_id, user_id, anchor, anchor_at, after_min, every_min, max_count, at_time, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      cardId,
      userId,
      spec.anchor,
      spec.anchor === 'created' ? (anchorAt ?? now) : null,
      spec.afterMin,
      spec.everyMin,
      spec.max,
      usesClock(spec) ? spec.atTime : null,
      now,
    );
  }

  /** Der Wächter wurde geändert: das Stupsen einer schon laufenden Aufgabe folgt der neuen Regel (nur wenn die Aufgabe schon eins hat) */
  function syncWatcherNudge(cardId: string, spec: ReminderSpec | null): void {
    const ex = one('select id from card_reminders where card_id = ? and user_id is null', cardId);
    if (!ex) return;
    if (!spec) run('delete from card_reminders where id = ?', ex.id);
    else {
      run(
        'update card_reminders set after_min = ?, every_min = ?, max_count = ?, at_time = null, next_at = null, sent_count = 0, done = 0 where id = ?',
        spec.afterMin,
        spec.everyMin,
        spec.max,
        ex.id,
      );
    }
  }

  /** Der Termin hat sich geändert: Erinnerungen ab Termin fangen von vorn an */
  function resetDueReminders(cardId: string): void {
    run('update card_reminders set next_at = null, sent_count = 0, done = 0 where card_id = ?', cardId);
  }

  /** Eine Wächter-Aufgabe ist (neu) zugewiesen: gezählt wird ab jetzt, auch ein schon gesendeter Stups gilt neu */
  function restartReminders(cardId: string, atIso: string): void {
    run("update card_reminders set anchor_at = ?, next_at = null, sent_count = 0, done = 0 where card_id = ? and anchor = 'created'", atIso, cardId);
  }

  /** Kopiert die Erinnerungen auf eine neue Aufgabe (wiederkehrende Aufgabe: alle; Duplikat: nur die der Person) und zählt dort neu */
  function copyReminders(fromId: string, toId: string, onlyUser?: string | null): void {
    const now = iso();
    const rows = all('select * from card_reminders where card_id = ?', fromId).filter((r) => onlyUser === undefined || r.user_id === onlyUser);
    for (const r of rows) {
      run(
        `insert into card_reminders (id, card_id, user_id, anchor, anchor_at, after_min, every_min, max_count, at_time, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        toId,
        r.user_id,
        r.anchor,
        r.anchor === 'created' ? now : null,
        r.after_min,
        r.every_min,
        r.max_count,
        r.at_time,
        now,
      );
    }
  }

  /**
   * Offene Aufgaben mit einer Erinnerung, die fällig ist oder noch keinen Zeitpunkt hat. Erledigte, gelöschte und archivierte Aufgaben
   * (und solche, die auf eine Bestätigung warten) kommen nicht vor: damit endet das Nachhaken von selbst.
   */
  function dueReminders(nowIso: string): DueReminder[] {
    const rows = all(
      `select r.*, c.title, c.board_id, b.name as board_name, c.due_at, c.created_at as card_created, c.watcher_id
       from card_reminders r
       join cards c on c.id = r.card_id
       join boards b on b.id = c.board_id
       left join watchers w on w.id = c.watcher_id
       where r.done = 0 and (r.next_at is null or r.next_at <= ?)
         and c.deleted_at is null and c.archived_at is null and c.completed_at is null and b.deleted_at is null and b.archived_at is null
         and c.confirm_requested_at is null and (c.watcher_id is null or w.active = 1)
       order by r.next_at, r.rowid`,
      nowIso,
    );
    const assignees = new Map<string, string[]>();
    const people = (cardId: string, boardId: string): string[] => {
      if (!assignees.has(cardId)) {
        const ids = all(
          `select ca.user_id from card_assignees ca join users u on u.id = ca.user_id and u.is_person = 1 where ca.card_id = ? order by ca.rowid`,
          cardId,
        ).map((x) => x.user_id as string);
        assignees.set(cardId, ids.filter((uid) => canSeeBoard(uid, boardId)));
      }
      return assignees.get(cardId)!;
    };
    return rows.map((r) => {
      const spec = specOf(r);
      const base = spec.anchor === 'due' && r.due_at ? r.due_at : (r.anchor_at ?? r.card_created);
      return {
        id: r.id,
        cardId: r.card_id,
        title: r.title,
        boardId: r.board_id,
        boardName: r.board_name,
        dueAt: r.due_at,
        watcherId: r.watcher_id,
        userId: r.user_id,
        spec,
        baseMs: Date.parse(base),
        sentCount: r.sent_count,
        nextAt: r.next_at,
        assigneeIds: people(r.card_id, r.board_id),
      };
    });
  }

  function planReminder(id: string, nextAtIso: string): void {
    run('update card_reminders set next_at = ? where id = ?', nextAtIso, id);
  }

  function settleReminder(id: string, st: { sentCount: number; nextAt: string | null; done: boolean }): void {
    run('update card_reminders set sent_count = ?, next_at = ?, done = ? where id = ?', st.sentCount, st.nextAt, st.done ? 1 : 0, id);
  }

  /** Hält der Wächter-Verlauf fest („Erinnerung gesendet, weil die Aufgabe noch offen war“): nur bei Aufgaben, die ein Wächter angelegt hat */
  function recordWatcherNudge(cardId: string, assigneeIds: string[], note: string): void {
    const card = one('select watcher_id from cards where id = ?', cardId);
    if (!card?.watcher_id) return;
    run(
      "insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to, note) values (?, ?, ?, 'nudged', ?, ?, ?)",
      randomUUID(),
      card.watcher_id,
      iso(),
      cardId,
      JSON.stringify(assigneeIds),
      note,
    );
  }

  return { myReminder, setReminder, syncWatcherNudge, resetDueReminders, restartReminders, copyReminders, dueReminders, planReminder, settleReminder, recordWatcherNudge };
}
