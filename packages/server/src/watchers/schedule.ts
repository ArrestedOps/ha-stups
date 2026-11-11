import { fromLocal, toLocal } from '../recurrence.js';
import type { Store } from '../store.js';
import type { CardTemplate } from '../watcher-types.js';

export const minutes = (n: number) => n * 60_000;

/** Wann die Karte fällig wird: gar nicht, in N Minuten oder heute/morgen um eine Uhrzeit (Ortszeit) */
export function dueFor(t: CardTemplate, nowMs: number, tz: string): string | null {
  if (t.due.kind === 'none') return null;
  if (t.due.kind === 'in') return new Date(nowMs + minutes(t.due.minutes)).toISOString();
  const l = toLocal(nowMs, tz);
  const base = new Date(Date.UTC(l.y, l.m - 1, l.d + (t.due.day === 'tomorrow' ? 1 : 0)));
  const [h, mi] = t.due.time.split(':').map(Number) as [number, number];
  return new Date(
    fromLocal({ y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), h, mi, s: 0 }, tz),
  ).toISOString();
}

export function tomorrowStart(nowMs: number, tz: string): number {
  const l = toLocal(nowMs, tz);
  const next = new Date(Date.UTC(l.y, l.m - 1, l.d + 1));
  return fromLocal({ y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate(), h: 0, mi: 0, s: 0 }, tz);
}

/** „Geplant" nimmt nur Karten mit Termin nach heute; sonst die erste offene Spalte */
export function columnFor(store: Store, t: CardTemplate, dueAt: string | null, nowMs: number, tz: string): string {
  const cols = store.getBoardView(t.boardId).columns;
  const chosen = cols.find((c) => c.id === t.columnId);
  if (!chosen) throw new Error('Die Spalte gibt es nicht mehr');
  if (!chosen.isPlanned) return chosen.id;
  const future = dueAt !== null && Date.parse(dueAt) >= tomorrowStart(nowMs, tz);
  return future ? chosen.id : (cols.find((c) => !c.isDone && !c.isPlanned)?.id ?? chosen.id);
}

/** Ein Datum ohne Uhrzeit (ganztägiger Termin) beginnt um Mitternacht Ortszeit */
export function eventMs(value: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? fromLocal({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), h: 0, mi: 0, s: 0 }, tz) : Date.parse(value);
}
