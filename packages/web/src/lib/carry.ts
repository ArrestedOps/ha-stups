import type { CarryField } from './api';

/** Was eine wiederkehrende Karte in die nächste Karte mitnehmen kann (Reihenfolge wie in der Oberfläche) */
export const CARRY_OPTIONS: { field: CarryField; label: string; hint?: string }[] = [
  { field: 'description', label: 'Beschreibung' },
  { field: 'checklist', label: 'Checkliste', hint: 'alle Einträge wieder offen' },
  { field: 'links', label: 'Links' },
  { field: 'cost', label: 'Kosten' },
  { field: 'attachments', label: 'Fotos und PDFs' },
  { field: 'comments', label: 'Kommentare' },
];

/** Gilt, solange man nichts ändert: Fotos und Kommentare gehören meist zu genau einem Durchgang */
export const DEFAULT_CARRY: CarryField[] = ['description', 'checklist', 'links', 'cost'];

/** Schaltet ein Feld ein oder aus und behält die Reihenfolge der Oberfläche bei */
export function toggleCarry(current: CarryField[], field: CarryField, on: boolean): CarryField[] {
  const set = new Set(current);
  if (on) set.add(field);
  else set.delete(field);
  return CARRY_OPTIONS.map((o) => o.field).filter((f) => set.has(f));
}
