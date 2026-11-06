/**
 * Gerätename in Name und Kartentitel eines Wächters: „Batterie schwach" + „iPhone Rene" → „Batterie schwach: iPhone Rene".
 * Den kurzen Gerätenamen („iPhone Rene" statt „iPhone Rene Battery Level") liefert der Server (`label`); hier wird er nur angehängt.
 * Gegenstück zu server/src/device-names.ts (gleiche Regeln, gleiche Tests).
 */

/** Kürzt an einer Wortgrenze mit „…" (ohne Leerzeichen davor); ein einzelnes zu langes Wort wird hart gekürzt */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = '';
  for (const word of text.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length + 1 > max) break;
    out = next;
  }
  return out ? `${out}…` : `${text.slice(0, Math.max(1, max - 1))}…`;
}

/** Die Wörter des Geräts, die im Namen noch fehlen (Wörter ab 3 Zeichen als Teilstring, kürzere als ganzes Wort; Groß und Klein egal) */
function missingWords(name: string, label: string): string[] {
  const n = name.toLowerCase();
  const tokens = n.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return label
    .replace(/…/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => (w.length >= 3 ? !n.includes(w.toLowerCase()) : !tokens.includes(w.toLowerCase())));
}

/** Steht das Gerät schon im Namen? (Alle seine Wörter sind darin.) Ohne Gerät: ja */
export function containsDevice(name: string, label: string): boolean {
  return missingWords(name, label).length === 0;
}

/**
 * Steht Teil des Geräts schon im Namen, kommt nur der Rest dazu („Waschmaschine fertig" + „Waschmaschine Keller" → „Waschmaschine fertig: Keller"),
 * steht alles darin, bleibt er; ist die Grenze (`max`, 80) knapp, kürzt das Gerät, nie der Name
 */
export function withDevice(base: string, label: string | undefined, max = 80): string {
  const rest = missingWords(base, label ?? '').join(' ');
  if (!rest) return base;
  const room = max - base.length - 2;
  if (room < 4) return base;
  return `${base}: ${shorten(rest, room)}`;
}
