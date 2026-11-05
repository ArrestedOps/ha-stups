/**
 * Schreibt src/lib/symbols/paths.ts: die Pfade der Symbole aus src/lib/symbols/catalog.json, gezogen aus @mdi/js.
 * @mdi/js ist nur eine Entwicklungsabhängigkeit: Die Pfade sind fest eingebaut, zur Laufzeit gibt es keine Bibliothek.
 *
 * Aufruf (im Ordner packages/web):  pnpm symbols
 * Neue Symbole: Kennung (mdi-Name ohne Präfix, z. B. "washing-machine") und Bereich in catalog.json eintragen, deutsche und
 * englische Namen samt Suchwörtern in keywords.de.ts und keywords.en.ts ergänzen, dann dieses Skript laufen lassen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mdi from '@mdi/js';

const dir = fileURLToPath(new URL('../src/lib/symbols/', import.meta.url));
const catalog = JSON.parse(readFileSync(dir + 'catalog.json', 'utf8'));
const camel = (id) => 'mdi' + id.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

const missing = [];
const lines = [];
for (const [id] of catalog.icons) {
  const path = mdi[camel(id)];
  if (!path) missing.push(id);
  else lines.push(`  '${id}': '${path}',`);
}
if (missing.length) {
  console.error('Nicht in @mdi/js gefunden: ' + missing.join(', '));
  process.exit(1);
}
const out = `// Erzeugt von scripts/build-symbols.mjs aus @mdi/js (Apache-2.0, Pictogrammers). Nicht von Hand ändern.
/** Pfade der Symbole (viewBox 0 0 24 24, gefüllt) nach Kennung */
export const PATHS: Record<string, string> = {
${lines.join('\n')}
};
`;
writeFileSync(dir + 'paths.ts', out);
console.log(`${lines.length} Symbole, ${out.length} Zeichen`);
