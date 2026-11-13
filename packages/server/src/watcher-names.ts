import { deviceLabel, withDevice } from './device-names.js';
import { withLanguage } from './i18n/index.js';
import { watcherTemplates } from './watcher-templates.js';

/**
 * Namen von Wächtern. Ein neuer Wächter aus einer Vorlage heißt wie die Vorlage („Batterie schwach"); welches Gerät er beobachtet, steht
 * in der Liste immer darunter (`subject`). Der Aufgabentitel nennt das Gerät weiter, damit er in den Aufgaben unterscheidbar bleibt.
 */

/** Das Gerät unter dem Namen in Listen: der Friendly Name der beobachteten Entität, ohne ihn die Entitäts-ID */
export const subjectOf = (seen: { name?: string } | null, entityId: string): string => seen?.name?.trim() || entityId;

/** Die Namen und Aufgabentitel der Vorlagen in beiden Sprachen (ein Wächter, der in der anderen Sprache angelegt wurde, zählt genauso) */
function templateTexts(pick: (draft: { name: string; card: { title: string } }) => string): string[] {
  const texts = new Set<string>();
  for (const lang of ['de', 'en'] as const) {
    for (const tpl of withLanguage(lang, () => watcherTemplates())) if (tpl.draft) texts.add(pick(tpl.draft));
  }
  // lange zuerst: „Waschmaschine fertig" vor „Waschmaschine", falls eine Vorlage im Text der anderen steckt
  return [...texts].sort((a, b) => b.length - a.length);
}
export const templateNames = (): string[] => templateTexts((d) => d.name);
export const templateCardTitles = (): string[] => templateTexts((d) => d.card.title);

/**
 * Der Titel der Aufgabe, die ein Wächter anlegt: die Vorlage im Wächter bleibt sauber („Batterie wechseln"), die Aufgabe bekommt zur Laufzeit den
 * Namen der Entität dazu („Batterie wechseln: Nuki Türschloss"), damit man in den Aufgaben sieht, um welches Gerät es geht. Nichts wird
 * angehängt bei Kalender und Vorhersage (die Entität ist dort kein Gerät), ohne Entitätsnamen oder wenn der Name schon im Titel steht
 * (kein „Batterie: Nuki: Nuki"). Gegenstück zu web/src/lib/cardTitle.ts (gleiche Regeln, gleiche Tests); die Vorschau im Editor nutzt es.
 */
export function cardTitleOf(title: string, kind: string, entityName: string, max = 200): string {
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

/**
 * Frühere Versionen hängten das Gerät an den Namen und den Aufgabentitel („Trockner fertig: Nachfrage mw50gdjw"). Gibt den Text der Vorlage zurück, wenn `name`
 * **genau** das ist, was diese Regel aus dem Namen einer Vorlage und dem Gerät der Entität machte, sonst `null`. Eigene Namen und alles, was
 * nicht sicher passt, bleiben stehen. Das Gerät kommt aus dem Friendly Name (falls bekannt) oder der Entitäts-ID.
 */
export function plainName(name: string, entityId: string, friendlyName: string | null | undefined, bases: string[] = templateNames(), max = 80): string | null {
  const labels = new Set<string>();
  if (friendlyName) labels.add(deviceLabel(friendlyName, entityId));
  labels.add(deviceLabel(null, entityId));
  for (const base of bases) {
    if (!name.startsWith(`${base}: `)) continue;
    for (const label of labels) if (withDevice(base, label, max) === name) return base;
  }
  return null;
}
