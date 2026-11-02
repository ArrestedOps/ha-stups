import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Die Demo-GIFs liegen im README; zu groß oder kaputt wäre dort peinlich (und lädt auf dem Handy lange)
describe('Demo-GIFs', () => {
  for (const lang of ['en', 'de']) {
    it(`docs/images/demo.${lang}.gif ist ein gültiges, kleines GIF im Handy-Format`, () => {
      const file = join(root, 'docs', 'images', `demo.${lang}.gif`);
      expect(existsSync(file), 'Datei fehlt: node e2e/demo.mjs --lang ' + lang).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a');
      expect(statSync(file).size).toBeLessThan(3 * 1024 * 1024);
      const width = bytes.readUInt16LE(6);
      const height = bytes.readUInt16LE(8);
      expect(width).toBeLessThanOrEqual(390);
      expect(height).toBeGreaterThan(width); // hochkant
    });
  }
});
