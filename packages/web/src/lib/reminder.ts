import { t, tn } from './i18n/index.svelte';
import { fromLocal, toLocal } from './nextDue';
import { shortWhen } from './recurrence';

/**
 * Nachhaken: „Wenn nicht erledigt, erinnere mich ab … und wiederhole alle … höchstens N ×“. Die Rechnung ist ein Spiegel von
 * server/src/reminders.ts (firstAt, nextAfter): Der „Ablauf“ in der Oberfläche zeigt genau die Zeitpunkte, zu denen der Server sendet.
 * Ein Test (test/reminder.test.ts) vergleicht beide; bei Änderungen beide anpassen.
 */
export interface ReminderSpec {
  /** due = ab Termin; created = ab dem Anlegen (ohne Termin zählt auch „due“ ab dem Anlegen) */
  anchor: 'due' | 'created';
  afterMin: number;
  /** null = nur einmal */
  everyMin: number | null;
  max: number;
  /** HH:MM, nur bei Tagen/Wochen */
  atTime: string | null;
}

export const DAY_MIN = 1440;
export const REMINDER_MIN = 5;
export const REMINDER_MAX_MIN = 525_600;
export const DEFAULT_MAX = 5;
const MIN = 60_000;

export const firstUsesClock = (spec: Pick<ReminderSpec, 'afterMin'>): boolean => spec.afterMin >= DAY_MIN && spec.afterMin % DAY_MIN === 0;
export const repeatUsesClock = (spec: Pick<ReminderSpec, 'everyMin'>): boolean => spec.everyMin !== null && spec.everyMin >= DAY_MIN && spec.everyMin % DAY_MIN === 0;
/** Hat die Uhrzeit eine Bedeutung? (nur bei Tagen und Wochen) */
export const usesClock = (spec: Pick<ReminderSpec, 'afterMin' | 'everyMin'>): boolean => firstUsesClock(spec) || repeatUsesClock(spec);

const hm = (v: string): { h: number; mi: number } => ({ h: Number(v.slice(0, 2)), mi: Number(v.slice(3, 5)) });

function dayAt(ms: number, days: number, time: string, tz: string): number {
  const l = toLocal(ms, tz);
  const d = new Date(Date.UTC(l.y, l.m - 1, l.d + days));
  return fromLocal({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), ...hm(time), s: 0 }, tz);
}

export function firstAt(spec: ReminderSpec, baseMs: number, tz: string, defaultTime: string): number {
  if (firstUsesClock(spec)) return dayAt(baseMs, spec.afterMin / DAY_MIN, spec.atTime ?? defaultTime, tz);
  return baseMs + spec.afterMin * MIN;
}

export function nextAfter(spec: ReminderSpec, prevMs: number, tz: string, defaultTime: string): number | null {
  if (spec.everyMin === null) return null;
  if (repeatUsesClock(spec)) return dayAt(prevMs, spec.everyMin / DAY_MIN, spec.atTime ?? defaultTime, tz);
  return prevMs + spec.everyMin * MIN;
}

/** Alle Zeitpunkte ab dem ersten: einer ohne Wiederholung, sonst bis zur Höchstzahl */
export function schedule(spec: ReminderSpec, baseMs: number, tz: string, defaultTime: string): number[] {
  const out: number[] = [];
  let at: number | null = firstAt(spec, baseMs, tz, defaultTime);
  const total = spec.everyMin === null ? 1 : spec.max;
  while (at !== null && out.length < total) {
    out.push(at);
    at = nextAfter(spec, at, tz, defaultTime);
  }
  return out;
}

// ---------- Auswahl ----------

export const FIRST_PRESETS = [
  { id: 'h1', min: 60 },
  { id: 'd1', min: DAY_MIN },
  { id: 'd3', min: 3 * DAY_MIN },
  { id: 'w1', min: 7 * DAY_MIN },
] as const;
export type FirstChoice = 'off' | (typeof FIRST_PRESETS)[number]['id'] | 'custom';

export const REPEAT_PRESETS = [
  { id: 'hourly', min: 60 },
  { id: 'daily', min: DAY_MIN },
  { id: 'weekly', min: 7 * DAY_MIN },
] as const;
export type RepeatChoice = 'no' | (typeof REPEAT_PRESETS)[number]['id'] | 'custom';

export const firstChoiceOf = (spec: ReminderSpec | null): FirstChoice => (!spec ? 'off' : (FIRST_PRESETS.find((p) => p.min === spec.afterMin)?.id ?? 'custom'));
export const repeatChoiceOf = (spec: ReminderSpec): RepeatChoice =>
  spec.everyMin === null ? 'no' : (REPEAT_PRESETS.find((p) => p.min === spec.everyMin)?.id ?? 'custom');

export type Unit = 'min' | 'h' | 'd' | 'w';
const UNIT_MIN: Record<Unit, number> = { min: 1, h: 60, d: DAY_MIN, w: 7 * DAY_MIN };

/** 90 → 90 Min., 120 → 2 Std., 4320 → 3 Tage: die größte Einheit, in die es ganz aufgeht */
export function splitMinutes(min: number): { n: number; unit: Unit } {
  for (const unit of ['w', 'd', 'h'] as const) if (min % UNIT_MIN[unit] === 0) return { n: min / UNIT_MIN[unit], unit };
  return { n: min, unit: 'min' };
}
export const toMinutes = (n: number, unit: Unit): number => n * UNIT_MIN[unit];

/** Eine gültige Zeit (5 Minuten bis ein Jahr) aus Zahl und Einheit; sonst null (unfertige Eingabe) */
export function validMinutes(text: string, unit: Unit): number | null {
  const n = Number(text.trim());
  if (text.trim() === '' || !Number.isInteger(n) || n < 1) return null;
  const min = toMinutes(n, unit);
  return min >= REMINDER_MIN && min <= REMINDER_MAX_MIN ? min : null;
}

/** „Höchstens“: 1 bis 99; sonst null */
export function validMax(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

/** Bringt eine Wahl in die Form, die der Server speichert: Uhrzeit nur bei Tagen/Wochen, ohne Wiederholung genau einmal */
export function normalize(spec: ReminderSpec, defaultTime: string): ReminderSpec {
  const out = { ...spec, max: spec.everyMin === null ? 1 : spec.max };
  out.atTime = usesClock(out) ? (spec.atTime ?? defaultTime) : null;
  return out;
}

// ---------- Anzeige ----------

/** Eine Zeile des Ablaufs: wann; `gap` steht für „…“ zwischen dem Anfang und dem letzten Zeitpunkt */
export interface PlanItem {
  when: string;
  last: boolean;
  gap?: boolean;
}

/** Der Ablauf für die Anzeige: höchstens `cap` Einträge, bei mehr der Anfang, „…“ und der letzte Zeitpunkt */
export function plan(spec: ReminderSpec, baseMs: number, tz: string, defaultTime: string, cap = 5): PlanItem[] {
  const all = schedule(spec, baseMs, tz, defaultTime).map((ms) => shortWhen(new Date(ms).toISOString(), tz, true));
  const repeating = all.length > 1;
  const item = (when: string, i: number): PlanItem => ({ when, last: repeating && i === all.length - 1 });
  if (all.length <= cap) return all.map(item);
  return [...all.slice(0, cap - 2).map(item), { when: '…', last: false, gap: true }, item(all[all.length - 1]!, all.length - 1)];
}

/** „Nach 3 Tagen“, „Nach 1 Std.“: die Zeit in Worten, für Beschriftungen */
export function formatSpan(min: number): string {
  if (min % (7 * DAY_MIN) === 0) return tn('{n} Woche', '{n} Wochen', min / (7 * DAY_MIN));
  if (min % DAY_MIN === 0) return tn('{n} Tag', '{n} Tage', min / DAY_MIN);
  if (min % 60 === 0) return t('{n} Std.', { n: min / 60 });
  return t('{n} Min.', { n: min });
}

// ---------- Wächter: Stupsen ----------

/** Das Stupsen eines Wächters: nach `afterMin`, danach alle `everyMin` (null = nur einmal), höchstens `max` ×. Immer ab dem Anlegen bzw. Zuweisen. */
export interface Nudge {
  afterMin: number;
  everyMin: number | null;
  max: number;
}

export const NUDGE_DEFAULT_MAX = 3;

/** Die Zeitpunkte der Stupse (Minuten nach dem Anlegen) */
export function nudgeOffsets(n: Nudge): number[] {
  const total = n.everyMin === null ? 1 : n.max;
  return Array.from({ length: total }, (_, i) => n.afterMin + i * (n.everyMin ?? 0));
}

/** „12:30 · 13:00 · 13:30“ für eine Aufgabe, die um 12:00 angelegt wird; ab dem zweiten Tag mit dem Wochentag */
export function nudgeTimes(n: Nudge, startHm = '12:00'): { text: string; last: boolean }[] {
  const [h, mi] = startHm.split(':').map(Number) as [number, number];
  const base = Date.UTC(2026, 0, 5, h, mi); // ein Montag, nur für die Uhrzeiten
  const offsets = nudgeOffsets(n);
  return offsets.map((off, i) => {
    const d = new Date(base + off * MIN);
    const day = Math.floor((d.getTime() - Date.UTC(2026, 0, 5)) / 86_400_000);
    const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    return { text: day > 0 ? t('+{n} T. {time}', { n: day, time }) : time, last: offsets.length > 1 && i === offsets.length - 1 };
  });
}

/** Wie `nudgeTimes`, gekürzt: bei mehr als `cap` Stupsen der Anfang, „…“ und der letzte */
export function nudgeSteps(n: Nudge, cap = 4, startHm = '12:00'): { text: string; last: boolean; gap?: boolean }[] {
  const all = nudgeTimes(n, startHm);
  if (all.length <= cap) return all;
  return [...all.slice(0, cap - 2), { text: '…', last: false, gap: true }, all[all.length - 1]!];
}

/** „Wird nach 30 Min. nicht erledigt, gibt es bis zu 3 Stups.“ (der Satz in der Vorschau des Wächters) */
export function nudgeSentence(n: Nudge): string {
  const after = formatSpan(n.afterMin);
  if (n.everyMin === null || n.max <= 1) return t('Wird nach {after} nicht erledigt, gibt es einen Stups.', { after });
  return t('Wird nach {after} nicht erledigt, gibt es bis zu {n} Stups.', { after, n: n.max });
}
