/**
 * Gegen veraltete Antworten: Wer eine neue Anfrage startet, macht alle früheren ungültig.
 *
 *   const latest = createLatest();
 *   const mine = latest.next();      // vor der Anfrage
 *   const data = await api.x();
 *   if (!latest.isCurrent(mine)) return; // inzwischen kam eine neuere
 *
 * `run` fasst das zusammen und bricht die alte Anfrage mit einem AbortSignal ab (für Aufrufe, die eines annehmen).
 */
export function createLatest() {
  let counter = 0;
  let controller: AbortController | null = null;
  return {
    /** Beginnt eine neue Anfrage; gibt ihre Nummer zurück */
    next(): number {
      controller?.abort();
      controller = null;
      return ++counter;
    },
    isCurrent: (n: number): boolean => n === counter,
    /** Führt `fn` aus; das Ergebnis kommt nur an, wenn keine neuere Anfrage gestartet wurde (sonst `undefined`, auch bei Fehlern) */
    async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<{ current: true; value: T } | { current: false }> {
      controller?.abort();
      const own = new AbortController();
      controller = own;
      const mine = ++counter;
      try {
        const value = await fn(own.signal);
        return mine === counter ? { current: true, value } : { current: false };
      } catch (err) {
        if (mine !== counter || own.signal.aborted) return { current: false };
        throw err;
      }
    },
  };
}
export type Latest = ReturnType<typeof createLatest>;
