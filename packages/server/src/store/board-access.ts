import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../errors.js';
import { t } from '../i18n/index.js';
import type { AssignMode, AssignRule } from '../watcher-types.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { BoardVisibility } from './types.js';

/** Ein Wächter, den eine Änderung der Personen eines Boards trifft: wer vorher zuständig war (Kreis oder alle im Board) und wer danach */
export interface WatcherImpact {
  watcherId: string;
  name: string;
  mode: AssignMode;
  /** Zuständige jetzt: der Kreis des Wächters, bei leerem Kreis alle, die das Board sehen */
  before: string[];
  /** Zuständige danach */
  after: string[];
  /** niemand bleibt: der Wächter legt keine Karten mehr an, bis neue Zuständige gewählt sind (Status `assignees_missing`) */
  missing: boolean;
  /** Der Kreis ist leer („alle im Board"): er schrumpft nur mit dem Board, eingetragen wird nichts */
  circleEmpty: boolean;
  /** Der Rückfall (feste Person) fällt weg */
  fallbackCleared: boolean;
}

/** Was eine Änderung von Sichtbarkeit oder Mitgliedern eines Boards nach sich zieht (die Vorschau für den Bestätigungsdialog) */
export interface BoardAccessPlan {
  /** Personen, die das Board danach nicht mehr sehen */
  removedIds: string[];
  /** Betroffene Wächter, die auf dieses Board zeigen */
  watchers: WatcherImpact[];
  /** Wächter, die verhindern, dass das Board privat wird (jeder, der auf das Board zeigt) */
  blocking: { id: string; name: string }[];
  /** Karten dieses Boards, bei denen Zuständige entfernt werden */
  assigneeCards: number;
  /** Neue Regel je betroffenem Wächter (nur bei einem nicht leeren Kreis oder wegfallendem Rückfall) */
  rules: { watcherId: string; rule: AssignRule }[];
}

/** Was tatsächlich geändert wurde (für die Mitteilungen an die Glocke) */
export interface BoardEffects {
  removedIds: string[];
  watchers: WatcherImpact[];
  cardsChanged: number;
}

/** Eine Mitteilung der Glocke zu einem Wächter („braucht neue Zuständige", „läuft weiter mit …") */
export interface WatcherNotice {
  id: string;
  watcherId: string;
  watcherName: string;
  kind: 'assignees_missing' | 'shrunk';
  at: string;
  byUser: string | null;
  detail: { boardId: string; boardName: string; removedNames: string[]; remainingNames: string[] };
}

/**
 * Was die Personen eines Boards für die Wächter bedeutet: Wer das Board nicht mehr sieht, wird aus den Kreisen der Wächter genommen,
 * die auf das Board zeigen (siehe `planBoardAccess`), und die Glocke bekommt die Mitteilungen dazu.
 */
export function createBoardAccess(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { all, one, run, iso } = c;
  const { touchCard } = lazy(s, ['touchCard'] as const);

  /** Alle Wächter, deren Karten auf dieses Board kommen */
  function watchersOfBoard(boardId: string): { id: string; name: string; assign: AssignRule }[] {
    return all('select id, name, card_json, assign_json from watchers order by position, created_at, rowid').flatMap((r) => {
      try {
        // Das Board steht in der Vorlage der Karte (Spalte card_json); die Auswertung in Javascript hält sich nicht an JSON1
        const card = JSON.parse(r.card_json ?? '{}') as { boardId?: string };
        return card.boardId === boardId ? [{ id: r.id as string, name: r.name as string, assign: JSON.parse(r.assign_json) as AssignRule }] : [];
      } catch {
        return [];
      }
    });
  }

  /**
   * Plant die Folgen einer Änderung der Personen eines Boards (ohne zu schreiben): wer nicht mehr sieht, welche Wächter das trifft,
   * wer danach zuständig ist, und ob der Wächter dann keine Karten mehr anlegen kann. Wird das Board privat, verbietet jeder Wächter,
   * der darauf zeigt, die Änderung (`blocking`).
   */
  function planBoardAccess(boardId: string, input: { visibility: BoardVisibility; oldPeople: string[]; newPeople: string[] }): BoardAccessPlan {
    const now = new Set(input.newPeople);
    const removedIds = input.oldPeople.filter((id) => !now.has(id));
    const watchers = watchersOfBoard(boardId);
    const blocking = input.visibility === 'private' ? watchers.map((w) => ({ id: w.id, name: w.name })) : [];
    const impacts: WatcherImpact[] = [];
    const rules: { watcherId: string; rule: AssignRule }[] = [];
    if (removedIds.length > 0) {
      const was = new Set(input.oldPeople);
      for (const w of watchers) {
        const rule = w.assign;
        if (rule.mode === 'none') continue;
        const circleEmpty = rule.personIds.length === 0;
        const before = circleEmpty ? input.oldPeople : rule.personIds.filter((id) => was.has(id));
        const after = circleEmpty ? input.newPeople : rule.personIds.filter((id) => now.has(id));
        const droppedFallback = !!rule.fallbackPersonId && !now.has(rule.fallbackPersonId) && was.has(rule.fallbackPersonId);
        const affected = before.some((id) => !now.has(id)) || droppedFallback;
        if (!affected) continue;
        impacts.push({
          watcherId: w.id,
          name: w.name,
          mode: rule.mode,
          before,
          after,
          missing: after.length === 0,
          circleEmpty,
          fallbackCleared: droppedFallback,
        });
        rules.push({
          watcherId: w.id,
          rule: {
            ...rule,
            personIds: circleEmpty ? [] : after,
            ...(droppedFallback
              ? {
                  fallbackPersonId: null,
                  fallback: rule.fallback === 'fixed' ? 'none' : rule.fallback,
                  waitFallback: rule.waitFallback === 'fixed' ? 'none' : rule.waitFallback,
                }
              : {}),
          },
        });
      }
    }
    let assigneeCards = 0;
    if (removedIds.length > 0) {
      const marks = removedIds.map(() => '?').join(', ');
      assigneeCards = Number(
        one(
          `select count(distinct a.card_id) as n from card_assignees a join cards c on c.id = a.card_id
            where c.board_id = ? and c.deleted_at is null and a.user_id in (${marks})`,
          boardId,
          ...removedIds,
        )?.n ?? 0,
      );
    }
    return { removedIds, watchers: impacts, blocking, assigneeCards, rules };
  }

  /**
   * Führt den Plan aus: entfernt die Zuständigkeiten der Personen, die das Board nicht mehr sehen, und nimmt sie aus den Kreisen der
   * Wächter. Bleibt bei einem Wächter niemand übrig, bekommt er `assignees_missing` (er legt keine Karten mehr an). Läuft in der
   * Transaktion der Board-Änderung.
   */
  function applyBoardAccess(boardId: string, plan: BoardAccessPlan): BoardEffects {
    let cardsChanged = 0;
    if (plan.removedIds.length > 0) {
      const marks = plan.removedIds.map(() => '?').join(', ');
      const cards = all(
        `select distinct a.card_id as id from card_assignees a join cards c on c.id = a.card_id where c.board_id = ? and a.user_id in (${marks})`,
        boardId,
        ...plan.removedIds,
      );
      for (const card of cards) {
        for (const uid of plan.removedIds) run('delete from card_assignees where card_id = ? and user_id = ?', card.id, uid);
        touchCard(card.id as string);
        cardsChanged += 1;
      }
    }
    const missing = new Set(plan.watchers.filter((w) => w.missing).map((w) => w.watcherId));
    for (const r of plan.rules) {
      run(
        `update watchers set assign_json = ?, assignees_missing = case when ? = 1 then 1 else assignees_missing end, updated_at = ? where id = ?`,
        JSON.stringify(r.rule),
        missing.has(r.watcherId) ? 1 : 0,
        iso(),
        r.watcherId,
      );
    }
    // Wächter mit leerem Kreis (alle im Board) brauchen keine neue Regel, nur den Status, falls das Board niemanden mehr hat
    for (const w of plan.watchers) {
      if (w.missing && !plan.rules.some((r) => r.watcherId === w.watcherId)) run('update watchers set assignees_missing = 1 where id = ?', w.watcherId);
    }
    return { removedIds: plan.removedIds, watchers: plan.watchers, cardsChanged };
  }

  // ----- Mitteilungen der Glocke zu Wächtern -----

  function addWatcherNotice(n: { watcherId: string; kind: 'assignees_missing' | 'shrunk'; byUser: string | null; recipients: string[]; detail: WatcherNotice['detail'] }): void {
    if (n.recipients.length === 0) return;
    run(
      'insert into watcher_notices (id, watcher_id, kind, at, by_user, recipients, detail) values (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      n.watcherId,
      n.kind,
      iso(),
      n.byUser,
      JSON.stringify([...new Set(n.recipients)]),
      JSON.stringify(n.detail),
    );
  }

  /** Die Mitteilungen zu Wächtern an diese Person im Zeitraum (neueste zuerst) */
  function watcherNoticesFor(userId: string, sinceIso: string, beforeIso: string, limit: number): WatcherNotice[] {
    const out: WatcherNotice[] = [];
    for (const r of all(
      `select n.*, w.name as watcher_name from watcher_notices n join watchers w on w.id = n.watcher_id
        where n.at >= ? and n.at < ? order by n.at desc, n.rowid desc limit 400`,
      sinceIso,
      beforeIso,
    )) {
      let recipients: string[] = [];
      try {
        recipients = JSON.parse(r.recipients) as string[];
      } catch {
        /* kaputte Zeile: gilt als niemand */
      }
      if (!recipients.includes(userId)) continue;
      let detail: WatcherNotice['detail'] = { boardId: '', boardName: '', removedNames: [], remainingNames: [] };
      try {
        detail = { ...detail, ...(JSON.parse(r.detail) as object) };
      } catch {
        /* leere Angaben */
      }
      out.push({ id: r.id, watcherId: r.watcher_id, watcherName: r.watcher_name, kind: r.kind, at: r.at, byUser: r.by_user ?? null, detail });
      if (out.length >= limit) break;
    }
    return out;
  }

  // ----- Boards ohne Besitzer (nur Name und Zahl der Karten, für Administratoren) -----

  /** Private oder ausgewählte Boards, deren Besitzer keine Person in Stups mehr ist: niemand sieht sie, ein Administrator darf sie löschen */
  function orphanBoards(): { id: string; name: string; cards: number }[] {
    return all(
      `select b.id, b.name, (select count(*) from cards c where c.board_id = b.id and c.deleted_at is null) as cards from boards b
        where b.deleted_at is null and b.visibility <> 'all'
          and (b.owner_id is null or b.owner_id not in (select id from users where is_person = 1))
        order by b.name, b.id`,
    ).map((r) => ({ id: r.id as string, name: r.name as string, cards: Number(r.cards) }));
  }

  /** Löscht ein Board ohne Besitzer endgültig (samt Karten); ein anderes gibt es hier nicht */
  function deleteOrphanBoard(id: string): void {
    if (!orphanBoards().some((b) => b.id === id)) throw new NotFoundError(t('Board nicht gefunden'));
    run('delete from boards where id = ?', id);
  }

  return { planBoardAccess, applyBoardAccess, addWatcherNotice, watcherNoticesFor, orphanBoards, deleteOrphanBoard, watchersOfBoard };
}
