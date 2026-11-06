/**
 * Der Titel der Karte, die ein Wächter anlegt: die Vorlage im Wächter bleibt sauber („Batterie wechseln"), die Karte bekommt zur Laufzeit
 * den Namen der Entität dazu („Batterie wechseln: Nuki Türschloss"), damit man in den Aufgaben sieht, um welches Gerät es geht. Gegenstück
 * zu `cardTitleOf` in server/src/watcher-names.ts (gleiche Regeln, gleiche Tests); die Vorschau im Editor zeigt damit den fertigen Titel.
 * Nichts wird angehängt bei Kalender und Vorhersage (die Entität ist dort kein Gerät), ohne Entitätsnamen oder wenn der Name schon im Titel steht.
 */
export function cardTitleWithEntity(title: string, kind: string, entityName: string, max = 200): string {
  const base = title.trim();
  const name = entityName.trim();
  if (!base || !name || kind === 'calendar_event' || kind === 'forecast') return base;
  if (base.toLowerCase().includes(name.toLowerCase())) return base;
  const room = max - base.length - 2;
  if (room >= name.length) return `${base}: ${name}`;
  // zu lang: den Namen an einer Wortgrenze kürzen, nie den Titel
  if (room < 4) return base;
  let out = '';
  for (const word of name.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length + 1 > room) break;
    out = next;
  }
  return `${base}: ${out || name.slice(0, room - 1)}…`;
}
