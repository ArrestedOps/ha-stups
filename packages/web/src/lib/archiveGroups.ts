import { addDays, dayKeyOf, mondayOf } from './calendar';
import { deviceTz } from './datetime';

export interface ArchiveGroup<T> {
  /** `week` = „Diese Woche", sonst der Monat als `2026-10` */
  key: string;
  week: boolean;
  items: T[];
}

/**
 * Das Archiv nach Erledigungstag: „Diese Woche" (ab Montag), davor je Monat, das Neueste zuerst.
 * Karten ohne Erledigungstag zählen nach dem Tag des Archivierens.
 */
export function groupArchive<T extends { completedAt: string | null; archivedAt: string | null }>(cards: T[], nowMs = Date.now(), tz = deviceTz()): ArchiveGroup<T>[] {
  const monday = mondayOf(dayKeyOf(nowMs, tz));
  const sunday = addDays(monday, 6);
  const when = (c: T) => c.completedAt ?? c.archivedAt ?? '';
  const sorted = [...cards].sort((a, b) => (when(a) < when(b) ? 1 : when(a) > when(b) ? -1 : 0));
  const groups: ArchiveGroup<T>[] = [];
  for (const c of sorted) {
    const day = when(c) ? dayKeyOf(Date.parse(when(c)), tz) : '0000-00-00';
    const week = day >= monday && day <= sunday;
    const key = week ? 'week' : day.slice(0, 7);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, week, items: [] }));
    g.items.push(c);
  }
  return groups;
}
