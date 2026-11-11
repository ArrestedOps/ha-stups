import { describe, expect, it } from 'vitest';
import { fetchAllPages } from '../src/lib/paging';

/**
 * Listen, die der Server seitenweise liefert (`limit`/`offset`, Gesamtzahl in `x-total-count`): Der Client holt Seiten, bis alles da ist.
 * Ein stilles Abschneiden darf keine Karte in der Ansicht verschwinden lassen.
 */
const card = (n: number) => ({ id: `c${n}` });
const server = (all: { id: string }[], opts: { hide?: (c: { id: string }) => boolean; pageSize: number }) => {
  const calls: number[] = [];
  return {
    calls,
    page: async (offset: number) => {
      calls.push(offset);
      const raw = all.slice(offset, offset + opts.pageSize);
      return { items: opts.hide ? raw.filter((c) => !opts.hide!(c)) : raw, total: all.length };
    },
  };
};

describe('fetchAllPages', () => {
  it('eine einzige Seite genügt, wenn alles hineinpasst (ein Aufruf)', async () => {
    const s = server([1, 2, 3].map(card), { pageSize: 5 });
    expect((await fetchAllPages(s.page, 5)).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(s.calls).toEqual([0]);
  });

  it('mehr als eine Seite: holt weiter, bis die Gesamtzahl erreicht ist, in der Reihenfolge des Servers', async () => {
    const s = server([1, 2, 3, 4, 5].map(card), { pageSize: 2 });
    expect((await fetchAllPages(s.page, 2)).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(s.calls).toEqual([0, 2, 4]);
  });

  it('genau eine volle Seite ist keine Aufforderung zum Weiterblättern', async () => {
    const s = server([1, 2].map(card), { pageSize: 2 });
    expect(await fetchAllPages(s.page, 2)).toHaveLength(2);
    expect(s.calls).toEqual([0]);
  });

  it('eine Seite, die der Server nach dem Filter leert (Kind), beendet das Blättern nicht', async () => {
    const s = server([1, 2, 3, 4].map(card), { pageSize: 2, hide: (c) => c.id !== 'c4' });
    expect((await fetchAllPages(s.page, 2)).map((c) => c.id)).toEqual(['c4']);
    expect(s.calls).toEqual([0, 2]);
  });

  it('verschiebt sich der Bestand zwischen zwei Seiten, kommt keine Karte doppelt', async () => {
    const pages = [
      { items: [card(1), card(2)], total: 4 },
      { items: [card(2), card(3)], total: 4 }, // c2 rutschte auf die zweite Seite
    ];
    let i = 0;
    const out = await fetchAllPages(async () => pages[i++]!, 2);
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('ohne Gesamtzahl (ein Server ohne Seiten) bleibt es bei der ersten Antwort, statt endlos zu fragen', async () => {
    let n = 0;
    const out = await fetchAllPages(async () => (n++, { items: [card(1), card(2)], total: Number.NaN }), 2);
    expect(n).toBe(1);
    expect(out).toHaveLength(2);
  });

  it('ein Fehler bei einer Seite bricht das Ganze ab, statt eine unvollständige Liste zu liefern', async () => {
    let n = 0;
    await expect(
      fetchAllPages(async () => {
        if (n++ === 1) throw new Error('weg');
        return { items: [card(n)], total: 4 };
      }, 1),
    ).rejects.toThrow('weg');
  });
});
