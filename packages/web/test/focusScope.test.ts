import { describe, expect, it } from 'vitest';
import { wrapTarget } from '../src/lib/focusScope';

describe('wrapTarget (Fokusfalle im Sheet)', () => {
  it('Tab vom letzten Element springt zum ersten, sonst bleibt es dem Browser überlassen', () => {
    expect(wrapTarget(3, 2, false)).toBe(0);
    expect(wrapTarget(3, 0, false)).toBeNull();
    expect(wrapTarget(3, 1, false)).toBeNull();
  });
  it('Umschalt+Tab vom ersten Element springt zum letzten', () => {
    expect(wrapTarget(3, 0, true)).toBe(2);
    expect(wrapTarget(3, 2, true)).toBeNull();
  });
  it('liegt der Fokus auf dem Fenster selbst (nichts davon): vorwärts zum ersten, rückwärts zum letzten', () => {
    expect(wrapTarget(4, -1, false)).toBe(0);
    expect(wrapTarget(4, -1, true)).toBe(3);
  });
  it('ein einziges Element hält den Fokus fest; ohne Elemente gibt es nichts zu tun', () => {
    expect(wrapTarget(1, 0, false)).toBe(0);
    expect(wrapTarget(1, 0, true)).toBe(0);
    expect(wrapTarget(0, -1, false)).toBeNull();
  });
});
