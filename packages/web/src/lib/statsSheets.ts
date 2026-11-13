import { addDays, dayKeyOf, weekdayIndex } from './calendar';
import { deviceTz, fromInputValue, toInputValue } from './datetime';
import { t } from './i18n/index.svelte';
import type { ScheduleCard } from './schedule';
import type { TaskStats } from './tasks';

/**
 * Die drei Blätter hinter der Zahlenleiste in Aufgaben (Heute fällig, Überfällig, Heute erledigt): reine Funktionen, die Uhr und Zeitzone
 * kommen als Parameter (Rechner UTC, Haushalt zum Beispiel Europe/Berlin). Alle Blätter beziehen sich auf die **eigenen** Aufgaben, wie die Leiste
 * (`taskStats` in tasks.ts); die Zahl der Leiste und die Zahl im Blatt kommen aus derselben Regel.
 */

/** Die drei Blätter hinter der Zahlenleiste */
export type StatsKind = 'today' | 'overdue' | 'done';

const mine = (c: ScheduleCard, meId: string | null): boolean => !!meId && c.assigneeIds.includes(meId);
const byDue = (a: ScheduleCard, b: ScheduleCard) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!) || (a.id < b.id ? -1 : 1);
const byDone = (a: ScheduleCard, b: ScheduleCard) => Date.parse(a.completedAt!) - Date.parse(b.completedAt!) || (a.id < b.id ? -1 : 1);

export interface TodaySheet {
  /** noch heute fällig (Termin kommt noch), nach Uhrzeit: genau die Zahl „Heute fällig" der Leiste */
  open: ScheduleCard[];
  /** heute erledigt, Termin heute, nach Erledigungszeit */
  done: ScheduleCard[];
  /** „N Aufgaben für heute": offene und schon erledigte zusammen */
  total: number;
}

/** Heute fällig: die offenen wie die Leiste sie zählt, dazu die heute erledigten Aufgaben mit Termin heute („1 davon schon erledigt") */
export function todaySheet(cards: ScheduleCard[], meId: string | null, nowMs: number, tz = deviceTz()): TodaySheet {
  const todayKey = dayKeyOf(nowMs, tz);
  const open: ScheduleCard[] = [];
  const done: ScheduleCard[] = [];
  for (const c of cards) {
    if (!mine(c, meId) || !c.dueAt) continue;
    const due = Date.parse(c.dueAt);
    if (c.completedAt) {
      if (dayKeyOf(Date.parse(c.completedAt), tz) === todayKey && dayKeyOf(due, tz) === todayKey) done.push(c);
    } else if (due >= nowMs && dayKeyOf(due, tz) === todayKey) open.push(c);
  }
  open.sort(byDue);
  done.sort(byDone);
  return { open, done, total: open.length + done.length };
}

/** Überfällig: eigene offene Aufgaben, deren Termin vorbei ist, die älteste zuerst (die Zahl der Leiste) */
export function overdueSheet(cards: ScheduleCard[], meId: string | null, nowMs: number): ScheduleCard[] {
  return cards.filter((c) => mine(c, meId) && !c.completedAt && !!c.dueAt && Date.parse(c.dueAt) < nowMs).sort(byDue);
}

/** Heute erledigt: eigene Aufgaben, heute (Tag im Haushalt) erledigt, nach Erledigungszeit (die Zahl „Erledigt heute" der Leiste) */
export function doneSheet(cards: ScheduleCard[], meId: string | null, nowMs: number, tz = deviceTz()): ScheduleCard[] {
  const todayKey = dayKeyOf(nowMs, tz);
  return cards.filter((c) => mine(c, meId) && !!c.completedAt && dayKeyOf(Date.parse(c.completedAt), tz) === todayKey).sort(byDone);
}

export interface DoneProgress {
  done: number;
  /** heute fällige (noch offene) + heute erledigte: die „7" in „4 von 7 geschafft"; überfällige zählen nicht mit (sie haben ein eigenes Blatt) */
  total: number;
  open: number;
  /** 0 bis 1 für den Ring; ohne Aufgaben 0 */
  fraction: number;
}

/** Ring und Text von „Heute erledigt": aus den Zahlen der Leiste (heute fällig + erledigt = Gesamtzahl für heute) */
export function doneProgress(stats: TaskStats): DoneProgress {
  const total = stats.today + stats.done;
  return { done: stats.done, total, open: stats.today, fraction: total > 0 ? stats.done / total : 0 };
}

export type Since = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'days'; n: number };

/** Wie lange eine Aufgabe überfällig ist, nach Kalendertagen im Haushalt (nicht nach 24-Stunden-Blöcken: die Zeitumstellung zählt nicht mit) */
export function overdueSince(dueAt: string, nowMs: number, tz = deviceTz()): Since {
  const days = Math.round((Date.parse(`${dayKeyOf(nowMs, tz)}T00:00:00Z`) - Date.parse(`${dayKeyOf(Date.parse(dueAt), tz)}T00:00:00Z`)) / 86_400_000);
  return days <= 0 ? { kind: 'today' } : days === 1 ? { kind: 'yesterday' } : { kind: 'days', n: days };
}

/** „seit heute", „seit gestern", „seit 2 Tagen" */
export function overdueSinceText(dueAt: string, nowMs: number, tz = deviceTz()): string {
  const s = overdueSince(dueAt, nowMs, tz);
  return s.kind === 'today' ? t('seit heute') : s.kind === 'yesterday' ? t('seit gestern') : t('seit {n} Tagen', { n: s.n });
}

/** Uhrzeit (HH:MM) in der Zeitzone des Haushalts */
export const timeOfDay = (iso: string, tz = deviceTz()): string => toInputValue(iso, tz).slice(11);

export type ShiftTarget = 'today' | 'tomorrow' | 'weekend';

/**
 * Das neue Fälligkeitsdatum beim Verschieben einer überfälligen Aufgabe: gleiche Uhrzeit (Ortszeit des Haushalts, Sekunden bleiben) an
 * - `tomorrow`: dem morgigen Tag,
 * - `weekend`: dem nächsten Samstag nach heute (am Samstag und Sonntag der folgende),
 * - `today`: dem heutigen Tag. Ist die Uhrzeit schon vorbei, die nächste volle Stunde (spätestens 23:59), sonst bliebe die Aufgabe überfällig.
 * Eine Uhrzeit, die es durch die Zeitumstellung nicht gibt (02:30 am letzten Märzsonntag), rückt hinter die Lücke.
 */
export function shiftDue(dueAt: string, target: ShiftTarget, nowMs: number, tz = deviceTz()): string {
  const todayKey = dayKeyOf(nowMs, tz);
  const time = toInputValue(dueAt, tz).slice(11);
  const subMinute = Date.parse(dueAt) % 60_000;
  const at = (day: string, hhmm: string) => Date.parse(fromInputValue(`${day}T${hhmm}`, tz)!) + subMinute;
  if (target === 'tomorrow') return new Date(at(addDays(todayKey, 1), time)).toISOString();
  if (target === 'weekend') {
    const toSaturday = (5 - weekdayIndex(todayKey) + 7) % 7 || 7;
    return new Date(at(addDays(todayKey, toSaturday), time)).toISOString();
  }
  const same = at(todayKey, time);
  if (same >= nowMs) return new Date(same).toISOString();
  const hour = Number(toInputValue(new Date(nowMs).toISOString(), tz).slice(11, 13));
  const next = hour < 23 ? at(todayKey, `${String(hour + 1).padStart(2, '0')}:00`) - subMinute : at(todayKey, '23:59') - subMinute;
  return new Date(next).toISOString();
}
