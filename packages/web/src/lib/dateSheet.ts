import { fromInputValue, toInputValue } from './datetime';
import { t } from './i18n/index.svelte';
import { dayOfMonth, names } from './i18n/names';

/**
 * Das Termin-Fenster („Termin wählen“): Monatskalender und Uhrzeit-Rad. Reine Rechnung mit der Zeitzone als Parameter (die des
 * Geräts, wie überall in lib/datetime.ts), damit sie rund um Mitternacht und bei der Sommerzeit mit fester Uhr getestet werden kann.
 */
export interface Ymd {
  y: number;
  m: number;
  d: number;
}
export interface Pick {
  ymd: Ymd;
  h: number;
  mi: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = 86_400_000;

export const ymdKey = (v: Ymd): string => `${v.y}-${pad(v.m)}-${pad(v.d)}`;

/** Kalendertag und Uhrzeit eines Termins in Ortszeit; null ohne Termin */
export function localParts(iso: string | null, tz: string): Pick | null {
  if (!iso) return null;
  const v = toInputValue(iso, tz);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return { ymd: { y, m: mo, d }, h, mi };
}

/** Welcher Kalendertag ist jetzt (in der Zeitzone, nicht in UTC) */
export function todayOf(nowMs: number, tz: string): Ymd {
  return localParts(new Date(nowMs).toISOString(), tz)!.ymd;
}

/** Ortszeit → UTC-ISO (eine Uhrzeit, die es wegen der Sommerzeit nicht gibt, rückt hinter die Lücke) */
export function compose(ymd: Ymd, h: number, mi: number, tz: string): string {
  return fromInputValue(`${ymdKey(ymd)}T${pad(h)}:${pad(mi)}`, tz)!;
}

export const pickedIso = (p: Pick, tz: string): string => compose(p.ymd, p.h, p.mi, tz);

/** Vorbelegung ohne Termin: heute um die Standardzeit (HH:MM; Unbrauchbares ergibt 09:00) */
export function defaultPick(nowMs: number, tz: string, defaultTime: string): Pick {
  const m = /^(\d{1,2}):(\d{2})$/.exec(defaultTime);
  const h = m ? Number(m[1]) : 9;
  const mi = m ? Number(m[2]) : 0;
  const ok = h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
  return { ymd: todayOf(nowMs, tz), h: ok ? h : 9, mi: ok ? mi : 0 };
}

/** Die Tage des Monats ab Montag in ganzen Wochen (fünf oder sechs Zeilen, vier im Februar, wenn er genau passt) */
export function monthCells(y: number, m: number): { ymd: Ymd; inMonth: boolean }[] {
  const first = Date.UTC(y, m - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7; // Montag = 0
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const cells: { ymd: Ymd; inMonth: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(first + (i - lead) * DAY);
    cells.push({ ymd: { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }, inMonth: d.getUTCMonth() === m - 1 });
  }
  return cells;
}

export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (((idx % 12) + 12) % 12) + 1 };
}

const weekdayOf = (v: Ymd): number => new Date(Date.UTC(v.y, v.m - 1, v.d)).getUTCDay();

/** „Morgen, 19:00“ / „Do, 12. Nov, 09:05“ (mit Jahr, wenn es nicht dieses ist) */
export function summaryTitle(iso: string, nowMs: number, tz: string): string {
  const p = localParts(iso, tz)!;
  const today = todayOf(nowMs, tz);
  const diff = Math.round((Date.UTC(p.ymd.y, p.ymd.m - 1, p.ymd.d) - Date.UTC(today.y, today.m - 1, today.d)) / DAY);
  const time = `${pad(p.h)}:${pad(p.mi)}`;
  if (diff === 0) return `${t('Heute')}, ${time}`;
  if (diff === 1) return `${t('Morgen')}, ${time}`;
  if (diff === -1) return `${t('Gestern')}, ${time}`;
  const n = names();
  return `${n.weekdaysShort[weekdayOf(p.ymd)]}, ${dayOfMonth(p.ymd.d)} ${n.monthsShort[p.ymd.m - 1]}${p.ymd.y === today.y ? '' : ` ${p.ymd.y}`}, ${time}`;
}

/** „Donnerstag, 30. Januar 2025“ */
export function summaryFull(v: Ymd): string {
  const n = names();
  return `${n.weekdaysLong[weekdayOf(v)]}, ${dayOfMonth(v.d)} ${n.monthsLong[v.m - 1]} ${v.y}`;
}

/** Minuten im Rad: Fünferschritte; hat der Termin eine andere Minute, bleibt sie wählbar */
export function minuteOptions(current: number): number[] {
  const list = Array.from({ length: 12 }, (_, i) => i * 5);
  return list.includes(current) ? list : [...list, current].sort((a, b) => a - b);
}

/** Das Fenster des Rads: fünf Werte rund um den gewählten (der gewählte steht in der Mitte), im Kreis */
export function wheelWindow<T>(values: readonly T[], index: number, radius = 2): T[] {
  const n = values.length;
  return Array.from({ length: radius * 2 + 1 }, (_, i) => values[(((index + i - radius) % n) + n) % n]!);
}

export const stepWheel = (n: number, index: number, delta: number): number => (((index + delta) % n) + n) % n;
