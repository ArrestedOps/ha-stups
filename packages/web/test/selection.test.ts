import { describe, expect, it } from 'vitest';
import { allSelected, clearAll, prune, selectAll, toggle } from '../src/lib/selection';

describe('Auswahl', () => {
  it('toggle fügt hinzu und nimmt wieder heraus, ohne die alte Auswahl zu ändern', () => {
    const a = clearAll();
    const b = toggle(a, 'x');
    expect([...b]).toEqual(['x']);
    expect(a.size).toBe(0);
    expect(toggle(b, 'x').size).toBe(0);
    expect([...toggle(b, 'y')]).toEqual(['x', 'y']);
  });

  it('selectAll fügt hinzu, was fehlt, und lässt den Rest', () => {
    const s = selectAll(new Set(['a']), ['b', 'c', 'a']);
    expect([...s].sort()).toEqual(['a', 'b', 'c']);
  });

  it('allSelected: alle da, bei einer leeren Liste nie', () => {
    expect(allSelected(new Set(['a', 'b']), ['a', 'b'])).toBe(true);
    expect(allSelected(new Set(['a']), ['a', 'b'])).toBe(false);
    expect(allSelected(new Set(['a']), [])).toBe(false);
  });

  it('prune wirft veraltete Kennungen raus; bleibt alles, kommt dieselbe Auswahl zurück', () => {
    const s: ReadonlySet<string> = new Set(['a', 'b', 'gone']);
    expect([...prune(s, ['a', 'b', 'c'])]).toEqual(['a', 'b']);
    const t: ReadonlySet<string> = new Set(['a']);
    expect(prune(t, ['a', 'b'])).toBe(t);
  });
});
