/**
 * Listen, die der Server seitenweise liefert: `limit`/`offset` in der Anfrage, die Gesamtzahl vor dem Abschneiden in `x-total-count`.
 * Geblättert wird nach der Gesamtzahl, nicht nach der Länge der Antwort: Der Server filtert für Kinder nach dem Abschneiden, eine Seite
 * kann also kürzer (oder leer) sein, obwohl es weitergeht.
 */
export interface Page<T> {
  items: T[];
  /** Gesamtzahl laut Server; NaN, wenn der Server sie nicht nennt (dann bleibt es bei der ersten Antwort) */
  total: number;
}

export async function fetchAllPages<T extends { id: string }>(page: (offset: number) => Promise<Page<T>>, pageSize: number): Promise<T[]> {
  const out: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    const { items, total } = await page(offset);
    // Verschiebt sich der Bestand zwischen zwei Seiten, kann dieselbe Aufgabe zweimal kommen
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
    if (!(offset + pageSize < total)) return out;
  }
}
