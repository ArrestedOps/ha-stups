import { describe, expect, it } from 'vitest';
import { fadeState, revealDelta } from '../src/lib/scrollStrip';

describe('Leiste mit Verlauf', () => {
  it('Verlauf rechts, solange es weiter geht; links, sobald man gewischt hat', () => {
    expect(fadeState(0, 600, 300)).toEqual({ start: false, end: true });
    expect(fadeState(150, 600, 300)).toEqual({ start: true, end: true });
    expect(fadeState(300, 600, 300)).toEqual({ start: true, end: false });
  });

  it('passt alles hinein, gibt es keinen Verlauf', () => {
    expect(fadeState(0, 300, 300)).toEqual({ start: false, end: false });
    expect(fadeState(0, 301, 300)).toEqual({ start: false, end: false }); // Rundung
  });

  it('die aktive Auswahl wird nur bewegt, wenn sie nicht ganz sichtbar ist', () => {
    const strip = { left: 0, right: 300 };
    expect(revealDelta({ left: 40, right: 120 }, strip)).toBe(0);
    expect(revealDelta({ left: 250, right: 340 }, strip)).toBe(52); // 340 - 300 + 12
    expect(revealDelta({ left: -60, right: 20 }, strip)).toBe(-72); // -60 - 0 - 12
  });
});
