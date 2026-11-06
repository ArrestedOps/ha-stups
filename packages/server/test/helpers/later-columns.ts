/**
 * Spalten, die spätere Migrationen an bestehende Tabellen hängen (watchers.category, Boards mit Sichtbarkeit, Wächter mit Fairness):
 * Die Tests der älteren Migrationen vergleichen den Stand davor und danach ohne diese Spalten.
 */
const LATER: Record<string, string[]> = {
  watchers: ['category', 'counts_for_fairness', 'assignees_missing'],
  boards: ['visibility', 'owner_id', 'counts_for_fairness'],
};

export function withoutLater(table: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const skip = new Set(LATER[table] ?? []);
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !skip.has(k))));
}
