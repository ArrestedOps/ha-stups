import { afterEach, describe, expect, it } from 'vitest';
import { i18n, languageFromStorage, numberLocale, resolveLanguage, setLanguage, t, tn, tx, useCatalog } from '../src/lib/i18n/index.svelte';

let restore: () => void = () => undefined;
afterEach(() => {
  restore();
  setLanguage('de');
});
const catalog = (c: Record<string, string | [string, string]>) => (restore = useCatalog(c));

describe('t', () => {
  it('Deutsch: der Text ist der Schlüssel, Platzhalter werden ersetzt', () => {
    setLanguage('de');
    catalog({ 'Hallo {name}': 'Hello {name}' });
    expect(t('Hallo {name}', { name: 'Anna' })).toBe('Hallo Anna');
    expect(t('Karte löschen?')).toBe('Karte löschen?');
  });

  it('Englisch: der Katalogtext, mit Platzhaltern', () => {
    setLanguage('en');
    catalog({ 'Hallo {name}': 'Hello {name}' });
    expect(t('Hallo {name}', { name: 'Anna' })).toBe('Hello Anna');
  });

  it('fehlender Eintrag: der deutsche Text, nie leer oder undefined', () => {
    setLanguage('en');
    catalog({});
    expect(t('Noch nicht übersetzt')).toBe('Noch nicht übersetzt');
    expect(t('Noch {n} offen', { n: 3 })).toBe('Noch 3 offen');
  });

  it('Eingaben mit Klammern werden nicht ein zweites Mal ersetzt', () => {
    catalog({ 'Hallo {name}': 'Hello {name}' });
    for (const lang of ['de', 'en'] as const) {
      setLanguage(lang);
      expect(t('Hallo {name}', { name: '{x}' })).toBe(lang === 'de' ? 'Hallo {x}' : 'Hello {x}');
      expect(t('Hallo {name}', { name: '{name}' })).toBe(lang === 'de' ? 'Hallo {name}' : 'Hello {name}');
    }
  });

  it('ein Platzhalter ohne Wert bleibt stehen', () => {
    setLanguage('de');
    expect(t('Hallo {name}')).toBe('Hallo {name}');
  });
});

describe('tx', () => {
  it('mit Kontext: Englisch nimmt „Kontext|Text", Deutsch den Text', () => {
    catalog({ Alle: 'All', 'Wiederholung|Alle': 'Every' });
    setLanguage('en');
    expect(t('Alle')).toBe('All');
    expect(tx('Wiederholung', 'Alle')).toBe('Every');
    setLanguage('de');
    expect(tx('Wiederholung', 'Alle')).toBe('Alle');
  });

  it('ohne Eintrag: der deutsche Text', () => {
    setLanguage('en');
    catalog({});
    expect(tx('Wiederholung', 'Nach')).toBe('Nach');
  });
});

describe('tn', () => {
  it('Deutsch und Englisch, eins und mehrere', () => {
    catalog({ '{n} Karte': ['{n} card', '{n} cards'] });
    setLanguage('de');
    expect(tn('{n} Karte', '{n} Karten', 1)).toBe('1 Karte');
    expect(tn('{n} Karte', '{n} Karten', 2)).toBe('2 Karten');
    expect(tn('{n} Karte', '{n} Karten', 0)).toBe('0 Karten');
    setLanguage('en');
    expect(tn('{n} Karte', '{n} Karten', 1)).toBe('1 card');
    expect(tn('{n} Karte', '{n} Karten', 3)).toBe('3 cards');
    expect(tn('{n} Karte', '{n} Karten', 0)).toBe('0 cards');
  });

  it('Englisch ohne Eintrag: die deutsche Mehrzahl', () => {
    setLanguage('en');
    catalog({});
    expect(tn('{n} Tag', '{n} Tage', 2)).toBe('2 Tage');
  });
});

describe('Sprache wählen', () => {
  it('feste Wahl gewinnt', () => {
    expect(resolveLanguage('de', ['en-US'])).toBe('de');
    expect(resolveLanguage('en', ['de-DE'])).toBe('en');
  });

  it('Automatisch: Deutsch, wenn eine bevorzugte Sprache mit „de" beginnt, sonst Englisch', () => {
    expect(resolveLanguage('auto', ['de-CH', 'en'])).toBe('de');
    expect(resolveLanguage('auto', ['de'])).toBe('de');
    expect(resolveLanguage('auto', ['en-GB', 'de'])).toBe('de');
    expect(resolveLanguage('auto', ['fr', 'en'])).toBe('en');
    expect(resolveLanguage('auto', [])).toBe('en');
  });

  it('gemerkte Wahl: Unsinn und leer heißen Automatisch', () => {
    expect(languageFromStorage(null)).toBe('auto');
    expect(languageFromStorage('')).toBe('auto');
    expect(languageFromStorage('fr')).toBe('auto');
    expect(languageFromStorage('de')).toBe('de');
    expect(languageFromStorage('en')).toBe('en');
    expect(languageFromStorage('auto')).toBe('auto');
  });

  it('Zahlen- und Datumsformat folgen der Sprache', () => {
    setLanguage('de');
    expect(numberLocale()).toBe('de-DE');
    setLanguage('en');
    expect(numberLocale()).toBe('en-GB');
    expect(i18n.lang).toBe('en');
  });
});
