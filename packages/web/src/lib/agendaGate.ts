/** So lange bleibt der Stand von Aufgaben und Glocke auf einem anderen Reiter als „Aufgaben" ungeprüft, bevor eine Änderung ihn neu lädt */
export const AGENDA_QUIET_MS = 30_000;

/**
 * Wie lange noch gewartet wird, bis Aufgaben und Glocke neu geladen werden (0 = jetzt). Auf dem Reiter „Aufgaben" gilt jede Änderung gleich;
 * auf den anderen Reitern höchstens alle `quietMs`, damit nicht jede Änderung einer einzelnen Karte (Live-Sync lädt dort nur diese Karte)
 * zusätzlich alle Termine aller Boards holt.
 */
export function agendaDelay(lastLoadMs: number, nowMs: number, onTasks: boolean, quietMs = AGENDA_QUIET_MS): number {
  if (onTasks) return 0;
  return Math.max(0, lastLoadMs + quietMs - nowMs);
}
