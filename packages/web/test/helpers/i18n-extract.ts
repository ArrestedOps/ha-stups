export interface Found {
  /** deutscher Text, der Schlüssel */
  key: string;
  plural: boolean;
}

const STRING = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|` + '`((?:[^`\\\\$]|\\\\.)*)`';
const CALL = new RegExp(String.raw`(?<![\w.$])(tn|t)\(\s*(?:${STRING})`, 'g');

const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));

/** Alle t('…') und tn('…', …) im Quelltext (nur Zeichenketten ohne ${…}) */
export function extract(source: string): Found[] {
  const out: Found[] = [];
  for (const m of source.matchAll(CALL)) {
    const raw = m[2] ?? m[3] ?? m[4];
    if (raw !== undefined) out.push({ key: unescape(raw), plural: m[1] === 'tn' });
  }
  return out;
}

/** Die Platzhalter {name} eines Textes, sortiert und ohne Doppelte */
export const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
