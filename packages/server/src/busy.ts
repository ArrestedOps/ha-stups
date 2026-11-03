import { toLocal } from './recurrence.js';

/** Wie weit im Voraus man „wenig Zeit" eintragen kann */
export const MAX_BUSY_DAYS = 90;

const pad = (n: number) => String(n).padStart(2, '0');

/** Der Tag in der Zeitzone des Haushalts als YYYY-MM-DD */
export function localDateKey(ms: number, tz: string): string {
  const l = toLocal(ms, tz);
  return `${l.y}-${pad(l.m)}-${pad(l.d)}`;
}

/** Hat die Person bis einschließlich zu diesem Tag wenig Zeit? */
export function isBusy(busyUntil: string | null, nowMs: number, tz: string): boolean {
  return busyUntil !== null && busyUntil >= localDateKey(nowMs, tz);
}

/** Ist das ein echter Kalendertag (YYYY-MM-DD)? */
export function validDateKey(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Der letzte Tag, den man eintragen darf (heute + 90 Tage) */
export function lastBusyDay(nowMs: number, tz: string): string {
  const l = toLocal(nowMs, tz);
  const d = new Date(Date.UTC(l.y, l.m - 1, l.d + MAX_BUSY_DAYS));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
