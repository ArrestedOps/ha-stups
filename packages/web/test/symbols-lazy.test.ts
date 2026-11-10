import { describe, expect, it } from 'vitest';
import { symbolName } from '../src/lib/symbols/library';
import { keywords, loadKeywords } from '../src/lib/symbols/words.svelte';

describe('Namen und Suchwörter der Symbole als eigenes Paket', () => {
  it('nach dem Laden stehen beide Sprachen bereit', async () => {
    await loadKeywords();
    const k = keywords();
    expect(k).not.toBeNull();
    expect(k!.DE['washing-machine']![0]).toBe('Waschmaschine');
    expect(k!.EN['washing-machine']![0]).toBe('Washing machine');
  });

  it('symbolName nennt den Namen der Oberfläche, unbekannte Kennungen zeigen den Namen des Standardsymbols', async () => {
    await loadKeywords();
    expect(symbolName('washing-machine', 'de')).toBe('Waschmaschine');
    expect(symbolName('washing-machine', 'en')).toBe('Washing machine');
    expect(symbolName('gibt-es-nicht', 'de')).toBe(symbolName(null, 'de'));
  });
});
