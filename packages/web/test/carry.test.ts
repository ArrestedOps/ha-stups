import { describe, expect, it } from 'vitest';
import { CARRY_OPTIONS, DEFAULT_CARRY, toggleCarry } from '../src/lib/carry';

describe('toggleCarry', () => {
  it('schaltet ein Feld ein und hält die Reihenfolge der Oberfläche', () => {
    expect(toggleCarry(['description', 'cost'], 'links', true)).toEqual(['description', 'links', 'cost']);
    expect(toggleCarry([], 'comments', true)).toEqual(['comments']);
  });

  it('schaltet ein Feld aus und ändert sonst nichts', () => {
    expect(toggleCarry(DEFAULT_CARRY, 'cost', false)).toEqual(['description', 'checklist', 'links']);
    expect(toggleCarry(['description'], 'cost', false)).toEqual(['description']);
  });

  it('die Voreinstellung nimmt Fotos und Kommentare nicht mit', () => {
    expect(DEFAULT_CARRY).not.toContain('attachments');
    expect(DEFAULT_CARRY).not.toContain('comments');
    expect(CARRY_OPTIONS.map((o) => o.field)).toEqual([...DEFAULT_CARRY, 'attachments', 'comments']);
  });
});
