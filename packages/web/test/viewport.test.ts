import { describe, expect, it } from 'vitest';
import { sheetInsets } from '../src/lib/viewport';

describe('sheetInsets', () => {
  it('ohne Tastatur bleibt alles beim Alten', () => {
    expect(sheetInsets(844, 844, 0)).toEqual({ bottom: 0, maxHeight: null });
    expect(sheetInsets(844, 820, 0)).toEqual({ bottom: 0, maxHeight: null }); // Adressleiste
  });

  it('mit Tastatur rückt das Sheet über sie und wird nicht höher als die sichtbare Fläche', () => {
    // iPhone: 844 hoch, Tastatur ~ 336 px
    expect(sheetInsets(844, 508, 0)).toEqual({ bottom: 336, maxHeight: 496 });
  });

  it('berücksichtigt, dass die Seite beim Öffnen der Tastatur nach oben geschoben wurde', () => {
    expect(sheetInsets(844, 508, 120)).toEqual({ bottom: 216, maxHeight: 496 });
  });

  it('wird nie unbenutzbar klein', () => {
    expect(sheetInsets(600, 200, 0).maxHeight).toBe(240);
  });
});

