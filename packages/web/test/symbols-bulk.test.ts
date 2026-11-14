import { describe, expect, it } from 'vitest';
import { detectForCards, chunk } from '../src/lib/symbols/bulk';

// Feste Datenmenge: Aufgaben ohne Symbol, wie der Server sie für „Symbole aus Titeln erkennen“ liefert
const cards = [
  { id: 'a', title: 'Müll raus' },
  { id: 'b', title: 'Waschmaschine ausräumen' },
  { id: 'c', title: 'Dinge' },
  { id: 'd', title: 'Take out the rubbish' },
  { id: 'e', title: '   ' },
  { id: 'f', title: 'Bad putzen' },
  { id: 'g', title: 'Milch kaufen' },
];

describe('Symbole für viele Aufgaben erkennen', () => {
  it('deutsch eingestellt: deutsche Titel, und englische als zweiter Versuch', () => {
    const r = detectForCards(cards, 'de');
    expect(r.items).toEqual([
      { id: 'a', icon: 'trash-can-outline' },
      { id: 'b', icon: 'washing-machine' },
      { id: 'd', icon: 'trash-can-outline' },
      { id: 'f', icon: 'water-outline' },
      { id: 'g', icon: 'cart-outline' },
    ]);
    expect(r.total).toBe(7);
    expect(r.unmatched).toBe(2);
  });
  it('englisch eingestellt: gleiches Ergebnis', () => {
    const r = detectForCards(cards, 'en');
    expect(r.items.map((i) => i.id)).toEqual(['a', 'b', 'd', 'f', 'g']);
  });
  it('keine Aufgaben, nichts zu tun', () => {
    expect(detectForCards([], 'de')).toEqual({ items: [], total: 0, unmatched: 0 });
  });
  it('Aufgaben ohne erkennbaren Titel bleiben unberührt (kein Standardsymbol als Erkennung)', () => {
    expect(detectForCards([{ id: 'x', title: 'qqq www' }], 'de').items).toEqual([]);
  });
  it('Pakete von höchstens n Einträgen', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(chunk([1], 500)).toEqual([[1]]);
  });
});
