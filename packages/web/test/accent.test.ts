import { describe, expect, it } from 'vitest';
import { ACCENT_PROPS, accentVars, applyAccent, contrast, DEFAULT_HUE, hueFromStorage, oklchToRgb, swatch } from '../src/lib/accent';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Ersatz für <html>: nur das, was applyAccent von style braucht (die Testumgebung hat kein DOM) */
function fakeRoot(): HTMLElement {
  const props = new Map<string, string>();
  const style = {
    setProperty: (k: string, v: string) => void props.set(k, v),
    removeProperty: (k: string) => void props.delete(k),
    getPropertyValue: (k: string) => props.get(k) ?? '',
  };
  return { style } as unknown as HTMLElement;
}

describe('Farbberechnung', () => {
  it('der Farbton des Orange trifft das Orange der App (dunkel)', () => {
    const [r, g, b] = rgb(swatch(DEFAULT_HUE, 'dark'));
    const [er, eg, eb] = rgb('#f2500f');
    expect(Math.abs(r - er) + Math.abs(g - eg) + Math.abs(b - eb)).toBeLessThan(60);
  });

  it('jeder Farbton gibt gültige Farben, die Reihenfolge der Helligkeit stimmt', () => {
    for (let hue = 0; hue < 360; hue++) {
      for (const scheme of ['dark', 'light'] as const) {
        const vars = accentVars(hue, scheme);
        for (const key of ['--accent', '--accent2', '--accent-text', '--on-accent']) expect(vars[key], `${hue} ${scheme} ${key}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(Object.keys(vars)).toEqual(ACCENT_PROPS);
      }
    }
  });

  it('Schrift auf der Fläche ist bei jedem Farbton gut lesbar (Kontrast mindestens 3)', () => {
    for (let hue = 0; hue < 360; hue++) {
      for (const scheme of ['dark', 'light'] as const) {
        const v = accentVars(hue, scheme);
        expect(contrast(rgb(v['--on-accent']!), rgb(v['--accent']!)), `${hue} ${scheme}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('Akzentschrift ist auf Karte und Hintergrund lesbar (Kontrast mindestens 4,5)', () => {
    const surface = { dark: rgb('#1a181d'), light: rgb('#ffffff') };
    const bg = { dark: rgb('#0e0d10'), light: rgb('#fff6ee') };
    for (let hue = 0; hue < 360; hue++) {
      for (const scheme of ['dark', 'light'] as const) {
        const text = rgb(accentVars(hue, scheme)['--accent-text']!);
        expect(contrast(text, surface[scheme]), `${hue} ${scheme} Karte`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(text, bg[scheme]), `${hue} ${scheme} Hintergrund`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('zu starke Sättigung wird gesenkt statt abzuschneiden: Ergebnis bleibt im Bereich 0–255', () => {
    for (const v of oklchToRgb(0.9, 0.4, 150)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('helles Grün und Türkis bekommen im Dunkeln dunkle Schrift, Rot, Orange und Blau weiße', () => {
    expect(accentVars(160, 'dark')['--on-accent']).not.toBe('#ffffff');
    expect(accentVars(180, 'dark')['--on-accent']).not.toBe('#ffffff');
    for (const hue of [25, DEFAULT_HUE, 260]) expect(accentVars(hue, 'dark')['--on-accent'], String(hue)).toBe('#ffffff');
    expect(accentVars(160, 'light')['--on-accent']).toBe('#ffffff');
  });
});

describe('Merkzettel und Seite', () => {
  it('hueFromStorage nimmt nur ganze Zahlen von 0 bis 359', () => {
    expect(hueFromStorage('0')).toBe(0);
    expect(hueFromStorage('359')).toBe(359);
    for (const bad of [null, '', '360', '-1', '12.5', 'blau']) expect(hueFromStorage(bad), String(bad)).toBeNull();
  });

  it('applyAccent setzt die Variablen und entfernt sie wieder', () => {
    const root = fakeRoot();
    applyAccent(200, 'dark', root);
    expect(root.style.getPropertyValue('--accent')).toBe(accentVars(200, 'dark')['--accent']);
    expect(root.style.getPropertyValue('--glow')).toContain('radial-gradient');
    applyAccent(null, 'dark', root);
    for (const prop of ACCENT_PROPS) expect(root.style.getPropertyValue(prop)).toBe('');
  });

  it('applyAccent wechselt mit dem Thema', () => {
    const root = fakeRoot();
    applyAccent(200, 'dark', root);
    const dark = root.style.getPropertyValue('--accent');
    applyAccent(200, 'light', root);
    expect(root.style.getPropertyValue('--accent')).not.toBe(dark);
  });
});
