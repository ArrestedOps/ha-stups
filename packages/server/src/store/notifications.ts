import { type OpenDueCard, type RecentNotification, type NotificationKey } from './types.js';
import type { Ctx } from './context.js';

/** Benachrichtigungen (Sendeprotokoll) */
export function createNotifications(c: Ctx) {
  const { iso, all, run } = c;

  function openDueCards(): OpenDueCard[] {
    const rows = all(
      `select c.id, c.title, c.board_id, b.name as board_name, c.due_at, c.remind_before_min, c.overdue_nag
       from cards c join boards b on b.id = c.board_id
       where c.deleted_at is null and c.archived_at is null and c.completed_at is null
         and c.due_at is not null and b.deleted_at is null
       order by c.due_at, c.id`,
    );
    const assignees = new Map<string, string[]>();
    for (const r of all(
      `select ca.card_id, ca.user_id from card_assignees ca join users u on u.id = ca.user_id and u.is_person = 1 order by ca.rowid`,
    )) {
      assignees.set(r.card_id, [...(assignees.get(r.card_id) ?? []), r.user_id]);
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      boardId: r.board_id,
      boardName: r.board_name,
      dueAt: r.due_at,
      remindBeforeMin: r.remind_before_min,
      overdueNag: r.overdue_nag === 1,
      assigneeIds: assignees.get(r.id) ?? [],
    }));
  }

  /** Legt den Eintrag an. false = es gab ihn schon (also nicht noch einmal senden). */
  function claimNotification(k: NotificationKey, status: 'sent' | 'skipped' | 'failed' = 'sent'): boolean {
    return (
      Number(
        run(
          `insert or ignore into sent_notifications (card_id, user_id, kind, occurrence_key, status, sent_at)
           values (?, ?, ?, ?, ?, ?)`,
          k.cardId,
          k.userId,
          k.kind,
          k.key,
          status,
          iso(),
        ).changes,
      ) > 0
    );
  }

  /** Letzte Einträge des Sendeprotokolls, neueste zuerst (für die Übersicht in den Einstellungen). */
  function recentNotifications(limit = 20): RecentNotification[] {
    return all(
      `select n.kind, n.status, n.sent_at, n.occurrence_key, c.title, u.name as user_name
       from sent_notifications n
       left join cards c on c.id = n.card_id
       left join users u on u.id = n.user_id
       order by n.id desc limit ?`,
      limit,
    ).map((r) => ({
      kind: r.kind,
      status: r.status,
      at: r.sent_at,
      title: r.kind === 'summary' ? 'Tageszusammenfassung' : (r.title ?? '(Karte gelöscht)'),
      user: r.user_name ?? '?',
    }));
  }

  function releaseNotification(k: NotificationKey): void {
    run(
      'delete from sent_notifications where card_id = ? and user_id = ? and kind = ? and occurrence_key = ?',
      k.cardId,
      k.userId,
      k.kind,
      k.key,
    );
  }

  return {
    openDueCards,
    claimNotification,
    recentNotifications,
    releaseNotification,
  };
}
