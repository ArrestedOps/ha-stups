/**
 * Namen und Suchwörter der Symbole (je Sprache rund 30 kB) kommen als eigenes Paket: Sie werden nur gebraucht, wenn ein Symbolname
 * angezeigt, ein Symbol gesucht oder eines zum Aufgabentitel vorgeschlagen wird. Der erste Zugriff startet das Laden; bis dahin
 * liefert keywords() null, danach zeichnen sich die Stellen, die es lesen, von selbst neu ($state).
 */
export type WordTable = Record<string, readonly string[]>;
export interface Keywords {
  DE: WordTable;
  EN: WordTable;
}

const state = $state({ rev: 0 });
let loaded: Keywords | null = null;
let loading: Promise<void> | null = null;

export function loadKeywords(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= Promise.all([import('./keywords.de'), import('./keywords.en')]).then(
    ([de, en]) => {
      loaded = { DE: de.DE, EN: en.EN };
      state.rev++;
    },
    (e) => {
      loading = null; // beim nächsten Zugriff erneut versuchen
      throw e;
    },
  );
  return loading;
}

/** Die Tabellen, sobald sie da sind (sonst null; der Aufruf stößt das Laden an) */
export function keywords(): Keywords | null {
  void state.rev;
  if (!loaded) void loadKeywords().catch(() => undefined);
  return loaded;
}
