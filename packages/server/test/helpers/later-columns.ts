/**
 * Spalten, die spätere Migrationen an bestehende Tabellen hängen (watchers.category, Boards mit Sichtbarkeit, Wächter mit Fairness) und die Spalten, die sie entfernen (cards.overdue_nag, watchers.nudge_after_min):
 * Die Tests der älteren Migrationen vergleichen den Stand davor und danach ohne diese Spalten (beide Seiten durch withoutLater).
 */
const LATER: Record<string, string[]> = {
  watchers: ['category', 'counts_for_fairness', 'assignees_missing', 'nudge_json', 'nudge_after_min'],
  boards: ['visibility', 'owner_id', 'counts_for_fairness'],
  // Migration 28 hat diese Spalten entfernt (Nachhaken wurde eine eigene Tabelle): sie zählen auf keiner Seite des Vergleichs
  cards: ['overdue_nag'],
};

export function withoutLater(table: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const skip = new Set(LATER[table] ?? []);
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !skip.has(k))));
}
