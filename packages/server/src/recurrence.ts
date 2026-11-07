export type Recurrence =
  | {
      type: 'fixed';
      freq: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
      /** hourly: alle N Stunden; sonst alle N Tage/Wochen/Monate/Jahre */
      every: number;
      /** weekly: 1 = Montag … 7 = Sonntag. Ohne Angabe der Wochentag des bisherigen Termins. */
      weekdays?: number[];
      /** monthly: 1–31, -1 = letzter Tag. Ohne Angabe der Tag des bisherigen Termins. */
      monthDay?: number;
      /** nur wöchentlich/monatlich: so viele ganze Tage darf die Erledigung nach dem Termin liegen, ohne dass der Plan neu beginnt */
      lateTolerance?: number;
      /** nur stündlich: Termine nur zwischen `from` und `to` (HH:MM, Ortszeit, beide einschließlich) */
      window?: { from: string; to: string };
    }
  | { type: 'after_completion'; every: number; unit: 'hours' | 'days' | 'weeks' | 'months' };

export interface Local {
  y: number;
  m: number; // 1–12
  d: number;
  h: number;
  mi: number;
  s: number;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const MAX_STEPS = 200_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function toLocal(ms: number, tz: string): Local {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour!, mi: p.minute!, s: p.second! };
}

/** Offset der Zeitzone gegenüber UTC in Minuten zum Zeitpunkt `ms`. */
function offsetMin(ms: number, tz: string): number {
  const l = toLocal(ms, tz);
  return Math.round((Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s) - Math.floor(ms / 1000) * 1000) / MIN);
}

/**
 * Ortszeit → UTC. Bei einer doppelten Uhrzeit (Herbst) gilt das erste Vorkommen,
 * bei einer nicht existierenden (Frühjahr) wird auf die Zeit nach der Lücke geschoben.
 */
export function fromLocal(l: Local, tz: string): number {
  const utc0 = Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s);
  const offsets = [...new Set([offsetMin(utc0 - DAY, tz), offsetMin(utc0 + DAY, tz)])];
  const valid = offsets
    .map((off) => utc0 - off * MIN)
    .filter((c) => {
      const back = toLocal(c, tz);
      return back.d === l.d && back.h === l.h && back.mi === l.mi;
    });
  if (valid.length > 0) return Math.min(...valid);
  return utc0 - offsets[0]! * MIN; // Lücke: mit dem Offset vor der Umstellung rechnen
}

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function addDays(l: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(l.y, l.m - 1, l.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Monate addieren; `day` wird auf das Monatsende gekappt (-1 = letzter Tag). */
function addMonths(y: number, m: number, n: number, day: number): Ymd {
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = daysInMonth(ny, nm);
  return { y: ny, m: nm, d: day === -1 ? dim : Math.min(day, dim) };
}

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
function isoWeekday(l: Ymd): number {
  return new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay() || 7;
}

/** Anzahl ganzer Kalendertage von a bis b (negativ, wenn b vor a liegt) */
function dayDiff(a: Ymd, b: Ymd): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY);
}

const hhmm = (v: string): number => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

function parse(iso: string, what: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`${what} ist kein gültiges Datum: ${iso}`);
  return ms;
}

/**
 * Berechnet den nächsten Termin.
 *
 * - `fixed`: erster Termin der Regel nach max(bisheriger Termin, Erledigungszeitpunkt). Verpasste Termine
 *   werden übersprungen.
 * - `after_completion`: Erledigungsdatum (Ortszeit) + Intervall; bei Stunden der Erledigungszeitpunkt + N Stunden.
 * - `fixed` stündlich: Raster aus ganzen Stunden ab dem bisherigen Termin; mit Zeitfenster rücken Termine außerhalb
 *   auf den Fensteranfang des nächsten passenden Tages.
 * - `lateTolerance` (wöchentlich/monatlich): Liegt die Erledigung mehr als so viele Tage nach dem Termin, beginnt der
 *   Plan neu: Wochentag der Woche (Mo–So) bzw. Tag des Monats der Erledigung, dazu `every` Wochen/Monate.
 *
 * Die Uhrzeit ist immer die Ortszeit des bisherigen Termins.
 * Bekannte Randfälle: Wird ein Termin wegen der Zeitumstellung verschoben (02:30 → 03:30), bleibt der
 * Folgetermin bei 03:30. Ein 29.02. wird im Folgejahr zum 28.02. und bleibt dort.
 */
export function nextDue(rule: Recurrence, prevDueIso: string, completedAtIso: string, tz: string): string {
  const prev = parse(prevDueIso, 'Der bisherige Termin');
  const done = parse(completedAtIso, 'Der Erledigungszeitpunkt');
  const pl = toLocal(prev, tz);
  const at = (d: Ymd) => new Date(fromLocal({ ...d, h: pl.h, mi: pl.mi, s: pl.s }, tz)).toISOString();

  if (rule.type === 'after_completion') {
    if (rule.unit === 'hours') return new Date(Math.floor(done / MIN) * MIN + rule.every * HOUR).toISOString();
    const cl = toLocal(done, tz);
    if (rule.unit === 'days') return at(addDays(cl, rule.every));
    if (rule.unit === 'weeks') return at(addDays(cl, 7 * rule.every));
    return at(addMonths(cl.y, cl.m, rule.every, cl.d));
  }

  const threshold = Math.max(prev, done);
  const after = (d: Ymd): number | null => {
    const ms = fromLocal({ ...d, h: pl.h, mi: pl.mi, s: pl.s }, tz);
    return ms > threshold ? ms : null;
  };
  const result = (ms: number) => new Date(ms).toISOString();

  const doneL = toLocal(done, tz);
  const restart = rule.lateTolerance !== undefined && dayDiff(pl, doneL) > rule.lateTolerance;

  switch (rule.freq) {
    case 'hourly': {
      const step = rule.every * HOUR;
      const k = Math.max(1, Math.floor((threshold - prev) / step) + 1);
      let ms = prev + k * step;
      if (rule.window) {
        const from = hhmm(rule.window.from);
        const to = hhmm(rule.window.to);
        const l = toLocal(ms, tz);
        const minutes = l.h * 60 + l.mi;
        if (minutes < from || minutes > to) {
          const day = minutes < from ? l : addDays(l, 1);
          ms = fromLocal({ y: day.y, m: day.m, d: day.d, h: Math.floor(from / 60), mi: from % 60, s: 0 }, tz);
        }
      }
      return result(ms);
    }
    case 'daily': {
      let k = Math.max(0, Math.floor((threshold - prev) / (rule.every * DAY)) - 1);
      for (let i = 0; i < MAX_STEPS; i++, k++) {
        const ms = after(addDays(pl, k * rule.every));
        if (ms !== null) return result(ms);
      }
      break;
    }
    case 'weekly': {
      const weekdays = [...new Set(rule.weekdays?.length ? rule.weekdays : [isoWeekday(pl)])].sort((a, b) => a - b);
      if (restart) {
        // Neustart: erster gewählter Wochentag in der Woche der Erledigung + every Wochen
        const first = addDays(addDays(doneL, 1 - isoWeekday(doneL)), 7 * rule.every + weekdays[0]! - 1);
        return result(fromLocal({ ...first, h: pl.h, mi: pl.mi, s: pl.s }, tz));
      }
      const monday = addDays(pl, 1 - isoWeekday(pl));
      let w = Math.max(0, Math.floor((threshold - prev) / (7 * rule.every * DAY)) - 1);
      for (let i = 0; i < MAX_STEPS; i++, w++) {
        const weekStart = addDays(monday, 7 * rule.every * w);
        for (const wd of weekdays) {
          const ms = after(addDays(weekStart, wd - 1));
          if (ms !== null) return result(ms);
        }
      }
      break;
    }
    case 'monthly': {
      const day = rule.monthDay ?? pl.d;
      if (restart) return result(fromLocal({ ...addMonths(doneL.y, doneL.m, rule.every, day), h: pl.h, mi: pl.mi, s: pl.s }, tz));
      for (let k = 0; k < MAX_STEPS; k++) {
        const ms = after(addMonths(pl.y, pl.m, k * rule.every, day));
        if (ms !== null) return result(ms);
      }
      break;
    }
    case 'yearly': {
      for (let k = 0; k < MAX_STEPS; k++) {
        const ms = after(addMonths(pl.y, pl.m, 12 * k * rule.every, pl.d));
        if (ms !== null) return result(ms);
      }
      break;
    }
  }
  throw new Error('Kein nächster Termin gefunden');
}
