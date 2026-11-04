import { dayNumber, weekDays } from './calendar';
import { names } from './i18n/names';
import { deviceTz } from './datetime';
import { dayKeyOf, type ScheduleCard } from './schedule';

/** Die Farbe eines Punktes unter dem Tag: wie dringend die Karte ist (die Oberfläche ordnet jeder Art ein Farbtoken zu) */
export type DotKind = 'overdue' | 'today' | 'upcoming' | 'done';

export interface WeekDay {
  /** YYYY-MM-DD in der Zeitzone des Haushalts */
  key: string;
  /** Tag im Monat */
  number: number;
  today: boolean;
  /** höchstens drei, die dringendsten zuerst */
  dots: DotKind[];
}

const ORDER: Record<DotKind, number> = { overdue: 0, today: 1, upcoming: 2, done: 3 };
export const MAX_DOTS = 3;

/**
 * Die sieben Tage der laufenden Woche (Montag bis Sonntag) mit je bis zu drei Punkten für die Karten dieses Tages.
 * Reine Funktion: Uhr und Zeitzone kommen von außen, damit sie ohne Tageszeit testbar ist.
 */
export function weekStrip(cards: ScheduleCard[], nowMs: number, tz = deviceTz()): WeekDay[] {
  const todayKey = dayKeyOf(nowMs, tz);
  const days = weekDays(todayKey);
  const kinds = new Map<string, DotKind[]>(days.map((d) => [d, []]));
  for (const c of cards) {
    if (!c.dueAt) continue;
    const list = kinds.get(dayKeyOf(Date.parse(c.dueAt), tz));
    if (!list) continue;
    const kind: DotKind = c.completedAt ? 'done' : Date.parse(c.dueAt) < nowMs ? 'overdue' : dayKeyOf(Date.parse(c.dueAt), tz) === todayKey ? 'today' : 'upcoming';
    list.push(kind);
  }
  return days.map((key) => ({
    key,
    number: dayNumber(key),
    today: key === todayKey,
    dots: kinds.get(key)!.sort((a, b) => ORDER[a] - ORDER[b]).slice(0, MAX_DOTS),
  }));
}

/** „Jan 2025": kurzer Monatsname und Jahr des heutigen Tags (über der Wochenleiste, neben „Monatsansicht") */
export function shortMonthTitle(nowMs: number, tz = deviceTz()): string {
  const [y, m] = dayKeyOf(nowMs, tz).split('-');
  return `${names().monthsShort[Number(m) - 1]} ${y}`;
}
