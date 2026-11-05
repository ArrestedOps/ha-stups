/**
 * Wie viele Personenbilder eine Karte zeigt (Variante D): höchstens drei Kreise breit.
 * Bis zu drei Personen stehen alle da, ab vier zwei Bilder und ein Kreis „+N“ mit der Zahl der übrigen.
 */
export function stackPlan(count: number): { shown: number; more: number } {
  if (count <= 0) return { shown: 0, more: 0 };
  if (count <= 3) return { shown: count, more: 0 };
  return { shown: 2, more: count - 2 };
}
