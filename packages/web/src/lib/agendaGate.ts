/** So lange bleibt der Stand von Aufgaben und Glocke auf einem anderen Reiter als „Aufgaben" ungeprüft, bevor eine Änderung ihn neu lädt */
export const AGENDA_QUIET_MS = 30_000;

/** Auf „Aufgaben" laden Änderungen, die schneller aufeinander folgen, in einer einzigen Runde nach (die erste sofort, ein Nachlauf zum Schluss) */
export const AGENDA_BURST_MS = 400;

/**
 * Wie lange noch gewartet wird, bis Aufgaben und Glocke neu geladen werden (0 = jetzt). Auf dem Reiter „Aufgaben" lädt die erste Änderung
 * sofort, folgen weitere innerhalb von `AGENDA_BURST_MS`, wartet der Nachlauf auf den Rest (eine Serie von zehn Änderungen kostet zwei
 * Runden statt zehn). Auf den anderen Reitern höchstens alle `quietMs`, damit nicht jede Änderung einer einzelnen Karte (Live-Sync lädt
 * dort nur diese Karte) zusätzlich alle Termine aller Boards holt.
 */
export function agendaDelay(lastLoadMs: number, nowMs: number, onTasks: boolean, quietMs = AGENDA_QUIET_MS): number {
  return Math.max(0, lastLoadMs + (onTasks ? AGENDA_BURST_MS : quietMs) - nowMs);
}
