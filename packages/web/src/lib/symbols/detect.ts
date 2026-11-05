import { i18n } from '../i18n/index.svelte';
import { DE } from './keywords.de';
import { EN } from './keywords.en';
import { SYMBOLS } from './library';
import { fold, variants } from './text';

type Lang = 'de' | 'en';

interface Entry {
  id: string;
  name: string;
  words: string[];
}

/** Je Sprache die Wörter aller Symbole in Vergleichsform, in der Reihenfolge des Katalogs (sie entscheidet bei Gleichstand) */
const index: Record<Lang, Entry[]> = { de: [], en: [] };
function build(lang: Lang): Entry[] {
  if (index[lang].length) return index[lang];
  const table = lang === 'de' ? DE : EN;
  index[lang] = SYMBOLS.map((s) => {
    const [name, ...words] = table[s.id]!;
    const own = fold(name!);
    return { id: s.id, name: own, words: [...new Set(words.map(fold).filter((w) => w && w !== own))] };
  });
  return index[lang];
}

/**
 * Wie gut ein Suchwort zum Titel passt (0 = gar nicht). Stärker ist: das ganze Wort, dann das Wort mit Beugung (Hund → Hunde,
 * dog → dogs), dann der Wortanfang (Auto → Autowäsche), dann mitten im Wort (Papier → Altpapier), dann ein abgeschnittener Titel
 * (putze → putzen). Längere Suchwörter sind stärker als kurze. Mehrwort-Ausdrücke gelten nur als Ganzes.
 */
function scoreWord(kw: string, tokens: string[], joined: string): number {
  if (kw.includes(' ')) return (' ' + joined + ' ').includes(' ' + kw + ' ') ? 100 + kw.length : 0;
  let best = 0;
  for (const w of tokens) {
    let s = 0;
    if (w === kw) s = 100 + kw.length;
    else if (kw.length >= 3 && (w === kw + 's' || w === kw + 'es' || w === kw + 'n' || w === kw + 'en' || w === kw + 'e')) s = 95 + kw.length;
    else if (kw.length >= 4 && w.startsWith(kw)) s = 80 + kw.length;
    else if (kw.length >= 5 && w.includes(kw)) s = 60 + kw.length;
    else if (w.length >= 5 && kw.length > w.length && kw.startsWith(w)) s = 40 + w.length;
    if (s > best) best = s;
  }
  return best;
}

/** Punkte je Symbol für einen Titel; nur Symbole mit Treffer, das beste zuerst (bei Gleichstand das im Katalog frühere) */
function rank(title: string, lang: Lang): { id: string; score: number }[] {
  const forms = variants(title).filter(Boolean);
  if (!forms.length) return [];
  const prepared = forms.map((f) => ({ joined: f, tokens: f.split(' ') }));
  const out: { id: string; score: number; order: number }[] = [];
  build(lang).forEach((e, order) => {
    const hits: { kw: string; s: number }[] = [];
    for (const kw of [e.name, ...e.words]) {
      const s = Math.max(...prepared.map((p) => scoreWord(kw, p.tokens, p.joined)));
      if (s > 0) hits.push({ kw, s });
    }
    if (!hits.length) return;
    hits.sort((a, b) => b.s - a.s);
    const top = hits[0]!;
    // Mehr Treffer sprechen für das Symbol, und trifft das Wort genau den Namen des Symbols, ist es die genaueste Wahl
    const score = top.s + 10 * Math.min(hits.length - 1, 3) + (top.kw === e.name ? 20 : 0);
    out.push({ id: e.id, score, order });
  });
  return out.sort((a, b) => b.score - a.score || a.order - b.order).map(({ id, score }) => ({ id, score }));
}

/** Das Symbol, das zum Titel passt (Tabelle von Suchwörtern, keine Heuristik); null, wenn nichts erkannt wird */
export function detectSymbol(title: string, lang: Lang = i18n.lang): string | null {
  return rank(title, lang)[0]?.id ?? null;
}

/** Die besten Vorschläge zum Titel („Passt zu …“); der erste ist das erkannte Symbol */
export function symbolSuggestions(title: string, lang: Lang = i18n.lang, limit = 4): string[] {
  return rank(title, lang)
    .slice(0, limit)
    .map((r) => r.id);
}
