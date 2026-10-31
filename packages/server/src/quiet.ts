import { fromLocal, toLocal } from './recurrence.js';

/** Ruhezeit einer Person für Stupse: Beginn und Ende als HH:MM in der Ortszeit, über Mitternacht möglich */
export interface QuietWindow {
  start: string;
  end: string;
  off: boolean;
}

export const DEFAULT_QUIET: QuietWindow = { start: '22:00', end: '07:00', off: false };

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHm = (v: unknown): v is string => typeof v === 'string' && HM_RE.test(v);

const minutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h! * 60 + m!;
};

/**
 * Ist `nowMs` in der Ruhezeit, kommt das Ende der Ruhezeit (UTC-Millisekunden) zurück, sonst null.
 * Das Ende gilt in der Ortszeit: auch in der Nacht der Zeitumstellung ist es 07:00 Uhr. Fällt es in die
 * Lücke der Frühjahrs-Umstellung, endet die Ruhezeit nach der Lücke.
 */
export function quietEnd(nowMs: number, tz: string, w: QuietWindow): number | null {
  if (w.off || w.start === w.end) return null;
  const s = minutes(w.start);
  const e = minutes(w.end);
  const l = toLocal(nowMs, tz);
  const m = l.h * 60 + l.mi;

  const wraps = s > e;
  const inside = wraps ? m >= s || m < e : m >= s && m < e;
  if (!inside) return null;

  // Das Ende liegt heute, außer wir sind im Abendteil eines Fensters über Mitternacht: dann morgen
  const dayOffset = wraps && m >= s ? 1 : 0;
  const day = new Date(Date.UTC(l.y, l.m - 1, l.d + dayOffset));
  return fromLocal(
    { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), h: Math.floor(e / 60), mi: e % 60, s: 0 },
    tz,
  );
}
