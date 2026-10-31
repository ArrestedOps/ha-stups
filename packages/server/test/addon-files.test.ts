import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const load = (file: string) => parse(readFileSync(join(root, file), 'utf8')) as Record<string, unknown>;

// Ein Syntaxfehler in diesen Dateien lässt den Supervisor das Add-on im Store verschwinden,
// ohne dass Build oder Tests sonst etwas merken.
describe('Add-on-Dateien für Home Assistant', () => {
  it('config.yaml ist gültig und hat die Pflichtangaben', () => {
    const c = load('stups/config.yaml');
    expect(c.name).toBeTypeOf('string');
    expect(c.description).toBeTypeOf('string');
    expect(c.version).toMatch(/^\d+\.\d+\.\d+$/);
    // Der Slug bestimmt, wo Home Assistant die Daten ablegt: eine Änderung lässt alle Daten zurück
    expect(c.slug).toBe('stups');
    expect(c.arch).toEqual(['aarch64', 'amd64']);
    expect(c.ingress).toBe(true);
  });

  it('repository.yaml ist gültig', () => {
    const r = load('repository.yaml');
    expect(r.name).toBeTypeOf('string');
    expect(r.url).toMatch(/^https:\/\/github\.com\//);
  });

  it('die Übersetzung nennt nur Optionen, die es gibt', () => {
    const options = Object.keys(load('stups/config.yaml').schema as object);
    const translated = Object.keys((load('stups/translations/de.yaml').configuration ?? {}) as object);
    for (const key of translated) expect(options).toContain(key);
  });
});
