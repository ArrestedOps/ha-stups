import { detectSymbol } from './detect';

type Lang = 'de' | 'en';

/**
 * „Symbole aus Titeln erkennen“ (Einstellungen): zu jeder Aufgabe ohne Symbol das erkannte Symbol, erst in der Sprache der Oberfläche,
 * dann in der anderen (die Titel stehen so, wie jemand sie getippt hat). Aufgaben, zu denen nichts passt, fehlen in `items`.
 */
export function detectForCards(cards: { id: string; title: string }[], lang: Lang): { items: { id: string; icon: string }[]; total: number; unmatched: number } {
  const other: Lang = lang === 'de' ? 'en' : 'de';
  const items: { id: string; icon: string }[] = [];
  for (const c of cards) {
    const icon = detectSymbol(c.title, lang) ?? detectSymbol(c.title, other);
    if (icon) items.push({ id: c.id, icon });
  }
  return { items, total: cards.length, unmatched: cards.length - items.length };
}

/** In Pakete teilen (der Server nimmt je Aufruf höchstens 2000, wir schicken 500) */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
