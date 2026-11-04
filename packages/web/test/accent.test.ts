import { describe, expect, it } from 'vitest';
import { ACCENT_PROPS, accentVars, applyAccent, BLOCKED_HUES, contrast, DEFAULT_HUE, hueFromStorage, oklchToRgb, snapHue, swatch } from '../src/lib/accent';

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

  it('Schrift auf dem Verlauf (accent → accent-end) ist an beiden Enden gut lesbar, bei jedem Farbton', () => {
    for (let hue = 0; hue < 360; hue++) {
      for (const scheme of ['dark', 'light'] as const) {
        const v = accentVars(hue, scheme);
        expect(contrast(rgb(v['--on-accent']!), rgb(v['--accent']!)), `${hue} ${scheme} Anfang`).toBeGreaterThanOrEqual(3);
        expect(contrast(rgb(v['--on-accent']!), rgb(v['--accent-end']!)), `${hue} ${scheme} Ende`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('beim Orange der App: Weiß auf dem Verlauf mindestens 3,5 : 1 an beiden Enden, dunkel und hell', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const v = accentVars(DEFAULT_HUE, scheme);
      expect(contrast(rgb('#ffffff'), rgb(v['--accent']!)), `${scheme} Anfang`).toBeGreaterThanOrEqual(3.5);
      expect(contrast(rgb('#ffffff'), rgb(v['--accent-end']!)), `${scheme} Ende`).toBeGreaterThanOrEqual(3.5);
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

  it('Rot, Orange und Blau bekommen weiße Schrift; dunkle Schrift nur, wo Weiß unter 3 : 1 fiele', () => {
    for (const hue of [0, 25, DEFAULT_HUE, 260]) expect(accentVars(hue, 'dark')['--on-accent'], String(hue)).toBe('#ffffff');
    for (let hue = 0; hue < 360; hue++) {
      for (const scheme of ['dark', 'light'] as const) {
        const v = accentVars(hue, scheme);
        const white = contrast(rgb('#ffffff'), rgb(v['--accent']!));
        expect(v['--on-accent'] === '#ffffff', `${hue} ${scheme}`).toBe(white >= 3);
      }
    }
  });
});

describe('Türkis gehört dem Haus', () => {
  it('snapHue lässt erlaubte Töne unverändert und schiebt Grün/Türkis an den nächsten Rand', () => {
    for (const h of [0, 40, 139, 211, 260, 359]) expect(snapHue(h), String(h)).toBe(h);
    expect(snapHue(BLOCKED_HUES.from)).toBe(BLOCKED_HUES.from - 1);
    expect(snapHue(BLOCKED_HUES.to)).toBe(BLOCKED_HUES.to + 1);
    expect(snapHue(160)).toBe(BLOCKED_HUES.from - 1);
    expect(snapHue(190)).toBe(BLOCKED_HUES.to + 1);
    for (let h = 0; h < 360; h++) expect(snapHue(h) < BLOCKED_HUES.from || snapHue(h) > BLOCKED_HUES.to, String(h)).toBe(true);
  });

  it('ein gemerkter Farbton im Türkis-Bereich fällt auf den Rand zurück', () => {
    expect(hueFromStorage('180')).toBe(BLOCKED_HUES.to + 1);
    expect(hueFromStorage('100')).toBe(100);
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
