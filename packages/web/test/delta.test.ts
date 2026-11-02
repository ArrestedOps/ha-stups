import { describe, expect, it } from 'vitest';
import type { BoardView, Card } from '../src/lib/api';
import { applyCards, deltaIds, MAX_DELTA_CARDS } from '../src/lib/delta';

const card = (id: string, position: string, extra: Partial<Card> = {}): Card =>
  ({ id, boardId: 'b1', columnId: 'c1', position, title: id, costCents: null, ...extra }) as Card;

const view = (cards: Card[]): BoardView =>
  ({ board: { id: 'b1' }, columns: [], categories: [], cards, costTotalCents: 0 }) as unknown as BoardView;

describe('deltaIds: nachladen oder alles neu laden', () => {
  it('ohne Angabe, bei „alles" oder nach einer Lücke: alles neu laden', () => {
    expect(deltaIds(undefined, false)).toBeNull();
    expect(deltaIds({ full: true, cards: ['a'] }, false)).toBeNull();
    expect(deltaIds({ full: false, cards: ['a'] }, true)).toBeNull();
  });

  it('einzelne Karten: genau diese', () => {
    expect(deltaIds({ full: false, cards: ['a', 'b'] }, false)).toEqual(['a', 'b']);
    expect(deltaIds({ full: false, cards: [] }, false)).toEqual([]);
  });

  it('mehr als der Server auf einmal liefert: alles neu laden', () => {
    const cards = Array.from({ length: MAX_DELTA_CARDS + 1 }, (_, i) => `c${i}`);
    expect(deltaIds({ full: false, cards }, false)).toBeNull();
    expect(deltaIds({ full: false, cards: cards.slice(1) }, false)).toHaveLength(MAX_DELTA_CARDS);
  });
});

describe('applyCards', () => {
  it('ersetzt eine geänderte Karte und lässt die anderen unberührt', () => {
    const a = card('a', 'a0');
    const b = card('b', 'a1');
    const out = applyCards(view([a, b]), ['a'], [card('a', 'a0', { title: 'neu' })])!;
    expect(out.cards.map((c) => c.title)).toEqual(['neu', 'b']);
    expect(out.cards[1]).toBe(b);
  });

  it('eine neue Karte kommt an ihre Stelle nach Position (bei gleicher Position nach Kennung)', () => {
    const out = applyCards(view([card('a', 'a0'), card('c', 'a2')]), ['b', 'd'], [card('b', 'a1'), card('d', 'a2')])!;
    expect(out.cards.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('verschieben ändert die Reihenfolge', () => {
    const out = applyCards(view([card('a', 'a0'), card('b', 'a1')]), ['a'], [card('a', 'a2')])!;
    expect(out.cards.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('Karten, die der Server nicht mehr liefert (gelöscht, archiviert), verschwinden', () => {
    const out = applyCards(view([card('a', 'a0'), card('b', 'a1')]), ['a'], [])!;
    expect(out.cards.map((c) => c.id)).toEqual(['b']);
  });

  it('eine Karte, die in ein anderes Board gewandert ist, verschwindet', () => {
    const out = applyCards(view([card('a', 'a0')]), ['a'], [card('a', 'a0', { boardId: 'b2' })])!;
    expect(out.cards).toEqual([]);
  });

  it('eine Karte eines anderen Boards kommt nicht hinein', () => {
    const out = applyCards(view([card('a', 'a0')]), ['x'], [card('x', 'a1', { boardId: 'b2' })])!;
    expect(out.cards.map((c) => c.id)).toEqual(['a']);
  });

  it('geholte Karten, die nicht angefragt waren, werden ignoriert', () => {
    const out = applyCards(view([card('a', 'a0')]), ['a'], [card('a', 'a0'), card('z', 'a9')])!;
    expect(out.cards.map((c) => c.id)).toEqual(['a']);
  });

  it('der Rest der Ansicht bleibt, die Eingabe wird nicht verändert', () => {
    const v = view([card('a', 'a0')]);
    const out = applyCards(v, ['a'], [card('a', 'a0', { title: 'neu' })])!;
    expect(out.board).toBe(v.board);
    expect(out.costTotalCents).toBe(0);
    expect(v.cards[0]!.title).toBe('a');
  });

  it('Kosten im Spiel (vorher oder nachher): null, denn die Summe steht nur im ganzen Board', () => {
    expect(applyCards(view([card('a', 'a0', { costCents: 500 })]), ['a'], [card('a', 'a0')])).toBeNull();
    expect(applyCards(view([card('a', 'a0')]), ['a'], [card('a', 'a0', { costCents: 500 })])).toBeNull();
    expect(applyCards(view([card('a', 'a0', { costCents: 500 }), card('b', 'a1')]), ['b'], [card('b', 'a1')])).not.toBeNull();
  });
});
