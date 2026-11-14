import { deviceTz } from './datetime';

export type Urgency = 'over' | 'today' | 'soon' | 'later' | 'none' | 'done';

const dayKey = (ms: number, tz: string): number => {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms)).split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
};

/**
 * Wie dringend eine Aufgabe ist, für den farbigen Balken links: überfällig, heute, in den nächsten zwei Tagen („bald"),
 * später, ohne Termin oder erledigt.
 */
export function urgency(
  card: { dueAt: string | null; completedAt: string | null },
  inDoneColumn: boolean,
  nowMs = Date.now(),
  tz = deviceTz(),
): Urgency {
  if (card.completedAt || inDoneColumn) return 'done';
  if (!card.dueAt) return 'none';
  const due = Date.parse(card.dueAt);
  if (due < nowMs) return 'over';
  const days = dayKey(due, tz) - dayKey(nowMs, tz);
  if (days <= 0) return 'today';
  if (days <= 2) return 'soon';
  return 'later';
}

/** CSS-Farbe des Balkens, null = keiner */
export const urgencyColor = (u: Urgency): string | null =>
  u === 'over' ? 'var(--u-over)' : u === 'today' ? 'var(--u-today)' : u === 'soon' ? 'var(--u-soon)' : u === 'later' ? 'var(--u-later)' : null;
