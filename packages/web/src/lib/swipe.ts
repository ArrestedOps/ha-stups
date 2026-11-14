export interface SwipeColumn {
  id: string;
  name: string;
  isDone: boolean;
  isPlanned: boolean;
}

/** Welche Richtung eine Wischbewegung meint: Finger nach rechts (dx > 0) = nächster Status ('right'), Finger nach links = zurück ('left') */
export function swipeDirection(dx: number): 'left' | 'right' {
  return dx > 0 ? 'right' : 'left';
}

/**
 * Wohin eine Aufgabe beim Wischen springt: in den nächsten Status nach rechts, in den vorigen nach links.
 * „Geplant" wird dabei übersprungen. Aus „Geplant" heraus gibt es nach links kein Ziel, weil die Aufgabe
 * mit ihrem Termin sofort wieder dorthin zurückkehren würde.
 */
export function swipeTarget<T extends SwipeColumn>(columns: T[], currentId: string, dir: 'left' | 'right'): T | null {
  const i = columns.findIndex((c) => c.id === currentId);
  if (i < 0) return null;
  if (dir === 'left' && columns[i]!.isPlanned) return null;
  const step = dir === 'right' ? 1 : -1;
  for (let j = i + step; j >= 0 && j < columns.length; j += step) {
    if (!columns[j]!.isPlanned) return columns[j]!;
  }
  return null;
}

/**
 * Spalten, die im Menü „Verschieben nach" angeboten werden. Die Aufgabe darf nach „Geplant", wenn ihr
 * Termin nach heute liegt, und nicht nach „Offen" (die erste Spalte), wenn sie nach „Geplant" gehört.
 */
export function cardTargets<T extends SwipeColumn>(columns: T[], hasFutureDue: boolean, inboxId?: string): T[] {
  const hasPlanned = columns.some((c) => c.isPlanned);
  return columns.filter((c) => {
    if (c.isPlanned) return hasFutureDue;
    if (hasPlanned && hasFutureDue && c.id === inboxId) return false;
    return true;
  });
}

/**
 * Spalte für eine Aufgabe, die gerade angelegt wird: „Geplant" nimmt nur Aufgaben mit Termin nach heute. Stimmt der
 * Termin nicht (heute oder keiner), kommt die Aufgabe stattdessen in die erste offene Spalte.
 */
export function columnForDue<T extends SwipeColumn>(columns: T[], columnId: string, hasFutureDue: boolean): string {
  const current = columns.find((c) => c.id === columnId);
  if (!current?.isPlanned || hasFutureDue) return columnId;
  return columns.find((c) => !c.isDone && !c.isPlanned)?.id ?? columnId;
}