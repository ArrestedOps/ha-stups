import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en.js';
import { extract, placeholders, type Found } from './helpers/i18n-extract.js';

const SRC = join(import.meta.dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'i18n' ? [] : files(p);
    return name.endsWith('.ts') ? [p] : [];
  });
}

const all = files(SRC);
const found = new Map<string, Found>();
for (const f of all) for (const x of extract(readFileSync(f, 'utf8'))) found.set(x.key, x);

describe('Prüfer für den Quelltext', () => {
  it('findet t(), tn() und tx(), aber nichts, was nur so ähnlich aussieht', () => {
    const src = ["t('Neu')", "x.t('nicht')", "format('nein')", "tn('{n} Aufgabe', '{n} Aufgaben', n)", "tx('Kontext', 'Alle')", 't(`Hallo ${name}`)'].join('\n');
    expect(extract(src)).toEqual([
      { key: 'Neu', plural: false },
      { key: '{n} Aufgabe', plural: true },
      { key: 'Kontext|Alle', plural: false },
    ]);
  });
});

describe('Katalog en.ts und Quelltext', () => {
  it('der Test sieht den Quelltext (sonst wäre er immer grün)', () => {
    expect(all.length).toBeGreaterThan(40);
    expect(found.has('Nicht gefunden')).toBe(true);
  });

  it('jeder Text im Quelltext hat einen englischen Eintrag', () => {
    expect([...found.keys()].filter((k) => !(k in en))).toEqual([]);
  });

  it('kein englischer Eintrag ist verwaist', () => {
    expect(Object.keys(en).filter((k) => !found.has(k))).toEqual([]);
  });

  it('Mehrzahlen sind Paare, einfache Texte sind Zeichenketten', () => {
    expect([...found.values()].filter((f) => f.key in en && Array.isArray(en[f.key]) !== f.plural).map((f) => f.key)).toEqual([]);
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
