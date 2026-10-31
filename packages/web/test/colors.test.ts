import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, findCategory, nextColor } from '../src/lib/colors';

describe('nextColor', () => {
  it('nimmt die erste Farbe, die noch nicht benutzt wird', () => {
    expect(nextColor([])).toBe('blue');
    expect(nextColor(['blue'])).toBe('teal');
    expect(nextColor(['blue', 'green'])).toBe('teal');
  });

  it('sind alle benutzt, geht es reihum weiter', () => {
    const all = [...CATEGORY_COLORS];
    expect(nextColor(all)).toBe(CATEGORY_COLORS[0]);
    expect(nextColor([...all, 'blue'])).toBe(CATEGORY_COLORS[1]);
  });
});

describe('findCategory', () => {
  const list = [{ id: '1', name: 'Putzen' }, { id: '2', name: ' Garten ' }];
  it('findet den Namen unabhängig von Groß- und Kleinschreibung und Leerzeichen', () => {
    expect(findCategory(list, 'putzen')?.id).toBe('1');
    expect(findCategory(list, 'GARTEN')?.id).toBe('2');
    expect(findCategory(list, 'Date')).toBeUndefined();
  });
});
