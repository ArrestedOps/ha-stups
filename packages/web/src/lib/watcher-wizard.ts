/** Was „Zurück" im Assistenten für neue Wächter tut (reine Schrittlogik, die Oberfläche führt es aus) */
export type BackAction =
  /** eine offene Entitätssuche schließen; der Schritt bleibt, die Eingaben auch */
  | { kind: 'closePicker' }
  /** einen Schritt zurück, alle Eingaben bleiben */
  | { kind: 'step'; step: 1 | 2 | 3 }
  /** am Anfang: den Assistenten verlassen (zur vorherigen Auswahl, zum Beispiel „Gefunden", sonst schließen) */
  | { kind: 'leave' };

export function backAction(step: 1 | 2 | 3 | 4, pickerOpen: boolean): BackAction {
  if (pickerOpen) return { kind: 'closePicker' };
  if (step > 1) return { kind: 'step', step: (step - 1) as 1 | 2 | 3 };
  return { kind: 'leave' };
}
