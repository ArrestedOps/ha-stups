import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Jede Person, die als Chip gewählt wird, zeigt ihr eigenes Bild (Avatar: Foto, sonst die farbige Initiale), nie ein allgemeines Personen-Symbol.
// Nur „Alle" behält das Symbol. Quelltext-Test wie i18n-coverage: Chips mit einem Personennamen müssen einen Avatar enthalten.
const FILES = ['TasksView.svelte', 'BoardsView.svelte', 'FilterSheet.svelte'];

describe('Personen-Chips zeigen das Bild der Person', () => {
  for (const file of FILES) {
    it(file, () => {
      const src = readFileSync(join(import.meta.dirname, '../src/components', file), 'utf8');
      const chips = [...src.matchAll(/<Chip\b[\s\S]*?<\/Chip\s*>/g)].map((m) => m[0]);
      const persons = chips.filter((c) => c.includes('displayName'));
      expect(persons.length).toBeGreaterThan(0);
      for (const c of persons) {
        expect(c, c).toContain('<Avatar');
        expect(c, c).toContain('photo');
        expect(c, c).not.toContain('name="user"');
      }
    });
  }
});
