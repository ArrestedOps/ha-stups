import { i18n } from '../i18n/index.svelte';
import { DE } from './keywords.de';
import { EN } from './keywords.en';
import { SYMBOLS, type SymbolInfo } from './library';
import { distance, fold, variants } from './text';

type Lang = 'de' | 'en';

interface Entry {
  info: SymbolInfo;
  /** Name in der Sprache der Oberfläche, gefaltet (der genaue Namenstreffer zählt mehr) */
  names: Record<Lang, string>;
  /** Alle einzelnen Wörter beider Sprachen (Name, Suchwörter, Kennung), gefaltet */
  words: string[];
}

let entries: Entry[] | null = null;
function build(): Entry[] {
  if (entries) return entries;
  entries = SYMBOLS.map((info) => {
    const de = DE[info.id]!;
    const en = EN[info.id]!;
    const all = [...de, ...en, info.id].flatMap((p) => fold(p).split(' ')).filter(Boolean);
    return { info, names: { de: fold(de[0]!), en: fold(en[0]!) }, words: [...new Set(all)] };
  });
  return entries;
}

/** Wie gut ein getipptes Wort zu den Wörtern eines Symbols passt (0 = gar nicht) */
function scoreToken(q: string, e: Entry, lang: Lang): number {
  let best = 0;
  if (e.names[lang] === q) best = 105;
  for (const w of e.words) {
    let s = 0;
    if (w === q) s = 100;
    else if (q.length >= 2 && w.startsWith(q)) s = 85 - Math.min(20, (w.length - q.length) * 0.5);
    else if (q.length >= 3 && w.includes(q)) s = 60;
    else if (q.length >= 4) {
      // Tippfehler: ein Zeichen daneben (ab 4 Buchstaben), zwei ab 8; auch am Wortanfang eines längeren Wortes
      const allowed = q.length >= 8 ? 2 : 1;
      const d = Math.min(distance(q, w), w.length > q.length ? distance(q, w.slice(0, q.length)) + 1 : Infinity);
      if (d <= allowed) s = 55 - d * 5;
    }
    if (s > best) best = s;
  }
  return best;
}

/**
 * Sucht Symbole: Name, Suchwörter in beiden Sprachen und die mdi-Kennung (auch „mdi:robot-vacuum“). Groß und klein, Umlaute
 * (und ihre Umschrift), Wortanfänge, Wortteile und einfache Tippfehler. Mehrere Wörter müssen alle passen.
 */
export function searchSymbols(query: string, lang: Lang = i18n.lang): SymbolInfo[] {
  const text = query.trim().replace(/^mdi:/i, '');
  const forms = variants(text).filter(Boolean);
  if (!forms.length) return [];
  const scored: { info: SymbolInfo; score: number; order: number }[] = [];
  build().forEach((e, order) => {
    let best = 0;
    for (const form of forms) {
      const tokens = form.split(' ');
      const parts = tokens.map((q) => scoreToken(q, e, lang));
      if (parts.some((p) => p === 0)) continue;
      const score = parts.reduce((a, b) => a + b, 0) / parts.length;
      if (score > best) best = score;
    }
    if (best > 0) scored.push({ info: e.info, score: best, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.info);
}
