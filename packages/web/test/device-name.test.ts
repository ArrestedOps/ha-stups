import { describe, expect, it } from 'vitest';
import { containsDevice, withDevice } from '../src/lib/deviceName';

// Gegenstück zu server/src/device-names.ts (der Server kürzt den Gerätenamen, die Oberfläche hängt ihn an)
describe('Name mit Gerät', () => {
  it('hängt das Gerät mit Doppelpunkt an', () => {
    expect(withDevice('Batterie schwach', 'iPhone Rene')).toBe('Batterie schwach: iPhone Rene');
    expect(withDevice('Batterie wechseln', 'Flur Tür')).toBe('Batterie wechseln: Flur Tür');
  });

  it('lässt den Namen, wenn das Gerät schon darin steht (Groß und Klein egal)', () => {
    expect(withDevice('Waschmaschine fertig', 'Waschmaschine')).toBe('Waschmaschine fertig');
    expect(withDevice('Batterie schwach: iPhone Rene', 'iphone rene')).toBe('Batterie schwach: iPhone Rene');
  });

  it('steht ein Teil des Geräts schon im Namen, kommt nur der Rest dazu (zwei Waschmaschinen bleiben unterscheidbar)', () => {
    expect(withDevice('Waschmaschine fertig', 'Waschmaschine Keller')).toBe('Waschmaschine fertig: Keller');
    expect(withDevice('Trockner fertig', 'Steckdose Trockner')).toBe('Trockner fertig: Steckdose');
  });

  it('kurze Wörter zählen nur als ganzes Wort, damit „A" nicht in jedem Namen steckt; einmal angehängt, kommt nichts doppelt', () => {
    expect(withDevice('Batterie schwach', 'Zimmer A')).toBe('Batterie schwach: Zimmer A');
    const once = withDevice('Batterie schwach', 'WC');
    expect(once).toBe('Batterie schwach: WC');
    expect(withDevice(once, 'WC')).toBe(once);
  });

  it('ohne Gerät bleibt der Name', () => {
    expect(withDevice('Batterie schwach', '')).toBe('Batterie schwach');
    expect(withDevice('Batterie schwach', undefined)).toBe('Batterie schwach');
  });

  it('bleibt in der Grenze (80), kürzt dafür das Gerät, nie den Namen', () => {
    const out = withDevice('Batterie schwach', 'X'.repeat(28), 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.startsWith('Batterie schwach: ')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(withDevice('Ein ziemlich langer Name eines Wächters', 'Flur', 41)).toBe('Ein ziemlich langer Name eines Wächters');
  });

  it('containsDevice prüft Teilstring und Wörter', () => {
    expect(containsDevice('Batterie schwach: iPhone Rene', 'iPhone Rene')).toBe(true);
    expect(containsDevice('Batterie schwach', 'iPhone Rene')).toBe(false);
    expect(containsDevice('Batterie schwach', '')).toBe(true);
  });
});
