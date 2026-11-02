import { dayOfMonth, names } from './i18n/names.js';
import { t, tn } from './i18n/index.js';
import { fromLocal, toLocal } from './recurrence.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** Kalendertag in Ortszeit als YYYY-MM-DD */
export function localDateKey(ms: number, tz: string): string {
  const l = toLocal(ms, tz);
  return `${l.y}-${pad(l.m)}-${pad(l.d)}`;
}

/** Beginn des nächsten Kalendertags (00:00 Ortszeit) als UTC-Millisekunden */
export function startOfTomorrow(nowMs: number, tz: string): number {
  const l = toLocal(nowMs, tz);
  const next = new Date(Date.UTC(l.y, l.m - 1, l.d + 1));
  return fromLocal(
    { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate(), h: 0, mi: 0, s: 0 },
    tz,
  );
}

export function minutesOfDay(ms: number, tz: string): number {
  const l = toLocal(ms, tz);
  return l.h * 60 + l.mi;
}

/** "08:00" → Minuten seit Mitternacht */
export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h! * 60 + m!;
}

/** Ganze Kalendertage (Ortszeit) von `nowMs` bis `ms`: 0 = heute, 1 = morgen, -1 = gestern */
export function dayDiff(ms: number, nowMs: number, tz: string): number {
  const a = toLocal(ms, tz);
  const b = toLocal(nowMs, tz);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}

/** z. B. "heute 10:00", "morgen 18:30", "Sa 14:00", "12. Nov 18:00", "gestern 20:00" */
export function formatDue(ms: number, nowMs: number, tz: string): string {
  const l = toLocal(ms, tz);
  const time = `${pad(l.h)}:${pad(l.mi)}`;
  const diff = dayDiff(ms, nowMs, tz);
  if (diff === 0) return t('heute {time}', { time });
  if (diff === 1) return t('morgen {time}', { time });
  if (diff === -1) return t('gestern {time}', { time });
  if (diff >= 2 && diff <= 6) {
    const wd = names().weekdaysShort[new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay()]!;
    return `${wd} ${time}`;
  }
  const sameYear = l.y === toLocal(nowMs, tz).y;
  return `${dayOfMonth(l.d)} ${names().monthsShort[l.m - 1]}${sameYear ? '' : ` ${l.y}`} ${time}`;
}

/** 30 → "30 Min.", 60 → "1 Std.", 1440 → "1 Tag", 2880 → "2 Tage" */
export function formatLead(min: number): string {
  if (min % 1440 === 0) {
    const d = min / 1440;
    return tn('{n} Tag', '{n} Tage', d);
  }
  if (min % 60 === 0) return t('{n} Std.', { n: min / 60 });
  return t('{n} Min.', { n: min });
}
