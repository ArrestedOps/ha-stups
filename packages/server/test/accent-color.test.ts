import { describe, expect, it } from 'vitest';
import { ACCENT_DEFAULT_HUE, accentRgb } from '../src/accent.js';

const hex = (rgb: [number, number, number]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

describe('Akzentfarbe im Server (für die Lampe)', () => {
  // Die Werte stammen aus der Rechnung im Browser (packages/web/src/lib/accent.ts, swatch(hue, 'dark')):
  // Die Lampe soll in genau der Farbe leuchten, die die Person in der App gewählt hat.
  it.each([
    [0, '#f13f8a'],
    [40, '#f05400'],
    [120, '#849c00'],
    [200, '#00a3aa'],
    [260, '#448bff'],
    [330, '#d54ecd'],
  ])('Farbton %i gibt dieselbe Farbe wie im Browser: %s', (hue, expected) => {
    expect(hex(accentRgb(hue))).toBe(expected);
  });

  it('ohne Farbton gilt das Orange der App', () => {
    expect(ACCENT_DEFAULT_HUE).toBe(40);
    expect(accentRgb(null)).toEqual(accentRgb(ACCENT_DEFAULT_HUE));
  });

  it('jeder Farbton gibt Werte von 0 bis 255', () => {
    for (let hue = 0; hue < 360; hue++) {
      for (const v of accentRgb(hue)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});
