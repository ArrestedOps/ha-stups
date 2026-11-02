import { en, type Catalog } from './en';

/**
 * Sprachen der Oberfläche. Der deutsche Text steht im Quelltext und ist der Schlüssel: t('Karte löschen?').
 * Fehlt der englische Eintrag, erscheint der deutsche Text.
 */
export type Lang = 'de' | 'en';
/** „auto" folgt dem Gerät */
export type LanguageChoice = 'auto' | Lang;

/** Reaktiv: Komponenten, die t() aufrufen, zeichnen sich bei einem Wechsel neu */
export const i18n = $state({ lang: 'en' as Lang });

let catalog: Catalog = en;

/** Ersetzt den Katalog (nur für Tests); die Rückgabe stellt ihn wieder her */
export function useCatalog(c: Catalog): () => void {
  const before = catalog;
  catalog = c;
  return () => {
    catalog = before;
  };
}

export function setLanguage(lang: Lang): void {
  i18n.lang = lang;
}

/** Datums- und Zahlenformat der Sprache */
export const numberLocale = (): 'de-DE' | 'en-GB' => (i18n.lang === 'de' ? 'de-DE' : 'en-GB');

type Params = Record<string, string | number>;

/** Ein Durchgang: Ein Wert, der selbst wie ein Platzhalter aussieht, wird nicht noch einmal ersetzt */
function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

export function t(text: string, params?: Params): string {
  const entry = i18n.lang === 'en' ? catalog[text] : undefined;
  return fill(typeof entry === 'string' ? entry : text, params);
}

/**
 * Wie t(), für ein deutsches Wort mit mehreren englischen Bedeutungen („Alle" = All im Filter, Every bei der Wiederholung):
 * Der Katalog führt den Eintrag unter „Kontext|Text". Auf Deutsch ist das einfach der Text.
 */
export function tx(context: string, text: string, params?: Params): string {
  const entry = i18n.lang === 'en' ? catalog[`${context}|${text}`] : undefined;
  return fill(typeof entry === 'string' ? entry : text, params);
}

/** Mehrzahl: `one` ist der Schlüssel (und der deutsche Text für n = 1), `other` der deutsche Text sonst. {n} wird ersetzt. */
export function tn(one: string, other: string, n: number): string {
  const entry = i18n.lang === 'en' ? catalog[one] : undefined;
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
