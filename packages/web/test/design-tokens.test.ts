import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast } from '../src/lib/accent';

const SRC = new URL('../src/', import.meta.url).pathname;
const css = readFileSync(join(SRC, 'app.css'), 'utf8');

/** Die Variablen eines Blocks aus app.css (nur die Werte, die als Farbe lesbar sind, werden später gebraucht) */
function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
const darkBlock = css.slice(css.indexOf(':root {\n  color-scheme: dark;'), css.indexOf('@media (prefers-color-scheme: light)'));
const lightBlock = css.slice(css.indexOf('@media (prefers-color-scheme: light)'), css.indexOf('/* Leuchtende Orange-Fläche'));
const dark = vars(darkBlock);
const light = { ...dark, ...vars(lightBlock) }; // Hell ändert nur, was es nennt

const rgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`keine Farbe: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16)) as [number, number, number];
};
const hexes = (value: string): string[] => [...value.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0]);
const ratio = (fg: string, bg: string) => contrast(rgb(fg), rgb(bg));

const THEMES = { dunkel: dark, hell: light } as const;

describe('Kontrast der Farbpaare (aus app.css), Hell und Dunkel', () => {
  for (const [name, v] of Object.entries(THEMES)) {
    describe(name, () => {
      it('Text und Nebentext auf Grund, Fläche und zweiter Fläche: mindestens 4,5 : 1', () => {
        for (const bg of ['--bg', '--surface', '--surface2']) {
          for (const fg of ['--text', '--text2', '--hint']) {
            expect(ratio(v[fg]!, v[bg]!), `${fg} auf ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it('Schrift in Akzentfarbe auf Grund und Fläche: mindestens 4,5 : 1', () => {
        for (const bg of ['--bg', '--surface']) expect(ratio(v['--accent-text']!, v[bg]!), bg).toBeGreaterThanOrEqual(4.5);
      });

      it('Weiß auf dem Verlauf der Orange-Flächen: an beiden Enden mindestens 3,5 : 1', () => {
        expect(ratio(v['--on-accent']!, v['--accent']!), 'Anfang').toBeGreaterThanOrEqual(3.5);
        expect(ratio(v['--on-accent']!, v['--accent-end']!), 'Ende').toBeGreaterThanOrEqual(3.5);
      });

      it('Wächter-Editor: Schilder (Wenn, Dann, An wen, Erledigt) und die grüne Marke auf ihrem Grund, Schrift auf der Einsatz-Fläche: mindestens 4,5 : 1', () => {
        for (const kind of ['when', 'then', 'who', 'done']) expect(ratio(v[`--tag-${kind}-fg`]!, v[`--tag-${kind}-bg`]!), `Schild ${kind}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--ok-fg']!, v['--ok-bg']!), 'jetzt-Marke').toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--step-done']!, v['--bg']!), 'erledigter Schritt').toBeGreaterThanOrEqual(4.5);
        for (const fg of ['--text', '--text2', '--dim', '--tok-fg']) expect(ratio(v[fg]!, v['--surface-inset']!), `${fg} auf der Einsatz-Fläche`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--graph-line']!, v['--bg']!), 'Linie im Verlauf (Grafik: 3 : 1)').toBeGreaterThanOrEqual(3);
        expect(ratio(v['--sig-green']!, v['--bg']!), 'Schwellen-Linie (Grafik: 3 : 1)').toBeGreaterThanOrEqual(3);
      });

      it('Haus-Türkis und Gefahr auf ihrem Grund: mindestens 4,5 : 1', () => {
        expect(ratio(v['--house']!, v['--house-bg']!)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--danger']!, v['--danger-bg']!)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--danger']!, v['--surface']!)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--on-danger']!, v['--danger']!), 'Schrift auf Gefahr-Knopf').toBeGreaterThanOrEqual(4.5);
      });

      it('Texte auf den Bannern (Titel und Zeile darunter) an jedem Farbpunkt: mindestens 4,5 : 1', () => {
        for (const [bg, sub] of [['--banner-purple', '--banner-purple-sub'], ['--banner-warm', '--banner-warm-sub']] as const) {
          for (const stop of hexes(v[bg]!)) {
            expect(ratio(v['--on-banner']!, stop), `${bg} Titel ${stop}`).toBeGreaterThanOrEqual(4.5);
            expect(ratio(v[sub]!, stop), `${bg} Zeile ${stop}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it('Signalfarben (heute, überfällig, erledigt, später) und die helleren Textstufen auf Grund und Fläche: mindestens 4,5 : 1', () => {
        for (const bg of ['--bg', '--surface']) {
          for (const fg of ['--sig-orange', '--sig-red', '--sig-green', '--sig-blue', '--text-soft', '--text-soft2', '--dim', '--danger']) {
            expect(ratio(v[fg]!, v[bg]!), `${fg} auf ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it('Schrift auf den orange hinterlegten Chips (erkannte Teile, Auto) und Ziffern außerhalb des Monats: mindestens 4,5 : 1 bzw. 3 : 1', () => {
        // der Chip ist die Akzentfarbe zu 14 % über der Fläche
        const mix = (a: [number, number, number], b: [number, number, number], x: number) => a.map((c, i) => Math.round(c * x + b[i]! * (1 - x))) as [number, number, number];
        const chip = mix(rgb(v['--accent']!), rgb(v['--surface']!), 0.14);
        expect(contrast(rgb(v['--tok-fg']!), chip), 'Chip auf Fläche').toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--ring']!, v['--surface']!), 'Tage außerhalb des Monats und ferne Werte im Rad').toBeGreaterThanOrEqual(3);
        expect(ratio(v['--text']!, v['--soft-btn']!), 'Monatsknöpfe').toBeGreaterThanOrEqual(4.5);
      });

      it('Erledigt-Kreis (Ring) und Trenner: mindestens 3 : 1 gegen die Fläche (nicht nur Text)', () => {
        expect(ratio(v['--ring']!, v['--surface']!), 'Ring').toBeGreaterThanOrEqual(3);
      });

      it('Symbol auf der Kachel: an beiden Enden des Verlaufs mindestens 3 : 1', () => {
        for (const c of ['orange', 'purple', 'violet', 'blue', 'teal', 'green', 'red', 'gray']) {
          for (const end of ['a', 'b']) {
            expect(ratio(v[`--tile-${c}-fg`]!, v[`--tile-${c}-${end}`]!), `${c} ${end}`).toBeGreaterThanOrEqual(3);
          }
        }
      });
    });
  }
});

/** Alle .svelte-Dateien unter den Komponenten und App.svelte */
function svelteFiles(dir = join(SRC, 'components')): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (f.endsWith('.svelte')) out.push(p);
  }
  return out;
}
const files = [...svelteFiles(), join(SRC, 'App.svelte')];

/** Dateien, in denen eine feste Farbe begründet ist: Datei → Anzahl erlaubter Treffer und Grund */
const HEX_ALLOWED: Record<string, string> = {};

describe('Keine festen Farben in Komponenten (alles läuft über die Variablen aus app.css)', () => {
  it('keine Hex-Werte', () => {
    const found: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const rel = f.slice(SRC.length);
      const n = [...text.matchAll(/(?:['"(:\s,])#[0-9a-fA-F]{3,8}\b/g)].length;
      if (n > 0 && !(rel in HEX_ALLOWED)) found.push(`${rel}: ${n}`);
    }
    expect(found).toEqual([]);
  });

  it('keine Palettenfarben von Tailwind (text-white, bg-black/95, bg-red-500 …)', () => {
    const palette = /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|shadow|decoration|divide|placeholder)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\/\d+)?\b/g;
    const found: string[] = [];
    for (const f of files) {
      const hits = [...readFileSync(f, 'utf8').matchAll(palette)].map((m) => m[0]);
      if (hits.length) found.push(`${f.slice(SRC.length)}: ${[...new Set(hits)].join(', ')}`);
    }
    expect(found).toEqual([]);
  });
});

describe('Schrift kommt von der App, nicht von einem Schriftserver', () => {
  it('kein Verweis auf Google Fonts oder ein CDN in Seite, Stilen und Einstieg', () => {
    const texts = [css, readFileSync(join(SRC, '..', 'index.html'), 'utf8'), readFileSync(join(SRC, 'main.ts'), 'utf8')];
    for (const t of texts) expect(t).not.toMatch(/fonts\.(googleapis|gstatic)\.com|cdn\.|unpkg\.com|jsdelivr/i);
  });

  it('Inter ist die Schrift (lokal eingebunden)', () => {
    expect(readFileSync(join(SRC, 'main.ts'), 'utf8')).toContain("@fontsource-variable/inter");
    expect(css).toContain("'Inter Variable'");
    expect(css).not.toMatch(/bricolage/i);
  });
});
