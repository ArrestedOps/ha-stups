/**
 * Auf dem iPhone ändert die Bildschirmtastatur das Layout-Fenster nicht, nur die sichtbare Fläche (visualViewport).
 * Ein unten verankertes Sheet läge sonst hinter der Tastatur. Hier steht, wie weit es hochrücken muss
 * und wie hoch es höchstens sein darf.
 */
export interface SheetInsets {
  /** Abstand zum unteren Rand des Layout-Fensters in px (0 = keine Tastatur) */
  bottom: number;
  /** Höchstens so hoch, damit Kopfzeile und Eingabefeld sichtbar bleiben */
  maxHeight: number | null;
}

export function sheetInsets(innerHeight: number, vvHeight: number, vvOffsetTop: number): SheetInsets {
  const hidden = Math.round(innerHeight - vvHeight - vvOffsetTop);
  // Kleine Abweichungen (Adressleiste, Rundung) sind keine Tastatur
  if (hidden < 80) return { bottom: 0, maxHeight: null };
  return { bottom: hidden, maxHeight: Math.max(240, Math.round(vvHeight - 12)) };
}
