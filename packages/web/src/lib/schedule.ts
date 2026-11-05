import type { Card, Priority, ScheduleCard } from './api';
import { addDays, mondayOf } from './calendar';
import { CATEGORY_COLORS } from './colors';
import { deviceTz, fromInputValue } from './datetime';
import { t, tn } from './i18n/index.svelte';
import { dayOfMonth, names } from './i18n/names';

export type { ScheduleCard };

/** Die Gruppen von „Wann": so ordnet auch die Liste in Aufgaben ihre Karten */
export type WhenKey = 'overdue' | 'today' | 'week' | 'later' | 'undated';
export const WHEN_KEYS: readonly WhenKey[] = ['overdue', 'today', 'week', 'later', 'undated'];
export type SortKey = 'due' | 'priority' | 'newest';
export const SORT_KEYS: readonly SortKey[] = ['due', 'priority', 'newest'];
const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

/**
 * Das eine Filtermodell für Aufgaben und Kalender (Blatt „Filter"): wessen Karten, wann, welche Boards, welche Priorität,
 * nur mit offenem Stups, nur von Wächtern, ob Erledigtes dabei ist und wie sortiert wird. Wird pro Gerät gemerkt (`stups.schedule`).
 */
export interface ScheduleFilter {
  /** leer = alle Personen (zusammen mit `unassigned`) */
  personIds: string[];
  /** auch Karten ohne Zuständige */
  unassigned: boolean;
  /** leer = alle Boards */
  boardIds: string[];
  showDone: boolean;
  /** leer = alle Karten mit Termin; mehrere Gruppen gelten zusammen (eine davon genügt); „Ohne Termin" holt die Karten ohne Termin dazu */
  when: WhenKey[];
  /** null = alle */
  priority: Priority | null;
  /** nur Karten mit einem offenen Stups an mich */
  nudged: boolean;
  /** nur Karten, die ein Wächter angelegt hat */
  watcherOnly: boolean;
  sort: SortKey;
}

/** Was zum Filtern außer dem Filter selbst nötig ist: wer ich bin, die Uhr und die Zeitzone */
export interface FilterContext {
  meId: string | null;
  nowMs: number;
  tz: string;
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

export const DEFAULT_FILTER: ScheduleFilter = {
  personIds: [],
  unassigned: false,
  boardIds: [],
  showDone: false,
  when: [],
  priority: null,
  nudged: false,
  watcherOnly: false,
  sort: 'due',
};

export const personFilterActive = (f: ScheduleFilter): boolean => f.personIds.length > 0 || f.unassigned;

/** Wie viele Teile des Filters von der Voreinstellung abweichen (Wer, Wann, Boards, Priorität, Stups, Wächter, Erledigte, Sortierung) */
export const activeFilterCount = (f: ScheduleFilter): number => extraFilterCount(f) + (f.personIds.length > 0 ? 1 : 0);

/**
 * Wie activeFilterCount, aber ohne die Auswahl der Personen: Die steht schon in den Chips über der Liste („Meine", Personen),
 * der Zähler am Knopf „Filter" zeigt nur, was sonst verborgen bleibt („Niemand" gehört dazu).
 */
export const extraFilterCount = (f: ScheduleFilter): number =>
  [
    f.unassigned,
    f.when.length > 0,
    f.boardIds.length > 0,
    f.priority !== null,
    f.nudged,
    f.watcherOnly,
    f.showDone,
    f.sort !== DEFAULT_FILTER.sort,
  ].filter(Boolean).length;

export const isFiltered = (f: ScheduleFilter): boolean => activeFilterCount(f) > 0;

/**
 * Der Filter, der wirklich gilt: Ein Kind sieht nur eigene Karten und kennt weder „Wer" noch „nur von Wächtern"
 * (Wächter sind für Kinder nicht sichtbar). Erwachsene: derselbe Filter.
 */
export const effectiveFilter = (f: ScheduleFilter, isChild: boolean): ScheduleFilter =>
  isChild ? { ...f, personIds: [], unassigned: false, watcherOnly: false } : f;

// ---------- „Wann": Gruppen und Grenzen ----------

/** Beginn von morgen und von nächster Woche (Montag 00:00) in der Zeitzone des Haushalts, in Millisekunden */
export function whenBounds(nowMs: number, tz = deviceTz()): { todayKey: string; startTomorrow: number; startNextWeek: number } {
  const todayKey = dayKeyOf(nowMs, tz);
  return {
    todayKey,
    startTomorrow: Date.parse(fromInputValue(`${addDays(todayKey, 1)}T00:00`, tz)!),
    startNextWeek: Date.parse(fromInputValue(`${addDays(mondayOf(todayKey), 7)}T00:00`, tz)!),
  };
}

/**
 * Die Gruppe von „Wann", in die eine Karte fällt. Offen: Termin vorbei = Überfällig, sonst Heute (bis 24 Uhr), Diese Woche (ab morgen bis Sonntag),
 * Später. Erledigte zählen nach dem Tag des Termins (heute erledigt = Heute); liegt der Tag davor, gehören sie zu keiner Gruppe (null).
 */
export function whenOf(c: Pick<Card, 'dueAt' | 'completedAt'>, nowMs: number, tz = deviceTz()): WhenKey | null {
  if (!c.dueAt) return 'undated';
  const due = Date.parse(c.dueAt);
  const { todayKey, startTomorrow, startNextWeek } = whenBounds(nowMs, tz);
  if (c.completedAt) {
    if (dayKeyOf(due, tz) < todayKey) return null;
  } else if (due < nowMs) return 'overdue';
  return due < startTomorrow ? 'today' : due < startNextWeek ? 'week' : 'later';
}

// ---------- Filtern ----------

type Facet = 'person' | 'board' | 'when';
const defaultContext = (): FilterContext => ({ meId: null, nowMs: Date.now(), tz: deviceTz() });

/** Besteht die Karte den Filter? `skip` lässt eine Gruppe von Bedingungen weg (für die Zahlen an den Chips) */
function passes(c: ScheduleCard, f: ScheduleFilter, ctx: FilterContext, skip?: Facet): boolean {
  if (skip !== 'person' && personFilterActive(f) && !(c.assigneeIds.some((id) => f.personIds.includes(id)) || (f.unassigned && c.assigneeIds.length === 0))) return false;
  if (skip !== 'board' && f.boardIds.length > 0 && !f.boardIds.includes(c.boardId)) return false;
  if (skip !== 'when') {
    if (!c.dueAt) {
      if (!f.when.includes('undated')) return false;
    } else if (f.when.length > 0) {
      const w = whenOf(c, ctx.nowMs, ctx.tz);
      if (!w || !f.when.includes(w)) return false;
    }
  }
  if (!f.showDone && c.completedAt) return false;
  if (f.priority && c.priority !== f.priority) return false;
  if (f.nudged && (!ctx.meId || !(c.openNudges ?? []).some((n) => n.toId === ctx.meId))) return false;
  if (f.watcherOnly && !c.watcherId) return false;
  return true;
}

export function filterSchedule<T extends ScheduleCard>(cards: T[], f: ScheduleFilter, ctx: FilterContext = defaultContext()): T[] {
  return cards.filter((c) => passes(c, f, ctx));
}

/** Zahlen an den Personen-Chips: so viele Karten blieben übrig, wenn man genau diese Person wählt (alle anderen Filter gelten mit) */
export function personCounts(
  cards: ScheduleCard[],
  f: ScheduleFilter,
  ctx: FilterContext = defaultContext(),
): { byPerson: Record<string, number>; unassigned: number } {
  const base = cards.filter((c) => passes(c, f, ctx, 'person'));
  const byPerson: Record<string, number> = {};
  for (const c of base) for (const id of c.assigneeIds) byPerson[id] = (byPerson[id] ?? 0) + 1;
  return { byPerson, unassigned: base.filter((c) => c.assigneeIds.length === 0).length };
}

/** Zahlen an den Board-Chips (alle anderen Filter gelten mit) */
export function boardCounts(cards: ScheduleCard[], f: ScheduleFilter, ctx: FilterContext = defaultContext()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) if (passes(c, f, ctx, 'board')) out[c.boardId] = (out[c.boardId] ?? 0) + 1;
  return out;
}

/** Zahlen an den Chips von „Wann": so viele blieben übrig, wenn man genau diese Gruppe wählt (alle anderen Filter gelten mit) */
export function whenCounts(cards: ScheduleCard[], f: ScheduleFilter, ctx: FilterContext = defaultContext()): Record<WhenKey, number> {
  const out: Record<WhenKey, number> = { overdue: 0, today: 0, week: 0, later: 0, undated: 0 };
  for (const c of cards) {
    if (!passes(c, f, ctx, 'when')) continue;
    const w = whenOf(c, ctx.nowMs, ctx.tz);
    if (w) out[w] += 1;
  }
  return out;
}

export const toggleId = <T extends string>(list: T[], id: T): T[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

// ---------- Sortieren ----------

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** nach Termin, Karten ohne Termin zuletzt */
const byDueDate = (a: ScheduleCard, b: ScheduleCard): number => {
  if (a.dueAt === b.dueAt) return byId(a, b);
  if (!a.dueAt) return 1;
  if (!b.dueAt) return -1;
  return a.dueAt < b.dueAt ? -1 : 1;
};

/** Sortiert eine Kopie: Fälligkeit, Priorität (hoch zuerst, dann nach Termin) oder Neueste (zuletzt angelegt zuerst); Gleiches nach Nummer */
export function sortCards<T extends ScheduleCard>(cards: T[], sort: SortKey): T[] {
  const out = [...cards];
  if (sort === 'priority') {
    return out.sort((a, b) => (PRIORITY_RANK[a.priority ?? ''] ?? 3) - (PRIORITY_RANK[b.priority ?? ''] ?? 3) || byDueDate(a, b));
  }
  if (sort === 'newest') return out.sort((a, b) => (a.createdAt === b.createdAt ? byId(a, b) : a.createdAt < b.createdAt ? 1 : -1));
  return out.sort(byDueDate);
}

// ---------- Merkzettel ----------

/**
 * Liest den gemerkten Filter von diesem Gerät (`stups.schedule`). Ohne Merkzettel: null (der Aufrufer entscheidet über die Voreinstellung).
 * Ältere Fassungen ohne die neuen Felder lesen weiter; Unbekanntes (gelöschte Personen und Boards, ungültige Werte) fällt weg,
 * Kaputtes ergibt den Standardfilter. Ein Kind behält weder „Wer" noch „nur von Wächtern".
 */
export function parseScheduleFilter(
  raw: string | null | undefined,
  known: { personIds: string[]; boardIds: string[] },
  opts: { isChild?: boolean } = {},
): ScheduleFilter | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_FILTER };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULT_FILTER };
  const r = v as Record<string, unknown>;
  const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : []);
  const out: ScheduleFilter = {
    personIds: strings(r.personIds).filter((id) => known.personIds.includes(id)),
    unassigned: r.unassigned === true,
    boardIds: strings(r.boardIds).filter((id) => known.boardIds.includes(id)),
    showDone: r.showDone === true,
    when: strings(r.when).filter((w): w is WhenKey => (WHEN_KEYS as readonly string[]).includes(w)),
    priority: PRIORITIES.find((p) => p === r.priority) ?? null,
    nudged: r.nudged === true,
    watcherOnly: r.watcherOnly === true,
    sort: SORT_KEYS.find((s) => s === r.sort) ?? DEFAULT_FILTER.sort,
  };
  return effectiveFilter(out, opts.isChild === true);
}

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
