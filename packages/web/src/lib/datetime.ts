// Zeit-Hilfen der Oberfläche. Rechnen bewusst mit einer Zeitzone als Parameter, damit sie testbar sind.

export const deviceTz = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

interface Local {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

const MIN = 60_000;
const DAY = 86_400_000;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const pad = (n: number) => String(n).padStart(2, '0');

const formatters = new Map<string, Intl.DateTimeFormat>();
function toLocal(ms: number, tz: string): Local {
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
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour!, mi: p.minute!, s: p.second! };
}

function offsetMin(ms: number, tz: string): number {
  const l = toLocal(ms, tz);
  return Math.round((Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s) - Math.floor(ms / 1000) * 1000) / MIN);
}

/** Ortszeit → UTC; doppelte Uhrzeit: erstes Vorkommen, fehlende Uhrzeit: nach der Lücke. */
function fromLocal(l: Local, tz: string): number {
  const utc0 = Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s);
  const offsets = [...new Set([offsetMin(utc0 - DAY, tz), offsetMin(utc0 + DAY, tz)])];
  const valid = offsets
    .map((off) => utc0 - off * MIN)
    .filter((c) => {
      const back = toLocal(c, tz);
      return back.d === l.d && back.h === l.h && back.mi === l.mi;
    });
  return valid.length > 0 ? Math.min(...valid) : utc0 - offsets[0]! * MIN;
}

/** UTC-ISO → Wert für <input type="datetime-local"> (YYYY-MM-DDTHH:mm in Ortszeit) */
export function toInputValue(iso: string | null, tz = deviceTz()): string {
  if (!iso) return '';
  const l = toLocal(Date.parse(iso), tz);
  return `${l.y}-${pad(l.m)}-${pad(l.d)}T${pad(l.h)}:${pad(l.mi)}`;
}

/** Wert aus <input type="datetime-local"> → UTC-ISO, null bei leerer oder kaputter Eingabe */
export function fromInputValue(value: string, tz = deviceTz()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return new Date(fromLocal({ y, m: mo, d, h, mi, s: 0 }, tz)).toISOString();
}

/** Beginn des nächsten Kalendertags (00:00 Ortszeit) in UTC-Millisekunden */
export function startOfTomorrow(nowMs = Date.now(), tz = deviceTz()): number {
  const l = toLocal(nowMs, tz);
  const next = new Date(Date.UTC(l.y, l.m - 1, l.d + 1));
  return fromLocal({ y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate(), h: 0, mi: 0, s: 0 }, tz);
}

/** Liegt der Termin nach heute? Solche Karten gehören nach „Geplant". */
export const isFuture = (iso: string | null, nowMs = Date.now(), tz = deviceTz()): boolean =>
  !!iso && Date.parse(iso) >= startOfTomorrow(nowMs, tz);

export const isOverdue = (iso: string | null, nowMs = Date.now()): boolean => !!iso && Date.parse(iso) < nowMs;

/** z. B. "heute 10:00", "morgen 18:30", "Sa 14:00", "12. Nov 18:00", "gestern 20:00" */
export function formatDue(iso: string, nowMs = Date.now(), tz = deviceTz()): string {
  const ms = Date.parse(iso);
  const l = toLocal(ms, tz);
  const n = toLocal(nowMs, tz);
  const time = `${pad(l.h)}:${pad(l.mi)}`;
  const diff = Math.round((Date.UTC(l.y, l.m - 1, l.d) - Date.UTC(n.y, n.m - 1, n.d)) / DAY);
  if (diff === 0) return `heute ${time}`;
  if (diff === 1) return `morgen ${time}`;
  if (diff === -1) return `gestern ${time}`;
  if (diff >= 2 && diff <= 6) return `${WEEKDAYS[new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay()]} ${time}`;
  return `${l.d}. ${MONTHS[l.m - 1]}${l.y === n.y ? '' : ` ${l.y}`} ${time}`;
}

export function formatLead(min: number): string {
  if (min % 1440 === 0) return min / 1440 === 1 ? '1 Tag' : `${min / 1440} Tage`;
  if (min % 60 === 0) return `${min / 60} Std.`;
  return `${min} Min.`;
}

export const formatCost = (cents: number): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);

/** "4.200,50" / "4200.5" / "19,99 €" → Cent. Leer → null, ungültig → NaN. */
export function parseCost(input: string): number | null {
  const s = input.replace(/[€\s]/g, '');
  if (s === '') return null;
  let normalized = s;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100);
}

/** „heute", „gestern", „vor 3 Tagen" (bis 6 Tage), sonst „29. Okt" (mit Jahr, wenn es nicht dieses ist) */
export function formatCreated(iso: string, nowMs = Date.now(), tz = deviceTz()): string {
  const l = toLocal(Date.parse(iso), tz);
  const n = toLocal(nowMs, tz);
  const diff = Math.round((Date.UTC(n.y, n.m - 1, n.d) - Date.UTC(l.y, l.m - 1, l.d)) / DAY);
  if (diff <= 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff <= 6) return `vor ${diff} Tagen`;
  return `${l.d}. ${MONTHS[l.m - 1]}${l.y === n.y ? '' : ` ${l.y}`}`;
}