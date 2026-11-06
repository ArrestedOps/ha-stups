import type { HomeItem } from './api';
import { t } from './i18n/index.svelte';
import { modeSummary } from './watcher-flow';
import { conditionText } from './watchers';

/**
 * Die Ansicht „Wächter": Wer steht wo? Jeder Wächter steht genau einmal. Oben die aktuellen (Wartet, Läuft, Bald), darunter alle übrigen
 * nach Kategorie, „Ohne Kategorie" ganz unten. Ein ausgeschalteter Wächter bleibt sichtbar (in seiner Kategorie); nur seine noch offene
 * Karte steht, solange sie wartet, oben. Der Klappzustand der Kategorien wird je Gerät gemerkt (Standard: aufgeklappt).
 */

export interface WatcherGroup {
  /** Schlüssel zum Vergleichen und Merken (ohne Beachtung der Groß-/Kleinschreibung) */
  key: string;
  /** Anzeigename; null bei „Ohne Kategorie" (die Oberfläche beschriftet sie) */
  name: string | null;
  items: HomeItem[];
}

export interface WatcherLayout {
  /** Wächter mit Problem (keine Zuständigen, Entität oder Ziel fehlt): ganz oben, vor allen anderen, mit rotem Rand */
  problems: HomeItem[];
  waiting: HomeItem[];
  running: HomeItem[];
  soon: HomeItem[];
  groups: WatcherGroup[];
}

const NONE_KEY = '\u0000none';

/** Schlüssel einer Kategorie: Leerräume gefaltet, Groß-/Kleinschreibung egal; ohne Kategorie ein fester Schlüssel */
export function categoryKeyOf(category: string | null | undefined): string {
  const name = category?.trim().replace(/\s+/g, ' ') ?? '';
  return name === '' ? NONE_KEY : name.toLowerCase();
}

/** Gleiche Namen (zehn Mal „Batterie schwach") stehen nach Gerätename, zuletzt nach Kennung: stabil, egal wie der Server sie liefert */
const byName = (a: HomeItem, b: HomeItem): number =>
  a.name.localeCompare(b.name) || (a.subject ?? '').localeCompare(b.subject ?? '', undefined, { sensitivity: 'base' }) || a.watcherId.localeCompare(b.watcherId);
/** Am längsten Wartende zuerst; was am längsten läuft, zuerst */
const bySince = (list: HomeItem[]): HomeItem[] => [...list].sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '') || byName(a, b));

/**
 * Hat der Wächter ein Problem? `assignees_missing` (legt keine Karten an), `entity_missing` oder `target_missing` (pausiert). Solche Wächter
 * stehen ganz oben in der Liste, mit rotem Rand und dem Grund als Text.
 */
export const isProblem = (i: Pick<HomeItem, 'status' | 'entityMissing'>): boolean =>
  i.status === 'assignees_missing' || i.status === 'entity_missing' || i.status === 'target_missing' || i.entityMissing === true;

export function watcherLayout(items: HomeItem[]): WatcherLayout {
  const problems: HomeItem[] = [];
  const waiting: HomeItem[] = [];
  const running: HomeItem[] = [];
  const soon: HomeItem[] = [];
  const rest: HomeItem[] = [];
  for (const i of items) {
    // Ein ausgeschalteter Wächter läuft nie „gerade" und kommt nicht „bald": nur seine offene Karte wartet weiter
    if (isProblem(i)) problems.push(i);
    else if (i.phase === 'waiting') waiting.push(i);
    else if (i.phase === 'running' && i.active) running.push(i);
    else if (i.phase === 'soon' && i.active) soon.push(i);
    else rest.push(i);
  }
  const byKey = new Map<string, WatcherGroup>();
  for (const i of [...rest].sort(byName)) {
    const key = categoryKeyOf(i.category);
    let g = byKey.get(key);
    if (!g) byKey.set(key, (g = { key, name: key === NONE_KEY ? null : i.category!.trim().replace(/\s+/g, ' '), items: [] }));
    g.items.push(i);
  }
  const groups = [...byKey.values()].sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
  return { problems: [...problems].sort(byName), waiting: bySince(waiting), running: bySince(running), soon: [...soon].sort(byName), groups };
}

/** Wie viele Wächter haben noch keine Kategorie (für „Kategorien vorschlagen") */
export const uncategorizedCount = (items: Pick<HomeItem, 'category'>[]): number => items.filter((i) => categoryKeyOf(i.category) === NONE_KEY).length;

/** Die Auswahl im Editor: vorhandene Kategorien ohne Doppelte (Schreibweise egal), alphabetisch, dazu die aktuelle Wahl, auch wenn sie neu ist */
export function categoryOptions(names: (string | null | undefined)[], current = ''): string[] {
  const byKey = new Map<string, string>();
  for (const n of [...names, current]) {
    const name = n?.trim().replace(/\s+/g, ' ') ?? '';
    if (name !== '' && !byKey.has(categoryKeyOf(name))) byKey.set(categoryKeyOf(name), name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// ---------- Klappzustand ----------

/** Schlüssel → aufgeklappt; nur ausdrückliche Entscheidungen stehen darin */
export type CollapseMemo = Record<string, boolean>;
export const COLLAPSE_KEY = 'stups.watcher-groups';

/** Eine Kategorie ist offen, solange nichts anderes gemerkt ist; bei einer Suche immer (der gemerkte Zustand bleibt unberührt) */
export const groupOpen = (key: string, memo: CollapseMemo, searching: boolean): boolean => searching || (memo[key] ?? true);

/** Der Zustand nach einem Tipp auf den Kopf: das Gegenteil dessen, was gerade zu sehen war */
export const toggleGroup = (memo: CollapseMemo, key: string, currentlyOpen: boolean): CollapseMemo => ({ ...memo, [key]: !currentlyOpen });

export function parseCollapse(raw: string | null): CollapseMemo {
  if (!raw) return {};
  try {
    const o: unknown = JSON.parse(raw);
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'));
  } catch {
    return {};
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Aus dem Speicher des Geräts lesen; im iframe oder Privatfenster kann er fehlen oder werfen: dann gilt der Standard */
export function loadCollapse(store: Store | null = defaultStore()): CollapseMemo {
  try {
    return parseCollapse(store?.getItem(COLLAPSE_KEY) ?? null);
  } catch {
    return {};
  }
}

export function saveCollapse(memo: CollapseMemo, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(COLLAPSE_KEY, JSON.stringify(memo));
  } catch {
    /* egal: dann gilt der Zustand nur bis zum Neuladen */
  }
}

// ---------- Texte der Zeile ----------

export type RowStatus = 'noassign' | 'target' | 'missing' | 'off' | 'waiting' | 'running' | 'soon' | 'quiet';

/** Was die Statusspalte zeigt: Probleme (keine Zuständigen, Ziel oder Entität fehlt) vor „Aus" vor der Phase */
export const rowStatus = (i: Pick<HomeItem, 'entityMissing' | 'active' | 'phase'> & { status?: HomeItem['status'] }): RowStatus =>
  i.status === 'assignees_missing' ? 'noassign' : i.status === 'target_missing' ? 'target' : i.entityMissing || i.status === 'entity_missing' ? 'missing' : !i.active ? 'off' : i.phase;

/** Der Grund eines Problems als Satz für die Zeile („Keine Karten: braucht neue Zuständige"); null: kein Problem */
export function problemText(i: Pick<HomeItem, 'status' | 'entityMissing'>): string | null {
  if (i.status === 'assignees_missing') return t('Keine Karten: braucht neue Zuständige');
  if (i.status === 'target_missing') return t('Pausiert: Board oder Spalte gibt es nicht mehr');
  if (i.status === 'entity_missing' || i.entityMissing) return t('Entität fehlt');
  return null;
}

export function statusLabel(s: RowStatus): string {
  switch (s) {
    case 'noassign':
      return t('Keine Karten');
    case 'target':
      return t('Pausiert');
    case 'missing':
      return t('Entität fehlt');
    case 'off':
      return t('Aus');
    case 'waiting':
      return t('Wartet');
    case 'running':
      return t('Läuft');
    case 'soon':
      return t('Bald');
    default:
      return t('Ruhig');
  }
}

/** Die Bedingung als Halbsatz („Tür Batterie 10 Minuten unter 20 % liegt"), derselbe Text wie im Editor */
export const triggerText = (i: Pick<HomeItem, 'trigger' | 'entity' | 'entityUnit'>): string =>
  conditionText({
    entityName: i.entity,
    entityId: i.trigger.entityId,
    entityUnit: i.entityUnit ?? '',
    kind: i.trigger.kind,
    to: i.trigger.to ?? '',
    value: String(i.trigger.value ?? '').replace('.', ','),
    forMin: String(i.trigger.forMin),
    leadHours: String(Math.round((i.trigger.leadMin ?? 720) / 60)),
    forecastHours: String(i.trigger.forecast?.hours ?? 3),
  });

/** Wer die Karte bekommt, als Text: feste Personen mit Namen, sonst die Art der Zuweisung */
export function whoText(assign: HomeItem['assign'], personName: (id: string) => string): string {
  const names = assign.personIds.map(personName).join(', ');
  if (assign.mode === 'fixed' && names) return names;
  if (assign.mode === 'rotation' && names) return t('abwechselnd: {names}', { names });
  return modeSummary(assign.mode);
}

// ---------- Tabelle (Desktop) ----------

/**
 * Die Spalten der Tabelle, für Kopf und Zeilen gleich (bündig). Sie richten sich nach der Breite der Liste (Container-Abfrage), nicht nach
 * dem Fenster: Seitenleiste und Detailspalte nehmen Platz weg. Schmal: Wächter, Aktuell, Status, Schalter; ab 700 px dazu die Bedingung;
 * ab 900 px die letzte Auslösung; ab 1100 px die nächste Karte und die Zuständigen. Lieber Spalten ausblenden als quetschen.
 */
export const TABLE_COLS =
  'grid-cols-[minmax(0,1fr)_4.5rem_7rem_3.25rem] @min-[700px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_4.5rem_7rem_3.25rem] @min-[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_4.5rem_7rem_5.5rem_3.25rem] @min-[1100px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_4.5rem_7rem_5.5rem_minmax(0,1fr)_8rem_3.25rem]';
/** Spalten, die erst ab 700 px (Bedingung), 900 px (letzte Auslösung) und 1100 px (nächste Karte, Zuständige) erscheinen */
export const COL_MID = 'hidden @min-[700px]:block';
export const COL_LAST = 'hidden @min-[900px]:block';
export const COL_WIDE = 'hidden @min-[1100px]:flex';
