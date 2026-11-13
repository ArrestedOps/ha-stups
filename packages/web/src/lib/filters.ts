export interface FilterableCard {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  assigneeIds: string[];
  categoryIds: string[];
  /** offene Stupse an der Aufgabe */
  openNudges?: { toId: string }[];
}

export interface Filter {
  categoryIds: string[];
  onlyMine: boolean;
  /** nur Aufgaben dieser Personen (eine davon genügt); leer = alle */
  personIds?: string[];
  /** nur Aufgaben mit einem offenen Stups an mich */
  nudged?: boolean;
  search: string;
}

export function filterCards<T extends FilterableCard>(cards: T[], f: Filter, meId: string | null): T[] {
  const q = f.search.trim().toLowerCase();
  return cards.filter((c) => {
    if (f.categoryIds.length > 0 && !c.categoryIds.some((id) => f.categoryIds.includes(id))) return false;
    if (f.onlyMine && (!meId || !c.assigneeIds.includes(meId))) return false;
    if (f.personIds?.length && !c.assigneeIds.some((id) => f.personIds!.includes(id))) return false;
    if (f.nudged && (!meId || !(c.openNudges ?? []).some((n) => n.toId === meId))) return false;
    if (q && !`${c.title}\n${c.description ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const dayKey = (ms: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));

/** Offene Aufgaben mit Termin: überfällig (Termin vorbei) und heute noch fällig, nur die eigenen. */
export function dueStats(
  cards: (FilterableCard & { dueAt: string | null; completedAt: string | null })[],
  meId: string | null,
  doneColumnIds: Set<string>,
  nowMs: number,
  tz: string,
): { today: number; overdue: number } {
  let today = 0;
  let overdue = 0;
  for (const c of cards) {
    if (!c.dueAt || c.completedAt || doneColumnIds.has(c.columnId)) continue;
    if (!meId || !c.assigneeIds.includes(meId)) continue;
    const due = Date.parse(c.dueAt);
    if (due < nowMs) overdue += 1;
    else if (dayKey(due, tz) === dayKey(nowMs, tz)) today += 1;
  }
  return { today, overdue };
}

export function countByColumn(cards: FilterableCard[], columnIds: string[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(columnIds.map((id) => [id, 0]));
  for (const c of cards) if (c.columnId in counts) counts[c.columnId]! += 1;
  return counts;
}

/** Kosten aller Aufgaben eines Boards: was noch offen ist und was schon erledigt ist (in Cent). */
export function costTotals(
  cards: { columnId: string; costCents: number | null }[],
  doneColumnIds: Set<string>,
): { open: number; done: number } {
  let open = 0;
  let done = 0;
  for (const c of cards) {
    if (c.costCents === null) continue;
    if (doneColumnIds.has(c.columnId)) done += c.costCents;
    else open += c.costCents;
  }
  return { open, done };
}

/** Versteckt der Personenfilter von Boards („Meine" oder gewählte Personen) eine Aufgabe mit diesen Zuständigen? */
export function hiddenByPerson(assigneeIds: string[], f: Pick<Filter, 'onlyMine' | 'personIds'>, meId: string | null): boolean {
  if (f.onlyMine && (!meId || !assigneeIds.includes(meId))) return true;
  return !!f.personIds?.length && !assigneeIds.some((id) => f.personIds!.includes(id));
}
