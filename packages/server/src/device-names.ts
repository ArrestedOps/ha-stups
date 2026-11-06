/**
 * Gerätenamen für Wächter: aus dem Friendly Name einer Entität ("iPhone Rene Battery Level") wird ein kurzer Gerätename ("iPhone Rene"),
 * den Name und Kartentitel eines Wächters nennen ("Batterie schwach: iPhone Rene"). Reine Funktionen ohne Abhängigkeiten.
 */

/** Wörter am Ende eines Sensornamens, die nur sagen, WAS gemessen wird (Batterie, Leistung, Zustand), nicht WO */
const TAIL = new Set([
  'battery', 'batterie', 'batteriestand', 'batterieladung', 'batteriestatus', 'akku', 'akkustand', 'ladestand', 'ladung', 'charge',
  'level', 'state', 'status', 'stand', 'percent', 'prozent', '%',
  'power', 'leistung', 'energy', 'energie',
  'betriebsstatus', 'betriebszustand', 'programmstatus', 'zustand',
]);

/** Satzzeichen, die zwischen Name und Endung stehen können ("Tür - Batterie", "Tür: Battery Level") */
const EDGE = /^[\s:\-–—·|,;/]+|[\s:\-–—·|,;/]+$/g;

/** Längster Gerätename im Titel; länger wird an einer Wortgrenze gekürzt */
export const LABEL_MAX = 28;

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

/**
 * Kurzer Gerätename: Friendly Name ohne Endungen wie „Battery Level", „Batterie", „Leistung" (auch mehrere hintereinander).
 * Ohne Friendly Name dient die Entitäts-ID ("sensor.flur_tuer_battery" → "flur tuer"). Nie leer: bestünde der Name nur aus Endungen, bleibt er.
 */
export function deviceLabel(friendlyName: string | null | undefined, entityId: string, max = LABEL_MAX): string {
  const fromId = entityId.split('.').slice(1).join('.').replace(/_+/g, ' ');
  // Home Assistant ohne Namen meldet manchmal die Entitäts-ID als Namen: so gelesen wie die ID
  const named = typeof friendlyName === 'string' && friendlyName.trim() && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(friendlyName.trim());
  const idText = typeof friendlyName === 'string' && !named ? friendlyName.trim().split('.').slice(1).join('.').replace(/_+/g, ' ') : '';
  const raw = (named ? friendlyName! : idText || fromId || entityId).replace(EDGE, '');
  const words = raw.split(/\s+/).filter(Boolean);
  const kept = [...words];
  while (kept.length > 1 && (TAIL.has(kept[kept.length - 1]!.replace(EDGE, '').toLowerCase()) || kept[kept.length - 1]!.replace(EDGE, '') === '')) kept.pop();
  // Endungen weggeräumt, aber nichts blieb übrig (nur Endungen): dann gilt der volle Name
  const onlyTail = kept.length === 1 && TAIL.has(kept[0]!.replace(EDGE, '').toLowerCase());
  const text = (onlyTail ? words : kept).join(' ').replace(EDGE, '');
  return shorten(text || entityId, max);
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

/**
 * „Batterie schwach" + „iPhone Rene" → „Batterie schwach: iPhone Rene". Steht Teil des Geräts schon im Namen, kommt nur der Rest dazu
 * („Waschmaschine fertig" + „Waschmaschine Keller" → „Waschmaschine fertig: Keller"), steht alles darin, bleibt der Name.
 * Ist die Grenze (`max`, Standard 80 wie beim Wächter) knapp, kürzt das Gerät, nie der Name; ohne Platz bleibt der Name.
 */
export function withDevice(base: string, label: string, max = 80): string {
  const rest = missingWords(base, label).join(' ');
  if (!rest) return base;
  const room = max - base.length - 2;
  if (room < 4) return base;
  return `${base}: ${shorten(rest, room)}`;
}
