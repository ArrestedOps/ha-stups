/** Vergleichsform eines Textes: klein, ohne Akzente und Umlaut-Punkte (ä → a, ß → ss), alles außer Buchstaben und Ziffern wird zu einem Leerzeichen */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Wer ohne Umlaute tippt (muell, waesche, fuettern), meint a, o, u: die zweite Vergleichsform dazu */
export const translit = (folded: string): string => folded.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');

/** Die Vergleichsformen eines Textes (eine, oder zwei, wenn die Umschrift etwas ändert) */
export function variants(s: string): string[] {
  const f = fold(s);
  const t = translit(f);
  return t === f ? [f] : [f, t];
}

/** Abstand zweier Wörter: Einfügen, Löschen, Ersetzen und Vertauschen benachbarter Zeichen zählen je 1 */
export function distance(a: string, b: string): number {
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, (prev2[j - 2] ?? Infinity) + 1);
      row.push(d);
    }
    prev2.length = 0;
    prev2.push(...prev);
    prev = row;
  }
  return prev[b.length]!;
}
