import { addDays, mondayOf } from './calendar';
import { deviceTz, fromInputValue } from './datetime';
import { t } from './i18n/index.svelte';
import { dayKeyOf, type ScheduleCard } from './schedule';

/** Die Ansichten in Aufgaben: die gruppierte Liste und die Kalenderansichten Tag, Woche, Monat */
export type TasksView = 'list' | 'day' | 'week' | 'month';

/** Die gemerkte Ansicht von diesem Gerät (auch ein alter Merkzettel des Kalenders); Unbekanntes oder nichts ergibt die Liste */
export function parseTasksView(raw: string | null | undefined): TasksView {
  return raw === 'day' || raw === 'week' || raw === 'month' ? raw : 'list';
}

export type TaskGroupKey = 'overdue' | 'today' | 'week' | 'later' | 'done';

export interface TaskGroup {
  key: TaskGroupKey;
  title: string;
  cards: ScheduleCard[];
}

const byDue = (a: ScheduleCard, b: ScheduleCard): number => (a.dueAt! < b.dueAt! ? -1 : a.dueAt! > b.dueAt! ? 1 : a.id < b.id ? -1 : 1);

/**
 * Teilt Karten mit Termin in Überfällig (Termin vorbei), Heute (noch heute), Diese Woche (ab morgen bis Sonntag) und Später.
 * Die Grenzen 00:00 gelten in der Zeitzone des Haushalts. Erledigte stehen nur mit `withDone` und dann in einer eigenen Gruppe am Ende.
 * Leere Gruppen fehlen.
 */
export function groupTasks(cards: ScheduleCard[], nowMs: number, tz = deviceTz(), opts: { withDone?: boolean } = {}): TaskGroup[] {
  const todayKey = dayKeyOf(nowMs, tz);
  const startTomorrow = Date.parse(fromInputValue(`${addDays(todayKey, 1)}T00:00`, tz)!);
  const startNextWeek = Date.parse(fromInputValue(`${addDays(mondayOf(todayKey), 7)}T00:00`, tz)!);
  const groups: Record<TaskGroupKey, ScheduleCard[]> = { overdue: [], today: [], week: [], later: [], done: [] };
  for (const c of [...cards].filter((x) => x.dueAt).sort(byDue)) {
    if (c.completedAt) {
      groups.done.push(c);
      continue;
    }
    const due = Date.parse(c.dueAt!);
    if (due < nowMs) groups.overdue.push(c);
    else if (due < startTomorrow) groups.today.push(c);
    else if (due < startNextWeek) groups.week.push(c);
    else groups.later.push(c);
  }
  const titles: Record<TaskGroupKey, string> = { overdue: t('Überfällig'), today: t('Heute'), week: t('Diese Woche'), later: t('Später'), done: t('Erledigt') };
  const keys: TaskGroupKey[] = opts.withDone ? ['overdue', 'today', 'week', 'later', 'done'] : ['overdue', 'today', 'week', 'later'];
  return keys.filter((k) => groups[k].length > 0).map((key) => ({ key, title: titles[key], cards: groups[key] }));
}

export interface TaskStats {
  /** noch heute fällig (Termin nicht vorbei) */
  today: number;
  /** Termin vorbei, noch offen */
  overdue: number;
  /** heute erledigt */
  done: number;
}

/**
 * Die drei Zahlen der Leiste oben: nur die eigenen (Karten, die der Person zugewiesen sind), ohne Vergleich mit anderen.
 * „Erledigt" heißt: heute (in der Zeitzone des Haushalts) erledigt.
 */
export function taskStats(cards: ScheduleCard[], meId: string | null, nowMs: number, tz = deviceTz()): TaskStats {
  const out: TaskStats = { today: 0, overdue: 0, done: 0 };
  if (!meId) return out;
  const todayKey = dayKeyOf(nowMs, tz);
  for (const c of cards) {
    if (!c.assigneeIds.includes(meId)) continue;
    if (c.completedAt) {
      if (dayKeyOf(Date.parse(c.completedAt), tz) === todayKey) out.done += 1;
      continue;
    }
    if (!c.dueAt) continue;
    const due = Date.parse(c.dueAt);
    if (due < nowMs) out.overdue += 1;
    else if (dayKeyOf(due, tz) === todayKey) out.today += 1;
  }
  return out;
}

/** Karten, bei denen ein Stups an mich offen ist (für das Banner oben): mit den Absendern, ohne Doppelte; Erledigtes zählt nicht */
export function nudgesToMe(cards: ScheduleCard[], meId: string | null): { card: ScheduleCard; fromIds: string[] }[] {
  if (!meId) return [];
  const out: { card: ScheduleCard; fromIds: string[] }[] = [];
  for (const card of cards) {
    if (card.completedAt) continue;
    const fromIds = [...new Set((card.openNudges ?? []).filter((n) => n.toId === meId).map((n) => n.fromId))];
    if (fromIds.length > 0) out.push({ card, fromIds });
  }
  return out;
}
