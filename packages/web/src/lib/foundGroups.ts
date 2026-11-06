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

const ICONS: Record<string, string> = { washer: 'washer', dryer: 'fan', dishwasher: 'dish', bins: 'trash', rain: 'globe', battery: 'plug', vacuum: 'vacuum' };
/** Symbol der Vorlage am Gruppenkopf */
export const foundIcon = (templateId: string): string => ICONS[templateId] ?? 'eye';
