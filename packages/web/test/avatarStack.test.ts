import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AvatarStack from '../src/components/AvatarStack.svelte';
import { stackPlan } from '../src/lib/avatarStack';

describe('stackPlan (Variante D: höchstens drei Kreise breit)', () => {
  it.each([
    [0, 0, 0],
    [1, 1, 0],
    [2, 2, 0],
    [3, 3, 0],
    [4, 2, 2],
    [5, 2, 3],
    [9, 2, 7],
  ])('%i Personen: %i Bilder und „+%i“', (n, shown, more) => {
    expect(stackPlan(n)).toEqual({ shown, more });
    expect(stackPlan(n).shown + (stackPlan(n).more > 0 ? 1 : 0)).toBeLessThanOrEqual(3);
  });
});

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, displayName: ['Rene', 'Ben', 'Conny', 'Anna', 'Max'][i % 5]!, color: '#8fa8ff', avatarRev: null }));
const html = (n: number) => render(AvatarStack, { props: { people: people(n) } }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('AvatarStack', () => {
  it('eine Person: ein Bild, kein „+N“', () => {
    const out = html(1);
    expect(count(out, /title="/g)).toBe(1);
    expect(out).not.toContain('+');
  });
  it('drei Personen: drei Bilder überlappend', () => {
    const out = html(3);
    expect(count(out, /title="/g)).toBe(3);
    expect(count(out, /-ml-2\.5/g)).toBe(2);
    expect(out).not.toContain('+');
  });
  it('fünf Personen: zwei Bilder und „+3“', () => {
    const out = html(5);
    expect(count(out, /title="/g)).toBe(2);
    expect(out).toContain('+3');
  });
  it('für Screenreader steht jeder Name im Text, auch bei vielen', () => {
    const out = html(5);
    expect(out).toContain('role="img"');
    for (const n of ['Rene', 'Ben', 'Conny', 'Anna', 'Max']) expect(out).toContain(n);
  });
  it('ohne Personen nichts', () => {
    const out = html(0);
    expect(out).not.toContain('role="img"');
    expect(out).not.toContain('title="');
  });
});
