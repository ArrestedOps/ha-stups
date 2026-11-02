import type { Card, ScheduleCard } from './api';
import { CATEGORY_COLORS } from './colors';
import { deviceTz } from './datetime';
import { t, tn } from './i18n/index.svelte';
import { dayOfMonth, names } from './i18n/names';

export type { ScheduleCard };

/** Filter für Agenda und Kalender: wessen Karten, welche Boards, ob Erledigtes mit dabei ist */
export interface ScheduleFilter {
  /** leer = alle Personen (zusammen mit `unassigned`) */
  personIds: string[];
  /** auch Karten ohne Zuständige */
  unassigned: boolean;
  /** leer = alle Boards */
  boardIds: string[];
  showDone: boolean;
}

/** So viele Tage lädt die Agenda zuerst und bei „Weitere Tage laden" jeweils dazu */
export const AGENDA_STEP_DAYS = 60;
const AGENDA_FIRST_LOOKAHEAD_DAYS = 365;

/**
 * Ist im ersten Zeitraum keine einzige Karte mit Termin, schaut die Agenda gleich ein Jahr voraus: Sonst bliebe sie leer,
 * obwohl später Karten anstehen (die man im Kalender sieht). Gibt die neue Zahl der Tage zurück, oder null, wenn nichts zu tun ist.
 */
export const agendaHorizonAfterLoad = (loaded: number, days: number): number | null =>
  loaded === 0 && days === AGENDA_STEP_DAYS ? AGENDA_FIRST_LOOKAHEAD_DAYS : null;

export const DEFAULT_FILTER: ScheduleFilter = { personIds: [], unassigned: false, boardIds: [], showDone: false };

export const personFilterActive = (f: ScheduleFilter): boolean => f.personIds.length > 0 || f.unassigned;
export const isFiltered = (f: ScheduleFilter): boolean => personFilterActive(f) || f.boardIds.length > 0 || f.showDone;

const passesPerson = (c: Pick<Card, 'assigneeIds'>, f: ScheduleFilter): boolean =>
  !personFilterActive(f) || c.assigneeIds.some((id) => f.personIds.includes(id)) || (f.unassigned && c.assigneeIds.length === 0);
const passesBoard = (c: Pick<Card, 'boardId'>, f: ScheduleFilter): boolean => f.boardIds.length === 0 || f.boardIds.includes(c.boardId);
const passesDone = (c: Pick<Card, 'completedAt'>, f: ScheduleFilter): boolean => f.showDone || !c.completedAt;

export function filterSchedule<T extends ScheduleCard>(cards: T[], f: ScheduleFilter): T[] {
  return cards.filter((c) => passesPerson(c, f) && passesBoard(c, f) && passesDone(c, f));
}

/** Zahlen an den Personen-Chips: so viele Karten blieben übrig, wenn man genau diese Person wählt (Board-Filter gilt mit) */
export function personCounts(cards: ScheduleCard[], f: ScheduleFilter): { byPerson: Record<string, number>; unassigned: number } {
  const base = cards.filter((c) => passesBoard(c, f) && passesDone(c, f));
  const byPerson: Record<string, number> = {};
  for (const c of base) for (const id of c.assigneeIds) byPerson[id] = (byPerson[id] ?? 0) + 1;
  return { byPerson, unassigned: base.filter((c) => c.assigneeIds.length === 0).length };
}

/** Zahlen an den Board-Chips (Personen-Filter gilt mit) */
export function boardCounts(cards: ScheduleCard[], f: ScheduleFilter): Record<string, number> {
  const base = cards.filter((c) => passesPerson(c, f) && passesDone(c, f));
  const out: Record<string, number> = {};
  for (const c of base) out[c.boardId] = (out[c.boardId] ?? 0) + 1;
  return out;
}

export const toggleId = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

// ---------- Gruppieren nach Tag ----------

export interface DaySection {
  key: string;
  title: string;
  /** zweite Zeile, z. B. „Sa 31. Okt · 2 Karten" */
  sub: string;
  overdue: boolean;
  today: boolean;
  cards: ScheduleCard[];
}

/** Kalendertag in Ortszeit als YYYY-MM-DD */
export const dayKeyOf = (ms: number, tz = deviceTz()): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));

const dayNumber = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
};

/** „Sa 31. Okt" (mit Jahr, wenn es nicht das laufende ist) */
export function dayLabel(key: string, nowKey: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const wd = names().weekdaysShort[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
  const sameYear = key.slice(0, 4) === nowKey.slice(0, 4);
  return `${wd} ${dayOfMonth(d!)} ${names().monthsShort[m! - 1]}${sameYear ? '' : ` ${y}`}`;
}

const cardsText = (n: number) => tn('{n} Karte', '{n} Karten', n);

/**
 * Teilt die Karten in „Überfällig" (offen, Termin vorbei) und je einen Abschnitt pro Tag, der Karten hat.
 * Tage ohne Karten fehlen, die Reihenfolge ist nach Termin.
 */
export function groupByDay(cards: ScheduleCard[], nowMs = Date.now(), tz = deviceTz()): DaySection[] {
  const nowKey = dayKeyOf(nowMs, tz);
  const sorted = [...cards].sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : a.dueAt! > b.dueAt! ? 1 : 0));
  const overdue = sorted.filter((c) => !c.completedAt && Date.parse(c.dueAt!) < nowMs);
  const rest = sorted.filter((c) => !overdue.includes(c));

  const sections: DaySection[] = [];
  if (overdue.length > 0) {
    sections.push({ key: 'overdue', title: t('Überfällig'), sub: cardsText(overdue.length), overdue: true, today: false, cards: overdue });
  }
  const byDay = new Map<string, ScheduleCard[]>();
  for (const c of rest) {
    const key = dayKeyOf(Date.parse(c.dueAt!), tz);
    byDay.set(key, [...(byDay.get(key) ?? []), c]);
  }
  for (const [key, list] of byDay) {
    const diff = dayNumber(key) - dayNumber(nowKey);
    const title = diff === 0 ? t('Heute') : diff === 1 ? t('Morgen') : diff === -1 ? t('Gestern') : dayLabel(key, nowKey);
    const sub = diff >= -1 && diff <= 1 ? `${dayLabel(key, nowKey)} · ${cardsText(list.length)}` : cardsText(list.length);
    sections.push({ key, title, sub, overdue: false, today: diff === 0, cards: list });
  }
  return sections;
}

// ---------- Boardfarbe ----------

const PALETTE = ['orange', 'blue', 'mint', 'pink', 'purple', 'yellow', 'teal', 'indigo'] as const;

/** Farbname eines Boards (für Balken und Punkte): die eigene Farbe, sonst eine feste Reihenfolge nach Position */
export function boardColorKey(boardColor: string | null, index: number): string {
  if (boardColor && (CATEGORY_COLORS as readonly string[]).includes(boardColor)) return boardColor;
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]!;
}
