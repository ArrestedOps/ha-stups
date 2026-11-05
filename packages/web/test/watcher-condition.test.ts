import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { CONDITION_ORDER, conditionItems } from '../src/lib/watcher-flow';

const src = (name: string) => readFileSync(new URL(`../src/components/${name}`, import.meta.url), 'utf8');

describe('Bedingungsarten im Wächter-Editor: eine Reihenfolge', () => {
  it('unter, über, Zustand (Entwurf WaechterB), deutsch und englisch', () => {
    expect([...CONDITION_ORDER]).toEqual(['below', 'above', 'state']);
    setLanguage('de');
    expect(conditionItems().map((c) => c.label)).toEqual(['unter', 'über', 'Zustand']);
    setLanguage('en');
    expect(conditionItems().map((c) => c.id)).toEqual(['below', 'above', 'state']);
    setLanguage('de');
  });

  it('„Wenn" (Assistent und Ablauf) und „Erledigt sich selbst" (Feinschliff, Ablauf) lesen die Liste aus der Konstante, keine eigene', () => {
    for (const file of ['WatcherWhenEditor.svelte', 'DoneEditor.svelte']) {
      const code = src(file);
      expect(code, file).toContain('conditionItems()');
      expect(code, `${file} hat eine eigene Liste`).not.toMatch(/id: '(below|above|state)'/);
    }
    // der Ablauf benutzt dieselben beiden Editoren, keine dritte Liste
    const flow = src('WatcherFlow.svelte');
    expect(flow).toContain('<WatcherWhenEditor');
    expect(flow).toContain('<DoneEditor');
    expect(flow).not.toMatch(/id: '(below|above|state)'/);
  });
});
