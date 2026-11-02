/**
 * Eigene Akzentfarbe: Die Person wählt einen Farbton auf dem Farbkreis (0–359), daraus entstehen die Variablen der Oberfläche
 * für Hell und Dunkel. Gerechnet wird in OKLCH, damit jeder Farbton gleich hell wirkt (Gelb nicht blasser, Blau nicht dunkler als
 * das Orange) und die Schrift auf den Knöpfen lesbar bleibt.
 */

export type Scheme = 'dark' | 'light';

/** Der Farbton des Orange, mit dem die Auswahl auf dem Kreis beginnt, solange nichts gewählt ist */
export const DEFAULT_HUE = 40;

interface Look {
  /** Fläche (Knopf, aktiver Reiter) */
  accent: [l: number, c: number];
  /** Das hellere Ende des Verlaufs */
  accent2: [l: number, c: number];
  /** Schrift in Akzentfarbe, muss auf Karten und Hintergrund lesbar sein */
  text: [l: number, c: number];
  glowAlpha: number;
  shadowAlpha: number;
}

const LOOK: Record<Scheme, Look> = {
  dark: { accent: [0.66, 0.22], accent2: [0.76, 0.17], text: [0.76, 0.17], glowAlpha: 0.32, shadowAlpha: 0.4 },
  light: { accent: [0.55, 0.2], accent2: [0.66, 0.2], text: [0.5, 0.19], glowAlpha: 0.42, shadowAlpha: 0.3 },
};

type Rgb = [number, number, number];

const encode = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const decode = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** OKLCH → lineares sRGB (Werte außerhalb von 0–1 liegen außerhalb des darstellbaren Bereichs) */
function linear(l: number, c: number, hueDeg: number): Rgb {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: Rgb): boolean => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** Die Farbe als sRGB 0–255; ist die Sättigung zu hoch für den Bildschirm, wird sie so weit gesenkt, wie es nötig ist */
export function oklchToRgb(l: number, c: number, hue: number): Rgb {
  let lo = 0;
  let hi = c;
  let chroma = c;
  if (!inGamut(linear(l, c, hue))) {
    for (let i = 0; i < 24; i++) {
      chroma = (lo + hi) / 2;
      if (inGamut(linear(l, chroma, hue))) lo = chroma;
      else hi = chroma;
    }
    chroma = lo;
  }
  return linear(l, chroma, hue).map((v) => Math.round(Math.min(1, Math.max(0, encode(Math.min(1, Math.max(0, v))))) * 255)) as Rgb;
}

const hex = (rgb: Rgb): string => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Kontrast nach WCAG zwischen zwei Farben (1 bis 21) */
export function contrast(a: Rgb, b: Rgb): number {
  const lum = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map((v) => decode(v / 255)) as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const DARK_TEXT: Rgb = [27, 18, 9];

/** Die Farbe für einen Farbton auf dem Kreis (zum Zeichnen des Kreises und der Vorschau) */
export function swatch(hue: number, scheme: Scheme = 'dark'): string {
  return hex(oklchToRgb(...LOOK[scheme].accent, hue));
}

/** Alle Variablen, die vom Farbton abhängen. Die Namen sind die der Oberfläche (app.css). */
export function accentVars(hue: number, scheme: Scheme): Record<string, string> {
  const look = LOOK[scheme];
  const accent = oklchToRgb(...look.accent, hue);
  const accent2 = oklchToRgb(...look.accent2, hue);
  const text = oklchToRgb(...look.text, hue);
  // Weiße Schrift, solange sie auf der Fläche gut zu lesen ist; bei hellen Farben (Gelb, Grün) dunkle
  const onAccent = contrast(WHITE, accent) >= 3 ? WHITE : DARK_TEXT;
  const rgba = (rgb: Rgb, alpha: number) => `rgba(${rgb.join(', ')}, ${alpha})`;
  return {
    '--accent': hex(accent),
    '--accent2': hex(accent2),
    '--accent-text': hex(text),
    '--on-accent': hex(onAccent),
    '--glow': `radial-gradient(ellipse at 85% -5%, ${rgba(scheme === 'dark' ? accent : accent2, look.glowAlpha)}, transparent 62%)`,
    '--shadow-accent': `0 10px 24px ${rgba(accent, look.shadowAlpha)}`,
  };
}

export const ACCENT_PROPS = Object.keys(accentVars(0, 'dark'));

/** Der Farbton aus dem Merkzettel des Geräts (damit schon die Anmeldeseite stimmt); alles Ungültige heißt Orange */
export function hueFromStorage(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 359 ? n : null;
}

/** Setzt die Farbe auf der Seite; null entfernt sie, dann gilt wieder das Orange aus app.css */
export function applyAccent(hue: number | null, scheme: Scheme, root: HTMLElement = document.documentElement): void {
  for (const prop of ACCENT_PROPS) root.style.removeProperty(prop);
  if (hue === null) return;
  for (const [prop, value] of Object.entries(accentVars(hue, scheme))) root.style.setProperty(prop, value);
}
