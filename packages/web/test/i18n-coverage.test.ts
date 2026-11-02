import { describe, expect, it } from 'vitest';
import { en } from '../src/lib/i18n/en';
import { extract, placeholders, type Found } from './helpers/i18n-extract';

// Alle Quelltexte der Oberfläche als Rohtext (ohne den Katalog selbst), auch neu angelegte Dateien
const sources = import.meta.glob<string>(['../src/**/*.ts', '../src/**/*.svelte', '!../src/lib/i18n/**'], { query: '?raw', import: 'default', eager: true });

const found = new Map<string, Found>();
for (const source of Object.values(sources)) for (const x of extract(source)) found.set(x.key, x);

describe('Prüfer für den Quelltext', () => {
  it('findet t() und tn(), aber nichts, was nur so ähnlich aussieht', () => {
    const src = [
      "const a = t('Neu');",
      '{t("Karte „{title}“", { title })}',
      "x.t('nicht')",
      "format('nein')",
      "const b = tn('{n} Karte', '{n} Karten', n);",
      'const c = t(`Hallo ${name}`);',
      "const d = t('Es ist \\'so\\'');",
      "const e = tx('Wiederholung', 'Alle');",
      "const f = ctx('a', 'b');",
    ].join('\n');
    expect(extract(src)).toEqual([
      { key: 'Neu', plural: false },
      { key: 'Karte „{title}“', plural: false },
      { key: '{n} Karte', plural: true },
      { key: "Es ist 'so'", plural: false },
      { key: 'Wiederholung|Alle', plural: false },
    ]);
  });
});

describe('Katalog en.ts und Quelltext', () => {
  it('der Test sieht den Quelltext (sonst wäre er immer grün)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(60);
    expect(Object.keys(sources).some((p) => p.includes('/i18n/'))).toBe(false);
    expect(found.has('Sprache')).toBe(true);
  });

  it('jeder Text im Quelltext hat einen englischen Eintrag', () => {
    const missing = [...found.keys()].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('kein englischer Eintrag ist verwaist', () => {
    const orphans = Object.keys(en).filter((k) => !found.has(k));
    expect(orphans).toEqual([]);
  });

  it('Mehrzahlen sind Paare, einfache Texte sind Zeichenketten', () => {
    const wrong = [...found.values()].filter((f) => f.key in en && Array.isArray(en[f.key]) !== f.plural).map((f) => f.key);
    expect(wrong).toEqual([]);
  });

  it('die Platzhalter stimmen in beiden Sprachen überein', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(en)) {
      const want = placeholders(key);
      for (const text of Array.isArray(value) ? value : [value]) {
        const got = placeholders(text);
        const ok = Array.isArray(value) ? got.includes('n') && got.filter((p) => p !== 'n').join() === want.filter((p) => p !== 'n').join() : got.join() === want.join();
        if (!ok) bad.push(`${key} → ${text}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
