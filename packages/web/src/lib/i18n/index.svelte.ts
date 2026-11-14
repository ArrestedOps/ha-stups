import type { Catalog } from './en';

/**
 * Sprachen der Oberfläche. Der deutsche Text steht im Quelltext und ist der Schlüssel: t('Aufgabe löschen?').
 * Fehlt der englische Eintrag, erscheint der deutsche Text.
 */
export type Lang = 'de' | 'en';
/** „auto" folgt dem Gerät */
export type LanguageChoice = 'auto' | Lang;

/**
 * Reaktiv: Komponenten, die t() aufrufen, zeichnen sich bei einem Wechsel neu.
 * `rev` zählt, wie oft der englische Katalog gewechselt hat (geladen wurde): Er kommt als eigenes Paket und nur, wenn er gebraucht wird.
 */
export const i18n = $state({ lang: 'en' as Lang, rev: 0 });

let catalog: Catalog = {};
let loaded = false;
let loading: Promise<void> | null = null;

/** Lädt den englischen Katalog (einmal). Bis er da ist, erscheint der deutsche Text; danach zeichnet sich die Oberfläche neu. */
export function loadCatalog(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= import('./en').then(
    ({ en }) => {
      if (!loaded) {
        catalog = en;
        loaded = true;
        i18n.rev++;
      }
    },
    (e) => {
      loading = null; // beim nächsten Wechsel erneut versuchen
      throw e;
    },
  );
  return loading;
}

/** Ersetzt den Katalog (nur für Tests); die Rückgabe stellt ihn wieder her */
export function useCatalog(c: Catalog): () => void {
  const before = catalog;
  const wasLoaded = loaded;
  catalog = c;
  loaded = true;
  i18n.rev++;
  return () => {
    catalog = before;
    loaded = wasLoaded;
    i18n.rev++;
  };
}

export function setLanguage(lang: Lang): void {
  i18n.lang = lang;
  if (lang === 'en') void loadCatalog().catch(() => undefined);
}

/** Datums- und Zahlenformat der Sprache */
export const numberLocale = (): 'de-DE' | 'en-GB' => (i18n.lang === 'de' ? 'de-DE' : 'en-GB');

type Params = Record<string, string | number>;

/** Ein Durchgang: Ein Wert, der selbst wie ein Platzhalter aussieht, wird nicht noch einmal ersetzt */
function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

/** Der Katalog der Sprache: Auf Deutsch gibt es keinen (der Text ist der Schlüssel); `rev` macht den Zugriff reaktiv, wenn er nachgeladen wird */
function entryOf(key: string): string | readonly [string, string] | undefined {
  if (i18n.lang !== 'en') return undefined;
  void i18n.rev;
  return catalog[key];
}

export function t(text: string, params?: Params): string {
  const entry = entryOf(text);
  return fill(typeof entry === 'string' ? entry : text, params);
}

/**
 * Wie t(), für ein deutsches Wort mit mehreren englischen Bedeutungen („Alle" = All im Filter, Every bei der Wiederholung):
 * Der Katalog führt den Eintrag unter „Kontext|Text". Auf Deutsch ist das einfach der Text.
 */
export function tx(context: string, text: string, params?: Params): string {
  const entry = entryOf(`${context}|${text}`);
  return fill(typeof entry === 'string' ? entry : text, params);
}

/** Mehrzahl: `one` ist der Schlüssel (und der deutsche Text für n = 1), `other` der deutsche Text sonst. {n} wird ersetzt. */
export function tn(one: string, other: string, n: number): string {
  const entry = entryOf(one);
  const text = Array.isArray(entry) ? (n === 1 ? entry[0] : entry[1]) : n === 1 ? one : other;
  return fill(text, { n });
}

/** Feste Wahl, sonst Deutsch, wenn das Gerät Deutsch bevorzugt, sonst Englisch */
export function resolveLanguage(choice: LanguageChoice, preferred: readonly string[]): Lang {
  if (choice !== 'auto') return choice;
  return preferred.some((l) => /^de(\b|-|_)/i.test(l)) ? 'de' : 'en';
}

/** Gemerkte Wahl aus dem lokalen Speicher; alles Unbekannte heißt Automatisch */
export function languageFromStorage(raw: string | null): LanguageChoice {
  return raw === 'de' || raw === 'en' ? raw : 'auto';
}
