/**
 * Minutentakt für Anzeigen, die von der Uhrzeit abhängen („in 5 Minuten", überfällig, Linie „jetzt"):
 * `Date.now()` allein in einem `$derived` rechnet nur neu, wenn sich etwas anderes ändert, und bliebe sonst stehen.
 * Wer `void clock.tick` mitliest, rechnet jede Minute neu.
 */
export const clock = $state({ tick: 0 });

let timer: ReturnType<typeof setInterval> | null = null;

/** Startet den Takt (einmal; mehrfaches Aufrufen schadet nicht). Gibt eine Funktion zum Beenden zurück (für Tests). */
export function startClock(everyMs = 60_000): () => void {
  if (timer === null) timer = setInterval(() => void clock.tick++, everyMs);
  return () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
}

startClock();
