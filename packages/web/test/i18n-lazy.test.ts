import { describe, expect, it } from 'vitest';
import { i18n, loadCatalog, setLanguage, t, useCatalog } from '../src/lib/i18n/index.svelte';

describe('Englischer Katalog als eigenes Paket', () => {
  it('Deutsch braucht keinen Katalog: der Text ist der Schlüssel', () => {
    setLanguage('de');
    expect(t('Karte löschen?')).toBe('Karte löschen?');
  });

  it('nach dem Laden übersetzt t() auf Englisch und zählt rev hoch (damit sich die Oberfläche neu zeichnet)', async () => {
    await loadCatalog();
    setLanguage('en');
    expect(t('Karte löschen?')).not.toBe('Karte löschen?');
  });

  it('useCatalog ersetzt den Katalog und stellt ihn wieder her, rev ändert sich bei beidem', () => {
    setLanguage('en');
    const before = i18n.rev;
    const restore = useCatalog({ Hallo: 'Hi' });
    expect(t('Hallo')).toBe('Hi');
    expect(i18n.rev).toBeGreaterThan(before);
    restore();
    expect(t('Hallo')).toBe('Hallo');
  });
});
