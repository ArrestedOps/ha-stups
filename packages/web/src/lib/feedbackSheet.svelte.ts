import type { FeedbackKind } from './feedback';

/**
 * Das Fenster „Feedback" (components/FeedbackSheet.svelte) gehört keinem Reiter und keinem anderen Fenster: Es liegt über allem,
 * was gerade offen ist (Einstellungen, Aufgaben, später die Seitenleiste), und schließt zurück dorthin. Jeder Einstieg ruft nur
 * `openFeedback()` auf, ohne Art (die Auswahl kommt zuerst) oder mit einer vorgewählten Art.
 */
export const feedbackSheet = $state({
  open: false,
  kind: null as FeedbackKind | null,
  /** Der Text bleibt, wenn das Fenster geschlossen wird, bis er gesendet ist (nur im Speicher dieser Seite, das Bild nicht) */
  draft: '',
});

export function openFeedback(kind: FeedbackKind | null = null): void {
  // Ohne Angabe bleibt die zuletzt gewählte Art, solange ein Entwurf da ist; sonst beginnt die Auswahl von vorn
  if (kind !== null) feedbackSheet.kind = kind;
  else if (feedbackSheet.draft.trim() === '') feedbackSheet.kind = null;
  feedbackSheet.open = true;
}

/** Nach dem Senden: Entwurf und Art sind weg */
export function resetFeedback(): void {
  feedbackSheet.draft = '';
  feedbackSheet.kind = null;
  feedbackSheet.open = false;
}

export function closeFeedback(): void {
  feedbackSheet.open = false;
}
