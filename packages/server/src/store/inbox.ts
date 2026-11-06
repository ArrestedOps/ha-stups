import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';

/** Was die Glocke zeigt: Stupse, Antworten, Wächter-Karten, Erledigungen, Kommentare, Erinnerungen, Änderungen und Bitten um Bestätigung */
export type InboxKind = 'nudge' | 'reply' | 'watcher' | 'done' | 'comment' | 'reminder' | 'change' | 'confirm';

/**
 * Ein Eintrag im Posteingang einer Person. Der Server liefert Art und Daten, nicht den fertigen Satz: Die Oberfläche bildet den Text in der
 * Sprache der Person (zweisprachig, `t()`).
 */
export interface InboxEntry {
  /** Art und Quelle, zum Beispiel `nudge:<id>`; stabil und eindeutig */
  id: string;
  kind: InboxKind;
  at: string;
  cardId: string;
  cardTitle: string;
  boardId: string;
  /** wer es getan hat (null: das Haus, ein Wächter oder die Zeit) */
  actorId: string | null;
  /** Stups-Text, Anfang des Kommentars; sonst null */
  text: string | null;
  /** Unterart: Antwort `ack`/`done`; Erinnerung `due`/`reminder`/`nag`; Änderung `moved`/`reopened`/`due`; Wächter-Ergebnis; Stups-Vorlage */
  detail: string | null;
  /** Name des Wächters (nur kind watcher) */
  watcherName: string | null;
  /** Wächter: die Karte ist mir zugewiesen (sonst sucht sie noch jemanden) */
  assigned: boolean;
  /** Termin der Karte (nur bei Erinnerungen: „überfällig seit …") */
  dueAt: string | null;
  /** Kennung des Wächters (nur bei Mitteilungen zu Wächtern ohne Karte: `detail` ist dann `assignees_missing` oder `shrunk`) */
  watcherId: string | null;
  /** Die Angaben zu „braucht neue Zuständige" und „läuft weiter mit …" (sonst null); die Oberfläche bildet den Satz */
  notice: { boardName: string; removedNames: string[]; remainingNames: string[] } | null;
}

export interface InboxResult {
  items: InboxEntry[];
  /** bis wann die Person alles gelesen hat (null: noch nie) */
  seenAt: string | null;
  /** es gäbe noch ältere Einträge (innerhalb der 14 Tage) */
  hasMore: boolean;
}

export const INBOX_DAYS = 14;
export const INBOX_LIMIT = 100;
const COMMENT_MAX = 140;

/** Welche Wächter-Läufe die Person angehen (die Karte steht beim Lauf) */
const WATCHER_RESULTS = ['created', 'suggested', 'assigned', 'passed', 'suggest_fallback', 'nudged'];

/** Der Posteingang je Person: eine Abfrage über die bestehenden Ereignisse, ohne eigene Tabelle für die Einträge */
export function createInbox(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { all, one, run, now, iso } = c;
  const { confirmerIds, visibleBoardsSql, watcherNoticesFor } = lazy(s, ['confirmerIds', 'visibleBoardsSql', 'watcherNoticesFor'] as const);

  /**
   * Gehört die Karte (Alias `c`) zu dieser Person? Ein Kind: immer nur Karten, die ihm zugewiesen sind (nie fremde Boards). Sonst Karten,
   * die ihr zugewiesen sind, die sie angelegt hat oder an denen sie gestupst hat (`strict`). Gelöschte Karten und Boards gibt es nicht.
   */
  function mine(child: boolean, me: string, strict = true): { sql: string; args: (string | null)[] } {
    // Nur Boards, die die Person sieht: Karten aus privaten Boards anderer erscheinen nie in ihren Mitteilungen
    const seen = visibleBoardsSql(me);
    const base = `c.deleted_at is null and c.board_id in (${seen.sql})`;
    const assigned = `exists (select 1 from card_assignees a where a.card_id = c.id and a.user_id = ?)`;
    // Die Platzhalter des Teils „base" stehen im SQL vor den übrigen
    if (child) return { sql: `${base} and ${assigned}`, args: [...seen.args, me] };
    // Was mir direkt gilt (Stups an mich, Erinnerung an mich) braucht bei einem Erwachsenen keinen weiteren Bezug zur Karte
    if (!strict) return { sql: base, args: [...seen.args] };
    return {
      sql: `${base} and (${assigned} or c.created_by = ? or exists (select 1 from nudges n where n.card_id = c.id and n.from_user = ?))`,
      args: [...seen.args, me, me, me],
    };
  }

  function inbox(userId: string, opts: { confirmAll?: boolean; before?: string | null } = {}): InboxResult {
    const user = one('select is_child, inbox_seen_at from users where id = ?', userId);
    if (!user) return { items: [], seenAt: null, hasMore: false };
    const child = user.is_child === 1;
    const nowIso = iso();
    const since = new Date(now().getTime() - INBOX_DAYS * 86_400_000).toISOString();
    const before = opts.before ?? '9999-12-31T23:59:59.999Z';
    const m = mine(child, userId);
    const direct = mine(child, userId, false);
    const seen = visibleBoardsSql(userId);
    const out: InboxEntry[] = [];
    const base = (r: Record<string, any>) => ({ cardId: r.card_id as string, cardTitle: r.title as string, boardId: r.board_id as string });
    const entry = (e: Partial<InboxEntry> & Pick<InboxEntry, 'id' | 'kind' | 'at' | 'cardId' | 'cardTitle' | 'boardId'>): InboxEntry => ({
      actorId: null,
      text: null,
      detail: null,
      watcherName: null,
      assigned: false,
      dueAt: null,
      watcherId: null,
      notice: null,
      ...e,
    });
    const LIM = INBOX_LIMIT + 1;

    // Stupse an mich (erst ab der Zustellung: in der Ruhezeit gehaltene Stupse erscheinen, wenn sie ankommen)
    for (const r of all(
      `select n.id, n.from_user, n.template, n.text, n.deliver_at, c.id as card_id, c.title, c.board_id from nudges n
       join cards c on c.id = n.card_id where n.to_user = ? and n.created_at >= ? and n.deliver_at <= ? and n.deliver_at >= ? and n.deliver_at < ? and ${direct.sql}
       order by n.deliver_at desc limit ${LIM}`,
      userId, since, nowIso, since, before, ...direct.args,
    )) {
      out.push(entry({ id: `nudge:${r.id}`, kind: 'nudge', at: r.deliver_at, ...base(r), actorId: r.from_user, text: r.text, detail: r.template }));
    }

    // Antworten auf meine Stupse: „Mach ich". „Erledigt" steht schon als Erledigung da, geschlossene Stupse sind keine Antwort
    for (const r of all(
      `select n.id, n.to_user, n.text, n.reply, n.reply_at, c.id as card_id, c.title, c.board_id from nudges n
       join cards c on c.id = n.card_id where n.from_user = ? and n.reply = 'ack' and n.reply_at >= ? and n.reply_at < ? and ${m.sql}
       order by n.reply_at desc limit ${LIM}`,
      userId, since, before, ...m.args,
    )) {
      out.push(entry({ id: `reply:${r.id}`, kind: 'reply', at: r.reply_at, ...base(r), actorId: r.to_user, text: r.text, detail: r.reply }));
    }

    // Wächter: Karten für mich; ein Erwachsener auch Karten, die noch jemanden suchen (ein Kind nur, solange ihm die Karte noch zugewiesen ist)
    const wq = all(
      `select r.id, r.at, r.result, r.assigned_to, w.name as watcher_name, c.id as card_id, c.title, c.board_id from watcher_runs r
       join watchers w on w.id = r.watcher_id join cards c on c.id = r.card_id
       where r.result in (${WATCHER_RESULTS.map(() => '?').join(', ')}) and r.at >= ? and r.at < ? and c.deleted_at is null
         and c.board_id in (${seen.sql}) ${child ? `and ${m.sql}` : ''}
       order by r.at desc limit 400`,
      ...WATCHER_RESULTS, since, before, ...seen.args, ...(child ? m.args : []),
    );
    let watcherCount = 0;
    for (const r of wq) {
      let ids: string[] = [];
      try {
        ids = JSON.parse(r.assigned_to) as string[];
      } catch {
        /* kaputte Zeile: gilt als niemand */
      }
      const assigned = ids.includes(userId);
      if (!assigned && (child || ids.length > 0 || !['created', 'suggested', 'suggest_fallback'].includes(r.result))) continue;
      if (++watcherCount > LIM) break;
      out.push(entry({ id: `watcher:${r.id}`, kind: 'watcher', at: r.at, ...base(r), detail: r.result, watcherName: r.watcher_name, assigned }));
    }

    // Wächter, die neue Zuständige brauchen oder nach dem Entfernen einer Person verkleinert weiterlaufen (ohne Karte; nie für ein Kind)
    if (!child) {
      for (const n of watcherNoticesFor(userId, since, before, LIM)) {
        out.push(
          entry({
            id: `notice:${n.id}`,
            kind: 'watcher',
            at: n.at,
            cardId: '',
            cardTitle: '',
            boardId: n.detail.boardId,
            actorId: n.byUser,
            detail: n.kind,
            watcherName: n.watcherName,
            watcherId: n.watcherId,
            notice: { boardName: n.detail.boardName, removedNames: n.detail.removedNames, remainingNames: n.detail.remainingNames },
          }),
        );
      }
    }

    // Erledigungen anderer auf meinen Karten
    for (const r of all(
      `select p.id, p.completed_by, p.completed_at, c.id as card_id, c.title, c.board_id from completions p
       join cards c on c.id = p.card_id where p.completed_at >= ? and p.completed_at < ? and (p.completed_by is null or p.completed_by != ?) and ${m.sql}
       order by p.completed_at desc limit ${LIM}`,
      since, before, userId, ...m.args,
    )) {
      out.push(entry({ id: `done:${r.id}`, kind: 'done', at: r.completed_at, ...base(r), actorId: r.completed_by }));
    }

    // Kommentare anderer auf meinen Karten
    for (const r of all(
      `select k.id, k.author_id, k.text, k.created_at, c.id as card_id, c.title, c.board_id from comments k
       join cards c on c.id = k.card_id where k.created_at >= ? and k.created_at < ? and (k.author_id is null or k.author_id != ?) and ${m.sql}
       order by k.created_at desc limit ${LIM}`,
      since, before, userId, ...m.args,
    )) {
      const text = String(r.text).trim();
      out.push(entry({ id: `comment:${r.id}`, kind: 'comment', at: r.created_at, ...base(r), actorId: r.author_id, text: text.length > COMMENT_MAX ? `${text.slice(0, COMMENT_MAX - 1)}…` : text }));
    }

    // Was ich als Erinnerung bekommen habe: fällig, vorab, überfällig (Zusammenfassungen haben keine Karte)
    for (const r of all(
      `select x.id, x.kind, x.sent_at, c.due_at, c.id as card_id, c.title, c.board_id from sent_notifications x
       join cards c on c.id = x.card_id where x.user_id = ? and x.status = 'sent' and x.kind in ('due', 'reminder', 'nag')
         and x.sent_at >= ? and x.sent_at < ? and ${direct.sql}
       order by x.sent_at desc limit ${LIM}`,
      userId, since, before, ...direct.args,
    )) {
      out.push(entry({ id: `reminder:${r.id}`, kind: 'reminder', at: r.sent_at, ...base(r), detail: r.kind, dueAt: r.due_at }));
    }

    // Änderungen anderer an meinen Karten: verschoben, wieder geöffnet, anderer Termin (vom System Wieder-Geöffnetes inklusive)
    for (const r of all(
      `select e.id, e.kind, e.by_user, e.at, c.id as card_id, c.title, c.board_id from card_events e
       join cards c on c.id = e.card_id where e.at >= ? and e.at < ? and (e.by_user is null or e.by_user != ?) and ${m.sql}
       order by e.at desc limit ${LIM}`,
      since, before, userId, ...m.args,
    )) {
      out.push(entry({ id: `change:${r.id}`, kind: 'change', at: r.at, ...base(r), actorId: r.by_user, detail: r.kind }));
    }

    // Bitten um Bestätigung, die ich geben darf (ein Kind nie)
    if (!child) {
      for (const r of all(
        `select c.id as card_id, c.title, c.board_id, c.confirm_requested_at as at, c.confirm_requested_by as by from cards c
         where c.deleted_at is null and c.archived_at is null and c.completed_at is null and c.confirm_requested_at is not null
           and c.confirm_requested_at >= ? and c.confirm_requested_at < ? and c.board_id in (${seen.sql})
         order by c.confirm_requested_at desc limit ${LIM}`,
        since, before, ...seen.args,
      )) {
        const childId = (r.by as string | null) ?? null;
        if (childId === userId || !(opts.confirmAll || (childId !== null && confirmerIds(childId).includes(userId)))) continue;
        out.push(entry({ id: `confirm:${r.card_id}`, kind: 'confirm', at: r.at, ...base(r), actorId: childId }));
      }
    }

    // Neueste zuerst; bei gleicher Zeit nach Kennung, damit die Reihenfolge stabil bleibt
    out.sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.at < b.at ? 1 : -1));
    const hasMore = out.length > INBOX_LIMIT;
    return { items: out.slice(0, INBOX_LIMIT), seenAt: typeof user.inbox_seen_at === 'string' ? user.inbox_seen_at : null, hasMore };
  }

  /** „Alle gelesen": der Marker springt auf jetzt (nie zurück) */
  function markInboxSeen(userId: string): string {
    const at = iso();
    run('update users set inbox_seen_at = ? where id = ? and (inbox_seen_at is null or inbox_seen_at < ?)', at, userId, at);
    return (one('select inbox_seen_at from users where id = ?', userId)?.inbox_seen_at as string | undefined) ?? at;
  }

  return { inbox, markInboxSeen };
}
