import { numberLocale, t } from './i18n/index.svelte';
import { toInputValue } from './datetime';
import { names } from './i18n/names';
import { fromLocal, nextDue, toLocal } from './nextDue';

export type Freq = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type Unit = 'hours' | 'days' | 'weeks' | 'months';

export type Recurrence =
  | {
      type: 'fixed';
      freq: Freq;
      /** stündlich: alle N Stunden, sonst Tage, Wochen, Monate, Jahre */
      every: number;
      weekdays?: number[];
      monthDay?: number;
      /** nur wöchentlich/monatlich: ganze Tage, die die Erledigung nach dem Termin liegen darf, ohne dass der Plan neu beginnt */
      lateTolerance?: number;
      /** nur stündlich: Termine nur zwischen `from` und `to` (HH:MM, beide einschließlich) */
      window?: { from: string; to: string };
    }
  | { type: 'after_completion'; every: number; unit: Unit };

/** 1 = Montag … 7 = Sonntag */
const dayShort = (d: number) => names().weekdaysShort[d % 7]!;
const dayLong = (d: number) => names().weekdaysLong[d % 7]!;
const unitPlural = (u: Unit) => ({ hours: t('Stunden'), days: t('Tage'), weeks: t('Wochen'), months: t('Monate') })[u];
const unitEach = (u: Unit) => ({ hours: t('jede Stunde'), days: t('jeden Tag'), weeks: t('jede Woche'), months: t('jeden Monat') })[u];

export function describeRecurrence(rule: Recurrence): string {
  if (rule.type === 'after_completion') {
    return rule.every === 1
      ? t('{each} nach Erledigung', { each: unitEach(rule.unit) })
      : t('alle {n} {unit} nach Erledigung', { n: rule.every, unit: unitPlural(rule.unit) });
  }
  const n = rule.every;
  switch (rule.freq) {
    case 'hourly': {
      const base = n === 1 ? t('stündlich') : t('alle {n} Std.', { n });
      return rule.window ? `${base} ${rule.window.from}–${rule.window.to}` : base;
    }
    case 'daily':
      return n === 1 ? t('täglich') : t('alle {n} Tage', { n });
    case 'weekly': {
      const days = [...(rule.weekdays ?? [])].sort((a, b) => a - b);
      if (days.length === 0) return n === 1 ? t('wöchentlich') : t('alle {n} Wochen', { n });
      if (n === 1) {
        return days.length === 1 ? t('jeden {day}', { day: dayLong(days[0]!) }) : t('jeden {day}', { day: days.map(dayShort).join(' + ') });
      }
      return t('alle {n} Wochen ({days})', { n, days: days.map(dayShort).join(', ') });
    }
    case 'monthly': {
      const day = rule.monthDay === -1 ? t('am letzten Tag') : rule.monthDay ? t('am {day}.', { day: rule.monthDay }) : '';
      const base = n === 1 ? t('monatlich') : t('alle {n} Monate', { n });
      return day ? `${base} ${day}` : base;
    }
    case 'yearly':
      return n === 1 ? t('jährlich') : t('alle {n} Jahre', { n });
  }
}

/** Zustand des Wiederholungs-Editors, unabhängig vom gespeicherten Format */
export interface RecurrenceEditor {
  /** Der Rhythmus; „after“ = Neu zählen ab Erledigung (der Rhythmus steckt dann in `unit` und `every`) */
  mode: 'none' | Freq | 'after';
  every: number;
  /** 1 = Montag … 7 = Sonntag */
  weekdays: number[];
  /** 1–31, -1 = letzter Tag, 0 = Tag des Termins */
  monthDay: number;
  unit: Unit;
  /** wöchentlich/monatlich: Zahl = „Kleine Verspätung ist okay“ mit so vielen Tagen; null/fehlt = Plan bleibt fest */
  tolerance?: number | null;
  /** stündlich: Zeitfenster; null/fehlt = rund um die Uhr */
  window?: { from: string; to: string } | null;
}

export const DEFAULT_TOLERANCE = 3;
export const DEFAULT_WINDOW = { from: '08:00', to: '20:00' };

export const emptyEditor = (): RecurrenceEditor => ({ mode: 'none', every: 1, weekdays: [], monthDay: 0, unit: 'days', tolerance: null, window: null });

export function editorFromRule(rule: Recurrence | null): RecurrenceEditor {
  if (!rule) return emptyEditor();
  if (rule.type === 'after_completion') return { ...emptyEditor(), mode: 'after', every: rule.every, unit: rule.unit };
  return {
    ...emptyEditor(),
    mode: rule.freq,
    every: rule.every,
    weekdays: rule.weekdays ?? [],
    monthDay: rule.monthDay ?? 0,
    tolerance: rule.lateTolerance ?? null,
    window: rule.window ? { ...rule.window } : null,
  };
}

/** Baut die Regel für die API. Fehlende Angaben werden aus dem Termin (Ortszeit) ergänzt. */
export function ruleFromEditor(e: RecurrenceEditor, dueIso: string, tz?: string): Recurrence | null {
  if (e.mode === 'none') return null;
  const every = Math.max(1, Math.floor(e.every) || 1);
  if (e.mode === 'after') return { type: 'after_completion', every, unit: e.unit };

  const local = toInputValue(dueIso, tz); // YYYY-MM-DDTHH:mm in Ortszeit
  const day = Number(local.slice(8, 10));
  const weekdayOfDue = ((new Date(`${local.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const tolerance = e.tolerance !== null && e.tolerance !== undefined ? { lateTolerance: Math.max(0, Math.floor(e.tolerance) || 0) } : {};

  if (e.mode === 'weekly') {
    return { type: 'fixed', freq: 'weekly', every, weekdays: e.weekdays.length ? [...e.weekdays].sort((a, b) => a - b) : [weekdayOfDue], ...tolerance };
  }
  if (e.mode === 'monthly') return { type: 'fixed', freq: 'monthly', every, monthDay: e.monthDay === 0 ? day : e.monthDay, ...tolerance };
  if (e.mode === 'hourly') return { type: 'fixed', freq: 'hourly', every, ...(e.window ? { window: { ...e.window } } : {}) };
  return { type: 'fixed', freq: e.mode, every };
}

// ---------- Rhythmus und „Und wenn ich später fertig werde?“ ----------

export type Handling = 'fixed' | 'tolerant' | 'after';

/** Rhythmus ohne Rücksicht darauf, wie mit Verspätung umgegangen wird („Neu zählen“ steckt in Einheit und Abstand) */
export function baseOf(e: RecurrenceEditor): { freq: Freq; every: number } | null {
  if (e.mode === 'none') return null;
  if (e.mode !== 'after') return { freq: e.mode, every: e.every };
  if (e.unit === 'hours') return { freq: 'hourly', every: e.every };
  if (e.unit === 'days') return { freq: 'daily', every: e.every };
  if (e.unit === 'weeks') return { freq: 'weekly', every: e.every };
  return e.every >= 12 && e.every % 12 === 0 ? { freq: 'yearly', every: e.every / 12 } : { freq: 'monthly', every: e.every };
}

export function handlingOf(e: RecurrenceEditor): Handling {
  return e.mode === 'after' ? 'after' : e.tolerance !== null && e.tolerance !== undefined ? 'tolerant' : 'fixed';
}

/** „Kleine Verspätung ist okay“ gibt es nur bei wöchentlich und monatlich */
export const allowsTolerance = (freq: Freq | undefined): boolean => freq === 'weekly' || freq === 'monthly';

const UNIT_OF: Record<Freq, Unit> = { hourly: 'hours', daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'months' };

/** Anderer Rhythmus, gleiche Behandlung der Verspätung */
export function withBase(e: RecurrenceEditor, freq: Freq, every: number): RecurrenceEditor {
  const n = Math.min(999, Math.max(1, Math.floor(every) || 1));
  if (e.mode === 'after') return { ...e, unit: UNIT_OF[freq], every: freq === 'yearly' ? Math.min(999, n * 12) : n };
  return { ...e, mode: freq, every: n, tolerance: allowsTolerance(freq) ? e.tolerance : null };
}

/** Andere Behandlung der Verspätung, gleicher Rhythmus (null: es gibt noch keinen Rhythmus) */
export function withHandling(e: RecurrenceEditor, h: Handling): RecurrenceEditor {
  const base = baseOf(e);
  if (!base) return e;
  if (h === 'after') return { ...e, ...withBase({ ...e, mode: 'after' }, base.freq, base.every), mode: 'after', tolerance: null };
  const fixed: RecurrenceEditor = { ...e, mode: base.freq, every: base.every, tolerance: null };
  return h === 'tolerant' && allowsTolerance(base.freq) ? { ...fixed, tolerance: e.tolerance ?? DEFAULT_TOLERANCE } : fixed;
}

// ---------- erster Termin und Vorschau ----------

const pad = (n: number) => String(n).padStart(2, '0');

interface Ymd {
  y: number;
  m: number;
  d: number;
}
const addDays = (l: Ymd, n: number): Ymd => {
  const x = new Date(Date.UTC(l.y, l.m - 1, l.d + n));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
};
const isoWeekday = (l: Ymd): number => new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay() || 7;
const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Erster Termin, wenn es noch keinen gibt: der nächste passende Tag in der Zukunft, Uhrzeit = Standard-Fälligkeitszeit
 * (bei stündlich mit Zeitfenster: Fensteranfang, wenn die Standardzeit außerhalb liegt).
 */
export function firstDue(e: RecurrenceEditor, nowMs: number, tz: string, defaultTime = '09:00'): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(defaultTime);
  let h = m ? Number(m[1]) : 9;
  let mi = m ? Number(m[2]) : 0;
  if (h > 23 || mi > 59) [h, mi] = [9, 0];
  if (e.mode === 'hourly' && e.window) {
    const minutes = h * 60 + mi;
    const [fh, fm] = e.window.from.split(':').map(Number) as [number, number];
    if (minutes < fh * 60 + fm || minutes > Number(e.window.to.slice(0, 2)) * 60 + Number(e.window.to.slice(3))) [h, mi] = [fh, fm];
  }
  const today = toLocal(nowMs, tz);
  for (let off = 0; off < 800; off++) {
    const day = addDays(today, off);
    const ms = fromLocal({ ...day, h, mi, s: 0 }, tz);
    if (ms <= nowMs) continue;
    if (e.mode === 'weekly' && e.weekdays.length > 0 && !e.weekdays.includes(isoWeekday(day))) continue;
    if (e.mode === 'monthly' && e.monthDay !== 0) {
      const dim = daysIn(day.y, day.m);
      if ((e.monthDay === -1 ? dim : Math.min(e.monthDay, dim)) !== day.d) continue;
    }
    return new Date(ms).toISOString();
  }
  return new Date(nowMs + 86_400_000).toISOString();
}

/** Der Termin und die nächsten (so, als würde jedes Mal pünktlich erledigt) */
export function upcoming(rule: Recurrence, firstIso: string, tz: string, count = 3): string[] {
  const out = [firstIso];
  while (out.length < count) {
    const last = out[out.length - 1]!;
    out.push(nextDue(rule, last, last, tz));
  }
  return out;
}

export interface Example {
  doneIso: string;
  nextIso: string;
}
export interface LateExamples {
  fixed: Example;
  /** nur wöchentlich/monatlich */
  tolerant?: { ok: Example; late: Example; days: number };
  after: Example;
}

/**
 * Beispiele für die drei Aufgaben, mit der echten Regel und dem echten Termin gerechnet (dieselbe Funktion wie der Server):
 * Erledigt 4 Tage nach dem Termin (stündlich: 30 Minuten danach); bei der Toleranz ein Beispiel innerhalb (Toleranz − 1 Tage) und eines darüber (Toleranz + 1).
 */
export function lateExamples(e: RecurrenceEditor, dueIso: string, tz: string): LateExamples | null {
  const base = baseOf(e);
  if (!base) return null;
  const doneAfter = (days: number): string => {
    if (base.freq === 'hourly') return new Date(Date.parse(dueIso) + 30 * 60_000).toISOString();
    const l = toLocal(Date.parse(dueIso), tz);
    return new Date(fromLocal({ ...addDays(l, days), h: l.h, mi: l.mi, s: l.s }, tz)).toISOString();
  };
  const run = (variant: RecurrenceEditor, doneIso: string): Example => ({ doneIso, nextIso: nextDue(ruleFromEditor(variant, dueIso, tz)!, dueIso, doneIso, tz) });
  const fixedE = withHandling(e, 'fixed');
  const out: LateExamples = {
    fixed: run(fixedE, doneAfter(4)),
    after: run(withHandling(e, 'after'), doneAfter(4)),
  };
  if (allowsTolerance(base.freq)) {
    const tolE = withHandling(e, 'tolerant');
    const days = Math.max(0, Math.floor(tolE.tolerance ?? DEFAULT_TOLERANCE) || 0);
    out.tolerant = { days, ok: run(tolE, doneAfter(Math.max(0, days - 1))), late: run(tolE, doneAfter(days + 1)) };
  }
  return out;
}

/** „Sa 28.11.“ (stündlich zusätzlich mit Uhrzeit: „Sa 28.11. 12:00“) für die Beispiele und die Vorschau */
export function shortWhen(iso: string, tz: string, withTime = false): string {
  const l = toLocal(Date.parse(iso), tz);
  const wd = names().weekdaysShort[new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay()]!;
  const date = numberLocale() === 'de-DE' ? `${l.d}.${l.m}.` : `${l.d}/${l.m}`;
  return `${wd} ${date}${withTime ? ` ${pad(l.h)}:${pad(l.mi)}` : ''}`;
}
