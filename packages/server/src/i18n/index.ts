import { AsyncLocalStorage } from 'node:async_hooks';
import { en, type Catalog } from './en.js';

/**
 * Sprachen des Servers. Wie im Browser steht der deutsche Text im Quelltext und ist der Schlüssel: t('Nicht gefunden').
 * Fehlt der englische Eintrag, erscheint der deutsche Text. Die Sprache gilt je Anfrage (AsyncLocalStorage) oder, für Push
 * und andere Arbeit ohne Anfrage, je Empfänger über withLanguage.
 */
export type Lang = 'de' | 'en';

let fallback: Lang = 'en';
let catalog: Catalog = en;
const store = new AsyncLocalStorage<Lang>();

/** Sprache, wenn nichts anderes gilt (Betrieb: Englisch; die Tests stellen Deutsch ein) */
export function setDefaultLanguage(lang: Lang): void {
  fallback = lang;
}

export const currentLanguage = (): Lang => store.getStore() ?? fallback;

/** Führt `fn` (auch asynchron) in dieser Sprache aus */
export function withLanguage<T>(lang: Lang, fn: () => T): T {
  return store.run(lang, fn);
}

/** Ersetzt den Katalog (nur für Tests); die Rückgabe stellt ihn wieder her */
export function useCatalog(c: Catalog): () => void {
  const before = catalog;
  catalog = c;
  return () => {
    catalog = before;
  };
}

/**
 * Sprache aus einer Kopfzeile (`X-Stups-Language` oder `Accept-Language`): nach Gewichtung die erste Sprache, die Stups kennt;
 * null, wenn keine dabei ist oder der Wert unbrauchbar ist.
 */
export function parseLanguage(header: string | undefined): Lang | null {
  if (!header) return null;
  const entries = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(p)?.[1]).find((v) => v !== undefined);
      const weight = q === undefined ? 1 : Number(q);
      return { primary: tag.trim().toLowerCase().split('-')[0] ?? '', weight: Number.isFinite(weight) ? weight : 1, index };
    })
    .filter((e) => e.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const e of entries) {
    if (e.primary === 'de') return 'de';
    if (e.primary === 'en') return 'en';
  }
  return null;
}

type Params = Record<string, string | number>;

/** Ein Durchgang: Ein Wert, der selbst wie ein Platzhalter aussieht, wird nicht noch einmal ersetzt */
function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

export function t(text: string, params?: Params): string {
  const entry = currentLanguage() === 'en' ? catalog[text] : undefined;
  return fill(typeof entry === 'string' ? entry : text, params);
}

/** Mehrzahl: `one` ist der Schlüssel (und der deutsche Text für n = 1), `other` der deutsche Text sonst. {n} wird ersetzt. */
export function tn(one: string, other: string, n: number): string {
  const entry = currentLanguage() === 'en' ? catalog[one] : undefined;
  const text = Array.isArray(entry) ? (n === 1 ? entry[0] : entry[1]) : n === 1 ? one : other;
  return fill(text, { n });
}

/** Wie t(), für ein deutsches Wort mit mehreren englischen Bedeutungen: Der Katalog führt es unter „Kontext|Text“ */
export function tx(context: string, text: string, params?: Params): string {
  const entry = currentLanguage() === 'en' ? catalog[`${context}|${text}`] : undefined;
  return fill(typeof entry === 'string' ? entry : text, params);
}
