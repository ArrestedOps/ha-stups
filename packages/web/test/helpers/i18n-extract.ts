export interface Found {
  /** deutscher Text, der Schlüssel */
  key: string;
  plural: boolean;
}

const STRING = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|` + '`((?:[^`\\\\$]|\\\\.)*)`';
const CALL = new RegExp(String.raw`(?<![\w.$])(tn|t)\(\s*(?:${STRING})`, 'g');
// tx('Kontext', 'Text'): Schlüssel im Katalog ist „Kontext|Text"
const CALL_X = new RegExp(String.raw`(?<![\w.$])tx\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")\s*,\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")`, 'g');

const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));

/** Alle t('…'), tn('…', …) und tx('…', '…') im Quelltext (nur Zeichenketten ohne ${…}) */
export function extract(source: string): Found[] {
  const out: Found[] = [];
  for (const m of source.matchAll(CALL)) {
    const raw = m[2] ?? m[3] ?? m[4];
    if (raw !== undefined) out.push({ key: unescape(raw), plural: m[1] === 'tn' });
  }
  for (const m of source.matchAll(CALL_X)) {
    const ctx = m[1] ?? m[2];
    const text = m[3] ?? m[4];
    if (ctx !== undefined && text !== undefined) out.push({ key: `${unescape(ctx)}|${unescape(text)}`, plural: false });
  }
  return out;
}

/** Die Platzhalter {name} eines Textes, sortiert und ohne Doppelte */
export const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
