import { isBusy } from '../busy.js';
import { fromLocal, toLocal } from '../recurrence.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';

export type FairnessPeriod = 'week' | 'month';

export interface FairnessCounts {
  /** erledigte Karten */
  done: number;
  /** Summe des Aufwands der erledigten Karten (klein 1, mittel 2, groß 3; ohne Angabe mittel) */
  effort: number;
  /** von Hand angelegte Karten (ohne Wiederholungen und Wächter-Karten) */
  created: number;
  /** Stupse, auf die die Person mit „Mach ich" oder „Erledigt" geantwortet hat */
  nudgesAnswered: number;
  /** erledigte Karten, die ein Wächter angelegt hat */
  watcherCards: number;
}

export interface FairnessPerson extends FairnessCounts {
  id: string;
  name: string;
  color: string | null;
  /** „Wenig Zeit" bis zu diesem Tag (nur solange es gilt), sonst null */
  busyUntil: string | null;
}

export interface Fairness {
  period: FairnessPeriod;
  /** Beginn (einschließlich) und Ende (ausschließlich) als UTC */
  from: string;
  to: string;
  /** In der Reihenfolge der Personenliste, nicht nach Wert sortiert */
  people: FairnessPerson[];
  total: FairnessCounts;
  /** Wie viele Karten in dem Zeitraum von Wächtern kamen ("vom Haus") */
  houseCards: number;
}

/** Wer erledigt wie viel? Zahlen aus den Erledigungen, Karten und Stupsen; nur Personen, über alle Boards. */
export function createFairness(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { now, timeZone, all, one } = c;
  const { people } = lazy(s, ['people'] as const);

  /** Woche (Montag 00:00 bis Montag 00:00) oder Monat in der Ortszeit; Grenzen in UTC, auch über eine Zeitumstellung hinweg */
  function bounds(period: FairnessPeriod, nowMs: number, tz: string): { from: number; to: number } {
    const l = toLocal(nowMs, tz);
    const midnight = (y: number, m: number, d: number) => {
      const day = new Date(Date.UTC(y, m, d)); // läuft über Monats- und Jahresgrenzen von selbst über
      return fromLocal({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), h: 0, mi: 0, s: 0 }, tz);
    };
    if (period === 'week') {
      const dow = new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay(); // 0 = Sonntag
      const sinceMonday = (dow + 6) % 7;
      return { from: midnight(l.y, l.m - 1, l.d - sinceMonday), to: midnight(l.y, l.m - 1, l.d - sinceMonday + 7) };
    }
    return { from: midnight(l.y, l.m - 1, 1), to: midnight(l.y, l.m, 1) };
  }

  function fairness(period: FairnessPeriod): Fairness {
    const { from, to } = bounds(period, now().getTime(), timeZone());
    const f = new Date(from).toISOString();
    const t = new Date(to).toISOString();
    // Was nicht zählt: private Boards (nie), Boards, die ausgenommen sind, und Wächter, die ausgenommen sind (nur ihre Karten). Die Abfrage
    // läuft über das Board der Karte und gilt darum rückwirkend: Wer ein Board später ausnimmt, nimmt auch die alten Zahlen heraus.
    const counts = `b.visibility <> 'private' and b.counts_for_fairness = 1 and (c.watcher_id is null or coalesce(w.counts_for_fairness, 1) = 1)`;
    const joins = `join boards b on b.id = c.board_id left join watchers w on w.id = c.watcher_id`;
    const by = <T extends object>(rows: T[], key: keyof T) => new Map(rows.map((r) => [r[key] as string, r]));

    const completed = by(
      all(
        `select co.completed_by as uid, count(*) as n,
                sum(case coalesce(c.effort, 'medium') when 'small' then 1 when 'large' then 3 else 2 end) as effort,
                sum(case when c.watcher_id is not null then 1 else 0 end) as watcher
         from completions co join cards c on c.id = co.card_id ${joins}
         where ${counts} and co.completed_by is not null and co.completed_at >= ? and co.completed_at < ?
         group by co.completed_by`,
        f,
        t,
      ),
      'uid',
    );
    const created = by(
      all(
        `select c.created_by as uid, count(*) as n from cards c ${joins}
         where ${counts} and c.created_by is not null and c.repeated_from is null and c.watcher_id is null and c.created_at >= ? and c.created_at < ?
         group by c.created_by`,
        f,
        t,
      ),
      'uid',
    );
    const answered = by(
      all(
        `select n.to_user as uid, count(*) as n from nudges n join cards c on c.id = n.card_id ${joins}
         where ${counts} and n.reply in ('ack', 'done') and n.reply_at >= ? and n.reply_at < ?
         group by n.to_user`,
        f,
        t,
      ),
      'uid',
    );

    const list: FairnessPerson[] = people().map((p) => ({
      id: p.id,
      name: p.displayName,
      color: p.color,
      busyUntil: isBusy(p.busyUntil, now().getTime(), timeZone()) ? p.busyUntil : null,
      done: completed.get(p.id)?.n ?? 0,
      effort: completed.get(p.id)?.effort ?? 0,
      created: created.get(p.id)?.n ?? 0,
      nudgesAnswered: answered.get(p.id)?.n ?? 0,
      watcherCards: completed.get(p.id)?.watcher ?? 0,
    }));
    const total = list.reduce<FairnessCounts>(
      (sum, p) => ({
        done: sum.done + p.done,
        effort: sum.effort + p.effort,
        created: sum.created + p.created,
        nudgesAnswered: sum.nudgesAnswered + p.nudgesAnswered,
        watcherCards: sum.watcherCards + p.watcherCards,
      }),
      { done: 0, effort: 0, created: 0, nudgesAnswered: 0, watcherCards: 0 },
    );
    const houseCards =
      (one(`select count(*) as n from cards c ${joins} where ${counts} and c.watcher_id is not null and c.created_at >= ? and c.created_at < ?`, f, t)?.n as number | undefined) ?? 0;
    return { period, from: f, to: t, people: list, total, houseCards };
  }

  return { fairness };
}
