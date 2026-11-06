import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import FoundHits from '../src/components/FoundHits.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import type { WatcherSuggestion } from '../src/lib/watcher-types';

const templates = [
  { id: 'bins', title: 'Tonnen rausstellen' },
  { id: 'battery', title: 'Batterie schwach' },
];
const hit = (templateId: string, n: number): WatcherSuggestion => ({
  templateId,
  entityId: `sensor.${templateId}_${n}`,
  name: `Gerät ${n}`,
  reason: `Gerät ${n}: Batterie bei ${n} %`,
  variant: 'default',
});
const html = (suggestions: WatcherSuggestion[]) => render(FoundHits, { props: { suggestions, templates, onsetup: () => undefined, onhide: () => undefined } }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

beforeEach(() => setLanguage('de'));

describe('Gefunden: Gruppen in der Oberfläche', () => {
  const many = [...Array.from({ length: 14 }, (_, i) => hit('battery', i)), hit('bins', 1)];

  it('Gruppenkopf mit Vorlagen-Titel und Zähler; große Gruppe zeigt fünf Treffer und „Alle 14 anzeigen“, kleine steht offen', () => {
    const out = html(many);
    expect(count(out, /data-testid="found-group"/g)).toBe(2);
    expect(out).toMatch(/Tonnen rausstellen[^]*Batterie schwach/); // Reihenfolge der Vorlagen
    expect(count(out, /data-testid="found-hit"/g)).toBe(6); // 1 Tonne + 5 Batterien
    expect(count(out, /data-testid="found-more"/g)).toBe(1);
    expect(out).toContain('Alle 14 anzeigen');
    expect(out).toMatch(/aria-expanded="false"[^>]*data-testid="found-more"/);
    expect(out).toMatch(/>14<\/span>/); // Zähler im Kopf der Batterien
  });

  it('das Suchfeld erscheint ab zwölf Treffern, mit Beschriftung für Vorlesegeräte', () => {
    const out = html(many);
    expect(out).toMatch(/type="search"/);
    expect(out).toContain('aria-label="Gefundene Geräte durchsuchen"');
    expect(html(many.slice(0, 6))).not.toContain('type="search"');
  });

  it('kleine Listen: alles offen, kein „Alle anzeigen“', () => {
    const out = html([hit('battery', 1), hit('battery', 2), hit('bins', 1)]);
    expect(count(out, /data-testid="found-hit"/g)).toBe(3);
    expect(out).not.toContain('found-more');
  });

  it('jeder Treffer: Begründung, Entität, „Einrichten“ und „Ausblenden“ mit Gerätenamen', () => {
    const out = html([hit('battery', 3)]);
    expect(out).toContain('Gerät 3: Batterie bei 3 %');
    expect(out).toContain('sensor.battery_3');
    expect(out).toContain('Einrichten');
    expect(out).toContain('aria-label="Gerät 3 ausblenden"');
  });

  it('englisch: Knöpfe und Suchfeld in der Sprache des Geräts', () => {
    setLanguage('en');
    const out = html(many);
    expect(out).toContain('Show all 14');
    expect(out).toContain('Search found devices');
  });
});
