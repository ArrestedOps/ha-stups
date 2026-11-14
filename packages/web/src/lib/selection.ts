// Auswahl in Listen (Wächter, „Gefunden“): eine Menge von Kennungen, die nie verändert, sondern immer neu gebaut wird (so merkt Svelte jede Änderung)

export type Selection = ReadonlySet<string>;

/** Eine Kennung an- oder abwählen */
export function toggle(s: Selection, id: string): Selection {
  const out = new Set(s);
  if (out.has(id)) out.delete(id);
  else out.add(id);
  return out;
}

/** Alle diese Kennungen dazunehmen (zum Beispiel „Alle auswählen“ im Kopf einer Gruppe) */
export const selectAll = (s: Selection, ids: string[]): Selection => new Set([...s, ...ids]);

export const clearAll = (): Selection => new Set<string>();

/** Sind alle diese Kennungen gewählt? Bei einer leeren Liste nie (es gibt nichts zu wählen) */
export const allSelected = (s: Selection, ids: string[]): boolean => ids.length > 0 && ids.every((id) => s.has(id));

/** Veraltete Kennungen (der Eintrag ist inzwischen weg) aus der Auswahl nehmen; stimmt alles, bleibt die Auswahl dieselbe */
export function prune(s: Selection, existing: string[]): Selection {
  const have = new Set(existing);
  const kept = [...s].filter((id) => have.has(id));
  return kept.length === s.size ? s : new Set(kept);
}
