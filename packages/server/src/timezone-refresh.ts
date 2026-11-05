export interface TimeZoneRefreshDeps {
  getConfig(): Promise<{ time_zone: string }>;
  set(timeZone: string): void;
  onConnected(cb: () => void): void;
  /** Zeitgeber (Tests setzen eine Attrappe); gibt eine Funktion zum Abbrechen zurück */
  setTimer(fn: () => void, ms: number): () => void;
  log?: { info(m: string): void };
  /** Wiederholung nach einem Fehler und regelmäßige Erneuerung (Vorgabe 30 Sekunden und 1 Stunde) */
  retryMs?: number;
  refreshMs?: number;
}

/**
 * Hält die Zeitzone aktuell: beim Start, nach jeder neuen Verbindung zu Home Assistant und stündlich (wer sie in Home Assistant
 * ändert oder wessen Start vor der Verbindung lag, behielte sonst bis zum Neustart die alte). Nach einem Fehler nach 30 Sekunden noch einmal.
 */
export function startTimeZoneRefresh(deps: TimeZoneRefreshDeps): { reload(): Promise<void> } {
  let current: string | null = null;
  let pending: (() => void) | null = null;

  async function reload(): Promise<void> {
    pending?.();
    pending = null;
    try {
      const { time_zone } = await deps.getConfig();
      if (typeof time_zone === 'string' && time_zone && time_zone !== current) {
        current = time_zone;
        deps.set(time_zone);
        deps.log?.info(`Zeitzone aus Home Assistant: ${time_zone}`);
      }
      pending = deps.setTimer(() => void reload(), deps.refreshMs ?? 3_600_000);
    } catch {
      pending = deps.setTimer(() => void reload(), deps.retryMs ?? 30_000);
    }
  }

  deps.onConnected(() => void reload());
  void reload();
  return { reload };
}
