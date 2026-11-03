/**
 * Die Akzentfarbe einer Person als RGB, für die Lampe. Eine kleine Kopie der Rechnung im Browser
 * (packages/web/src/lib/accent.ts: OKLCH, Fläche im Dunkelmodus), damit die Lampe in genau der Farbe leuchtet, die die Person
 * in der App gewählt hat. test/accent-color.test.ts hält beide gleich.
 */

/** Der Farbton des Orange, mit dem die App beginnt, solange nichts gewählt ist */
export const ACCENT_DEFAULT_HUE = 40;

/** Helligkeit und Sättigung der Fläche im Dunkelmodus */
const LIGHTNESS = 0.66;
const CHROMA = 0.22;

type Rgb = [number, number, number];

const encode = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** OKLCH zu lineares sRGB; Werte außerhalb von 0 bis 1 liegen außerhalb des darstellbaren Bereichs */
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
const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/** `hue`: Farbton 0 bis 359 oder null für das Orange der App */
export function accentRgb(hue: number | null): Rgb {
  const h = hue ?? ACCENT_DEFAULT_HUE;
  let chroma = CHROMA;
  // Ist die Sättigung für den Bildschirm zu hoch, wird sie so weit gesenkt, wie es nötig ist
  if (!inGamut(linear(LIGHTNESS, chroma, h))) {
    let lo = 0;
    let hi = chroma;
    for (let i = 0; i < 24; i++) {
      chroma = (lo + hi) / 2;
      if (inGamut(linear(LIGHTNESS, chroma, h))) lo = chroma;
      else hi = chroma;
    }
    chroma = lo;
  }
  return linear(LIGHTNESS, chroma, h).map((v) => Math.round(clamp(encode(clamp(v))) * 255)) as Rgb;
}
