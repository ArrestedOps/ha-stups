import { t } from '../i18n/index.js';
import { fromLocal, toLocal } from '../recurrence.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { Card } from './types.js';

/** Eine Aufgabe auf der Startseite „Heute" */
export interface TodayCard {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  dueAt: string | null;
  assigneeIds: string[];
  /** Wächter, der die Aufgabe angelegt hat (null: von Hand) */
  watcherId: string | null;
  watcherName: string | null;
  createdAt: string;
  /** Warum diese Person dran ist („reihum unter allen, die zu Hause sind"); nur bei Aufgaben vom Haus */
  why: string | null;
}

export interface Today {
  /** Offene Aufgaben von Wächtern, die mir zugewiesen sind oder noch niemandem (neueste zuerst) */
  house: TodayCard[];
  /** Meine offenen Aufgaben mit Termin bis Ende morgen, nach Termin */
  mine: TodayCard[];
  /** Offene Aufgaben der anderen Personen (leer für ein Kind) */
  others: { personId: string; open: number }[];
}

/** Die Startseite: was für eine Person heute ansteht, was vom Haus kam und was die anderen zu tun haben */
export function createToday(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { all, one, now, timeZone } = c;
  const { loadCards, people, userById, visibleBoardsSql } = lazy(s, ['loadCards', 'people', 'userById', 'visibleBoardsSql'] as const);

  /** Der Satz „warum bin ich dran?" nach der Zuweisungsart des Wächters (null, wenn es nichts zu sagen gibt) */
  function whyOfWatcher(watcherId: string, assigned: boolean): string | null {
    let mode: unknown;
    try {
      mode = (JSON.parse(one('select assign_json from watchers where id = ?', watcherId)?.assign_json ?? '{}') as { mode?: unknown }).mode;
    } catch {
      return null;
    }
    if (mode === 'suggest') return assigned ? null : t('Wer übernimmt?');
    if (!assigned) return null;
    if (mode === 'rotation') return t('reihum unter allen');
    if (mode === 'rotation_present') return t('reihum unter allen, die zu Hause sind');
    if (mode === 'all_present') return t('weil du zu Hause bist');
    if (mode === 'first_home') return t('weil du als Erste oder Erster heimgekommen bist');
    if (mode === 'fixed') return t('weil die Aufgabe fest dir zugewiesen ist');
    return null;
  }

  /** Anfang des Tages nach morgen in Ortszeit: bis dahin (ausschließlich) gilt eine Aufgabe als „heute oder morgen" */
  function endOfTomorrow(nowMs: number, tz: string): number {
    const l = toLocal(nowMs, tz);
    const day = new Date(Date.UTC(l.y, l.m - 1, l.d + 2)); // läuft über Monats- und Jahresgrenzen von selbst über
    return fromLocal({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), h: 0, mi: 0, s: 0 }, tz);
  }

  function today(userId: string, nowMs = now().getTime(), tz = timeZone()): Today {
    const child = userById(userId)?.isChild === true;
    // Aufgaben, die auf Bestätigung warten, sind aus Sicht der Person erledigt
    // Nur Boards, die diese Person sieht (private Boards anderer erscheinen nie, auch nicht in den Zahlen der anderen)
    const seen = visibleBoardsSql(userId);
    const open = loadCards(
      `completed_at is null and deleted_at is null and archived_at is null and confirm_requested_at is null and board_id in (${seen.sql})`,
      ...seen.args,
    );
    const boards = new Map(all(`select b.id, b.name from boards b where b.id in (${seen.sql})`, ...seen.args).map((b) => [b.id as string, b.name as string]));
    const watchers = new Map(all('select id, name from watchers').map((w) => [w.id as string, w.name as string]));
    const view = (card: Card, withWhy: boolean): TodayCard => ({
      id: card.id,
      title: card.title,
      boardId: card.boardId,
      boardName: boards.get(card.boardId) ?? '',
      dueAt: card.dueAt,
      assigneeIds: card.assigneeIds,
      watcherId: card.watcherId,
      watcherName: card.watcherId ? (watchers.get(card.watcherId) ?? null) : null,
      createdAt: card.createdAt,
      why: withWhy && card.watcherId ? whyOfWatcher(card.watcherId, card.assigneeIds.length > 0) : null,
    });

    const mineCard = (card: Card) => card.assigneeIds.includes(userId);
    const house = open
      // Ein Kind sieht nur Aufgaben vom Haus, die ihm zugewiesen sind; Erwachsene auch die, die noch niemand übernommen hat
      .filter((card) => card.watcherId !== null && (mineCard(card) || (!child && card.assigneeIds.length === 0)))
      .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1))
      .map((card) => view(card, true));

    const limit = endOfTomorrow(nowMs, tz);
    const mine = open
      .filter((card) => card.watcherId === null && mineCard(card) && card.dueAt !== null && Date.parse(card.dueAt) < limit)
      .sort((a, b) => (a.dueAt === b.dueAt ? 0 : a.dueAt! < b.dueAt! ? -1 : 1))
      .map((card) => view(card, false));

    const others: Today['others'] = [];
    if (!child) {
      for (const p of people()) {
        if (p.id === userId) continue;
        const n = open.filter((card) => card.assigneeIds.includes(p.id)).length;
        if (n > 0) others.push({ personId: p.id, open: n });
      }
    }
    return { house, mine, others };
  }

  return { today };
}
