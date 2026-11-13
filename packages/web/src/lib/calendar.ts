import { fromInputValue, deviceTz } from './datetime';
import { dayOfMonth, names } from './i18n/names';
import type { ScheduleCard } from './schedule';

export type CalMode = 'day' | 'days3' | 'week' | 'month';

/** Die Ansichten des Kalenders: Tag, Woche, Monat und die Liste (die frühere Agenda: alle Aufgaben mit Termin nach Tagen) */
export type CalView = CalMode | 'list';

/** Die gemerkte Ansicht von diesem Gerät; Unbekanntes oder nichts ergibt die Woche */
export function parseCalendarView(raw: string | null | undefined): CalView {
  return raw === 'day' || raw === 'days3' || raw === 'month' || raw === 'list' ? raw : 'week';
}

const parts = (key: string): [number, number, number] => {
  const [y, m, d] = key.split('-').map(Number);
  return [y!, m!, d!];
};
const utc = (key: string): Date => {
  const [y, m, d] = parts(key);
  return new Date(Date.UTC(y, m - 1, d));
};
/** Kalendertag in Ortszeit als YYYY-MM-DD */
export const dayKeyOf = (ms: number, tz = deviceTz()): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));

const keyOf = (d: Date): string => d.toISOString().slice(0, 10);

export const addDays = (key: string, n: number): string => keyOf(new Date(utc(key).getTime() + n * 86_400_000));

/** 0 = Montag … 6 = Sonntag */
export const weekdayIndex = (key: string): number => (utc(key).getUTCDay() + 6) % 7;

export const mondayOf = (key: string): string => addDays(key, -weekdayIndex(key));

export const weekDays = (key: string): string[] => {
  const mon = mondayOf(key);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
};

const monthOf = (key: string): string => key.slice(0, 7);
export const firstOfMonth = (key: string): string => `${monthOf(key)}-01`;

/** Wochen (Montag bis Sonntag), die den Monat des Tages ganz abdecken */
export function monthGrid(key: string): string[][] {
  const first = firstOfMonth(key);
  const next = addDays(firstOfMonth(addDays(first, 32)), 0);
  const last = addDays(next, -1);
  const weeks: string[][] = [];
  for (let start = mondayOf(first); start <= last; start = addDays(start, 7)) weeks.push(weekDays(start));
  return weeks;
}

export const inMonth = (day: string, key: string): boolean => monthOf(day) === monthOf(key);

/** Einen Schritt vor oder zurück: Tag, Woche oder Monat */
export function step(mode: CalMode, key: string, dir: 1 | -1): string {
  if (mode === 'day') return addDays(key, dir);
  if (mode === 'days3') return addDays(key, 3 * dir);
  if (mode === 'week') return addDays(key, 7 * dir);
  const [y, m, d] = parts(key);
  const target = new Date(Date.UTC(y, m - 1 + dir, 1));
  const days = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return keyOf(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, days))));
}

/** Sichtbare Tage der Ansicht (für den Monat inklusive der grauen Randtage) */
export function visibleDays(mode: CalMode, key: string): string[] {
  if (mode === 'day') return [key];
  if (mode === 'days3') return [key, addDays(key, 1), addDays(key, 2)];
  if (mode === 'week') return weekDays(key);
  return monthGrid(key).flat();
}

/** Zeitraum für die Abfrage: von 00:00 des ersten bis 00:00 nach dem letzten sichtbaren Tag (Ortszeit) */
export function rangeFor(mode: CalMode, key: string, tz = deviceTz()): { from: string; to: string } {
  const days = visibleDays(mode, key);
  return { from: fromInputValue(`${days[0]}T00:00`, tz)!, to: fromInputValue(`${addDays(days[days.length - 1]!, 1)}T00:00`, tz)! };
}

/** Minuten seit Mitternacht in Ortszeit */
export function minutesOfDay(iso: string, tz = deviceTz()): number {
  const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === 'hour')!.value) % 24;
  return h * 60 + Number(p.find((x) => x.type === 'minute')!.value);
}

/** Zeitpunkt (ISO) für einen Tag und Minuten seit Mitternacht, auf 15 Minuten gerundet */
export function slotIso(key: string, minutes: number, tz = deviceTz()): string {
  const m = Math.max(0, Math.min(23 * 60 + 45, Math.round(minutes / 15) * 15));
  const pad = (n: number) => String(n).padStart(2, '0');
  return fromInputValue(`${key}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`, tz)!;
}

export function cardsByDay<T extends ScheduleCard>(cards: T[], tz = deviceTz()): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const c of [...cards].sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : a.dueAt! > b.dueAt! ? 1 : 0))) {
    const key = dayKeyOf(Date.parse(c.dueAt!), tz);
    out.set(key, [...(out.get(key) ?? []), c]);
  }
  return out;
}

export interface Placed<T> {
  card: T;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** Eine Aufgabe hat nur einen Zeitpunkt; im Raster belegt sie so viele Minuten */
export const BLOCK_MINUTES = 45;

/** Legt die Aufgaben eines Tages ins Zeitraster; überlappende stehen nebeneinander */
export function layoutDay<T extends ScheduleCard>(cards: T[], tz = deviceTz()): Placed<T>[] {
  const items = cards
    .map((card) => ({ card, start: minutesOfDay(card.dueAt!, tz) }))
    .sort((a, b) => a.start - b.start || (a.card.id < b.card.id ? -1 : 1));
  const placed: Placed<T>[] = [];
  let group: { item: (typeof items)[number]; col: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) placed.push({ card: g.item.card, top: g.item.start, height: BLOCK_MINUTES, col: g.col, cols });
    group = [];
  };
  const colEnds: number[] = [];
  for (const item of items) {
    if (group.length > 0 && item.start >= groupEnd) {
      flush();
      colEnds.length = 0;
    }
    let col = colEnds.findIndex((end) => end <= item.start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = item.start + BLOCK_MINUTES;
    group.push({ item, col });
    groupEnd = Math.max(groupEnd, item.start + BLOCK_MINUTES);
  }
  flush();
  return placed;
}

/** Spalte für eine neue Aufgabe mit Termin: nach heute → „Geplant", sonst die erste offene Spalte */
export function columnForNew(columns: { id: string; isDone: boolean; isPlanned: boolean }[], future: boolean): string | undefined {
  const open = columns.find((c) => !c.isDone && !c.isPlanned);
  return (future ? (columns.find((c) => c.isPlanned) ?? open) : open)?.id ?? columns[0]?.id;
}

/** Kopfzeile: „November 2026", „2.–8. Nov 2026" oder „Do 5. Nov 2026" */
export function rangeTitle(mode: CalMode, key: string): string {
  const [y, m, d] = parts(key);
  const { weekdaysShort, monthsShort, monthsLong } = names();
  if (mode === 'month') return `${monthsLong[m - 1]} ${y}`;
  if (mode === 'day') return `${weekdaysShort[utc(key).getUTCDay()]} ${dayOfMonth(d)} ${monthsShort[m - 1]} ${y}`;
  const days = visibleDays(mode, key);
  const [, m1, d1] = parts(days[0]!);
  const [y2, m2, d2] = parts(days[days.length - 1]!);
  return m1 === m2
    ? `${dayOfMonth(d1)}–${dayOfMonth(d2)} ${monthsShort[m2 - 1]} ${y2}`
    : `${dayOfMonth(d1)} ${monthsShort[m1 - 1]} – ${dayOfMonth(d2)} ${monthsShort[m2 - 1]} ${y2}`;
}

export const weekdayShort = (key: string): string => names().weekdaysShort[utc(key).getUTCDay()]!;
export const dayNumber = (key: string): number => parts(key)[2];
