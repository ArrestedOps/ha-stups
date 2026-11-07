import { ValidationError } from './errors.js';
import { t } from './i18n/index.js';
import { isHm } from './quiet.js';
import { fromLocal, toLocal } from './recurrence.js';

/**
 * Nachhaken: „Wenn nicht erledigt, erinnere mich ab … und wiederhole alle … höchstens N ×“. Eine Regel für Aufgaben (persönlich) und für
 * Wächter (an die jeweils Zuständigen). Alle Zeiten in Minuten; Tage und Wochen sind ganze Vielfache von 1440.
 */
export interface ReminderSpec {
  /** due = ab Termin; created = ab dem Anlegen bzw. Zuweisen (ohne Termin zählt auch „due“ ab dem Anlegen) */
  anchor: 'due' | 'created';
  afterMin: number;
  /** null = nur einmal */
  everyMin: number | null;
  max: number;
  /** HH:MM, nur bei Tagen/Wochen; null = die Uhrzeit der Add-on-Option `overdue_nag_time` */
  atTime: string | null;
}

export const REMINDER_MIN = 5;
export const REMINDER_MAX_MIN = 525_600; // ein Jahr
export const REMINDER_DEFAULT_MAX = 5;
const DAY_MIN = 1440;
const MIN = 60_000;

/** Beginnt der erste Zeitpunkt an einem Tag zur Uhrzeit? (nur bei ganzen Tagen/Wochen) */
export const firstUsesClock = (spec: Pick<ReminderSpec, 'afterMin'>): boolean => spec.afterMin >= DAY_MIN && spec.afterMin % DAY_MIN === 0;
/** Folgen die Wiederholungen jeweils an einem Tag zur Uhrzeit? */
export const repeatUsesClock = (spec: Pick<ReminderSpec, 'everyMin'>): boolean => spec.everyMin !== null && spec.everyMin >= DAY_MIN && spec.everyMin % DAY_MIN === 0;
/** Hat die Uhrzeit überhaupt eine Bedeutung? */
export const usesClock = (spec: Pick<ReminderSpec, 'afterMin' | 'everyMin'>): boolean => firstUsesClock(spec) || repeatUsesClock(spec);

const hm = (v: string): { h: number; mi: number } => ({ h: Number(v.slice(0, 2)), mi: Number(v.slice(3, 5)) });

/** Ortsdatum von `ms` plus `days` Tage, um `time` Uhr (Ortszeit, Zeitumstellung beachtet) */
function dayAt(ms: number, days: number, time: string, tz: string): number {
  const l = toLocal(ms, tz);
  const d = new Date(Date.UTC(l.y, l.m - 1, l.d + days));
  return fromLocal({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), ...hm(time), s: 0 }, tz);
}

/** Der erste Zeitpunkt: `baseMs` (Termin bzw. Anlegen) plus `afterMin`; bei ganzen Tagen zur Uhrzeit. `defaultTime`: Voreinstellung bei leerer Uhrzeit */
export function firstAt(spec: ReminderSpec, baseMs: number, tz: string, defaultTime: string): number {
  if (firstUsesClock(spec)) return dayAt(baseMs, spec.afterMin / DAY_MIN, spec.atTime ?? defaultTime, tz);
  return baseMs + spec.afterMin * MIN;
}

/** Der Zeitpunkt nach `prevMs`; null, wenn es nur einmal sein soll */
export function nextAfter(spec: ReminderSpec, prevMs: number, tz: string, defaultTime: string): number | null {
  if (spec.everyMin === null) return null;
  if (repeatUsesClock(spec)) return dayAt(prevMs, spec.everyMin / DAY_MIN, spec.atTime ?? defaultTime, tz);
  return prevMs + spec.everyMin * MIN;
}

/** Alle Zeitpunkte der Regel ab dem ersten (höchstens `max`, ein Wächter-Beispiel zeigt sie) */
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

const intIn = (v: unknown, what: string, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new ValidationError(t('{what} muss eine ganze Zahl von {min} bis {max} sein', { what, min, max }));
  }
  return v;
};

/** Prüft die Eingabe der Oberfläche; `maxAfter`/`maxEvery` begrenzen die Zeiten (Wächter: bis 24 Stunden) */
export function parseReminder(raw: unknown, opts: { maxMin?: number } = {}): ReminderSpec {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ValidationError(t('Das Nachhaken ist ungültig'));
  const o = raw as Record<string, unknown>;
  const top = opts.maxMin ?? REMINDER_MAX_MIN;
  const anchor = o.anchor ?? 'created';
  if (anchor !== 'due' && anchor !== 'created') throw new ValidationError(t('Das Nachhaken zählt ab Termin oder ab Anlegen'));
  const afterMin = intIn(o.afterMin, t('Die Zeit bis zum Nachhaken'), REMINDER_MIN, top);
  const everyMin = o.everyMin === null || o.everyMin === undefined ? null : intIn(o.everyMin, t('Der Abstand beim Nachhaken'), REMINDER_MIN, top);
  const max = o.max === null || o.max === undefined ? REMINDER_DEFAULT_MAX : intIn(o.max, t('Die Höchstzahl beim Nachhaken'), 1, 99);
  let atTime: string | null = null;
  if (o.atTime !== null && o.atTime !== undefined) {
    if (!isHm(o.atTime)) throw new ValidationError(t('Die Uhrzeit beim Nachhaken muss HH:MM sein'));
    atTime = o.atTime;
  }
  const spec: ReminderSpec = { anchor, afterMin, everyMin, max: everyMin === null ? 1 : max, atTime };
  if (!usesClock(spec)) spec.atTime = null; // eine Uhrzeit gibt es nur bei Tagen und Wochen
  return spec;
}
