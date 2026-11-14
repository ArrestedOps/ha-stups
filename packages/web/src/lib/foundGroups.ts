import { matchesQuery } from './search';
import type { WatcherSuggestion, WatcherTemplate } from './watcher-types';

/**
 * „Gefunden“: Die Treffer von Home Assistant nach Vorlage gruppiert (Batterien, Waschmaschine, Müllabfuhr …), damit auch 100 und mehr
 * Treffer übersichtlich bleiben. Reine Funktionen, die Oberfläche (FoundHits.svelte) hält nur Eingabe und Aufklappzustand.
 */

/** Bis zu so vielen Treffern steht eine Gruppe offen; größere zeigen die ersten und „Alle N anzeigen“ */
export const FOUND_PREVIEW = 5;
/** Ab so vielen Treffern insgesamt erscheint das Suchfeld */
export const FOUND_SEARCH_FROM = 12;

export interface FoundGroup {
  /** Kennung der Vorlage */
  id: string;
  title: string;
  /** Die Treffer der Gruppe nach dem Filter, in der Reihenfolge des Servers (Batterien: die schwächste zuerst) */
  items: WatcherSuggestion[];
}

/**
 * Eine Gruppe je Vorlage in der Reihenfolge der Vorlagen; Treffer einer unbekannten Vorlage (neuer Server, alte Oberfläche) stehen zuletzt.
 * `query` filtert nach Gerätename, Entität, Begründung und Titel der Vorlage; Gruppen ohne Treffer fallen weg.
 */
export function groupSuggestions(items: WatcherSuggestion[], templates: Pick<WatcherTemplate, 'id' | 'title'>[], query = ''): FoundGroup[] {
  const titles = new Map(templates.map((x) => [x.id, x.title]));
  const byId = new Map<string, WatcherSuggestion[]>();
  for (const s of items) {
    const title = titles.get(s.templateId) ?? s.templateId;
    if (!matchesQuery(query, s.name, s.entityId, s.reason, s.label, title)) continue;
    const list = byId.get(s.templateId);
    if (list) list.push(s);
    else byId.set(s.templateId, [s]);
  }
  const order = [...templates.map((x) => x.id), ...[...byId.keys()].filter((id) => !titles.has(id))];
  return order.filter((id) => byId.has(id)).map((id) => ({ id, title: titles.get(id) ?? id, items: byId.get(id)! }));
}

/** Welche Treffer der Gruppe sind zu sehen? Alle bei kleiner Gruppe, aufgeklappt oder mit Filter, sonst die ersten fünf */
export const visibleHits = (g: FoundGroup, expanded: boolean, filtering: boolean): WatcherSuggestion[] =>
  expanded || filtering || g.items.length <= FOUND_PREVIEW ? g.items : g.items.slice(0, FOUND_PREVIEW);

export const showFoundSearch = (total: number): boolean => total >= FOUND_SEARCH_FROM;

const ICONS: Record<string, string> = {
  washer: 'washer',
  dryer: 'fan',
  dishwasher: 'dish',
  bins: 'trash',
  rain: 'globe',
  battery: 'plug',
  vacuum: 'vacuum',
  window_open: 'window',
  fridge_open: 'door',
  leak: 'alert',
  plant: 'leaf',
  humid: 'fan',
  co2: 'fan',
  dehumidifier: 'fan',
  robot_error: 'robot',
  filter_life: 'layers',
  toner: 'file',
  level: 'layers',
  refill: 'dish',
  litter: 'trash',
  ev_plug: 'plug',
  mail: 'message',
  garage_lock: 'shield',
  freezer_warm: 'heat',
  unavailable: 'wifi-off',
  update: 'download',
};
/** Symbol der Vorlage am Gruppenkopf */
export const foundIcon = (templateId: string): string => ICONS[templateId] ?? 'eye';

// ---------- Mehrere Treffer auswählen ----------

/** Kennung eines Treffers in der Auswahl (dieselbe Entität kann unter zwei Vorlagen stehen) */
export const hitId = (s: Pick<WatcherSuggestion, 'templateId' | 'entityId'>): string => `${s.templateId}|${s.entityId}`;

/** Gemeinsam einrichten lassen sich nur Treffer derselben Vorlage und Fassung (Leistung oder Programmstatus eines Geräts haben verschiedene Auslöser) */
export const selectionKey = (s: Pick<WatcherSuggestion, 'templateId' | 'variant'>): string => `${s.templateId}:${s.variant}`;

/** Passt der Treffer zu dem, was schon gewählt ist? Ohne Auswahl passt jeder */
export const canJoin = (selected: Pick<WatcherSuggestion, 'templateId' | 'variant'>[], s: Pick<WatcherSuggestion, 'templateId' | 'variant'>): boolean =>
  selected.length === 0 || selectionKey(selected[0]!) === selectionKey(s);

/**
 * „Alle auswählen“ im Kopf einer Gruppe: alle Treffer der Gruppe, die zur Auswahl passen. Ist noch nichts gewählt, gilt die Fassung des
 * ersten Treffers (beim Gerät mit Leistung und Programmstatus zählt die Leistung, sie steht zuerst).
 */
export function pickableInGroup(items: WatcherSuggestion[], selected: WatcherSuggestion[]): WatcherSuggestion[] {
  const first = items[0];
  if (!first) return [];
  const anchor = selected.length > 0 ? selected : [first];
  return items.filter((s) => canJoin(anchor, s));
}
