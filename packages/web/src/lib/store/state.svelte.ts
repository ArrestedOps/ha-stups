import type { Attachment, BoardSummary, BoardView, Capabilities, OnboardingProgress, Settings, User, WatcherItem } from '../api';
import { passkeysSupported } from '../passkeys';
import { mayDo, type Permission } from '../permissions';
import { DEFAULT_FILTER, type ScheduleFilter } from '../schedule';
import type { SettingsPageId } from '../settingsPages';
import type { StatsKind } from '../statsSheets';
import type { Tab } from '../tabs';
import type { TemplateDraft } from '../watcher-types';
import { isDesktop } from '../viewport';

// Der gemeinsame Zustand der Oberfläche (`ui`), die Berechtigungen (`can`) und die Betriebsart (`feat`). Alles andere im Store liest und
// schreibt `ui`; dieses Teil importiert nichts aus dem Store.

export type Sheet =
  | null
  | { type: 'card'; id: string }
  | { type: 'cardMenu'; id: string }
  | { type: 'new'; columnId: string; dueAt?: string; /** die Spalte ist gewählt (das „+“ über einer Spalte im Kanban): der Termin ändert sie nicht von selbst */ picked?: boolean }
  | { type: 'slot'; at: string }
  | { type: 'boards' }
  | { type: 'newBoard' }
  | { type: 'boardOrder' }
  | { type: 'archivedBoards' }
  /** `boardId`: für dieses Board öffnen (sonst das aktuelle) */
  | { type: 'boardSettings'; boardId?: string }
  | { type: 'settings'; page?: SettingsPageId }
  | { type: 'people' }
  | { type: 'watcher'; id: string | null; template?: string; /** geöffnet aus Einstellungen › Wächter oder aus „Gefunden": dorthin geht Zurück */ from?: 'settings' | 'found'; hit?: { entityId: string; name: string; unit?: string; draft?: TemplateDraft } }
  | { type: 'found' }
  | { type: 'nudge'; id: string }
  | { type: 'trash' }
  | { type: 'archive'; /** geöffnet aus „Heute erledigt“: dorthin geht Zurück */ from?: 'stats' }
  | { type: 'stats'; kind: StatsKind }
  | { type: 'week' }
  | { type: 'notifications' }
  | { type: 'filter' };

export type { Tab };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => Promise<void> | void };
}

/**
 * Eine Rückfrage (ConfirmDialog). Ohne `tone` ist sie eine Warnung (rot, Papierkorb, „Abbrechen“); mit `tone: 'primary'` eine
 * freundliche Frage mit eigener Beschriftung für „Nein“ (`cancelLabel`). „Nein“ und Escape schließen nur den Dialog.
 */
export interface ConfirmRequest {
  title: string;
  text: string;
  label: string;
  run: () => Promise<void> | void;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

/** Womit der Bereich „Neuer Wächter“ aufklappt: eine Vorlage und/oder ein Treffer aus „Gefunden“ (Entität schon gewählt) */
export interface NewWatcherRequest {
  template?: string;
  hit?: { entityId: string; name: string; unit?: string; draft?: TemplateDraft };
  /** Wer bei „Wer kommt infrage?" vorgewählt ist (die Einrichtung) */
  personIds?: string[];
}

export const ui = $state({
  ready: false,
  fatal: null as string | null,
  /** Was die Betriebsart bietet (null = unbekannt, dann gilt alles wie im Add-on) */
  caps: null as Capabilities | null,
  /** Statt der App steht die Anmeldung oder die Einrichtung des ersten Administrators */
  gate: null as null | 'login' | 'setup',
  online: true,
  me: null as User | null,
  /** Administrator in Home Assistant */
  isAdmin: false,
  /** Was ein Administrator dieser Person zusätzlich erlaubt hat (Antwort des Servers: Administrator alles, Kind nichts); siehe `can` */
  permissions: [] as Permission[],
  /** Rolle „Kind": die Oberfläche zeigt nur, was ein Kind darf (der Server prüft es ohnehin) */
  isChild: false,
  /** false: der Benutzer ist (noch) nicht freigegeben, statt der App steht eine Erklärung */
  allowed: true,
  people: [] as User[],
  boards: [] as BoardSummary[],
  /** Archivierte Boards, die die Person sehen dürfte (nur für Erwachsene; für „Archivierte Boards“) */
  archivedBoards: [] as BoardSummary[],
  boardId: null as string | null,
  view: null as BoardView | null,
  columnId: null as string | null,
  settings: null as Settings | null,
  /** Wächter (null = noch nicht geladen); bestimmt mit, ob der Reiter „Wächter" erscheint */
  watchers: null as { available: boolean; items: WatcherItem[] } | null,
  filter: { categoryIds: [] as string[], onlyMine: false, personIds: [] as string[], nudged: false, search: '' },
  searchOpen: false,
  sheet: null as Sheet,
  /** Karte, die gerade „hüpft" (nach dem Stupsen) */
  hop: null as string | null,
  /** Ansicht unten in der Leiste: Aufgaben, Boards oder Wächter */
  tab: 'tasks' as Tab,
  /** Aufgaben zeigt gerade den Kalender (Tag, Woche, Monat) statt der Liste: der „+"-Knopf ruht dann */
  tasksCalendar: false,
  /** Wunsch von außen (Leiste unten): Aufgaben als Liste oder Kalender zeigen; TasksView nimmt ihn an und setzt ihn zurück */
  tasksGoto: null as 'list' | 'calendar' | null,
  /** Filter für Agenda und Kalender (Personen, Boards, Erledigtes) */
  sf: { ...DEFAULT_FILTER } as ScheduleFilter,
  /** zählt bei jedem Nachladen hoch, damit offene Detailansichten und die Agenda sich aktualisieren */
  rev: 0,
  dragging: false,
  /** ab 1024 px Breite: Seitenleiste, Detailspalte, alle Spalten nebeneinander, Ziehen mit der Maus (App.svelte hält es aktuell) */
  desktop: isDesktop(),
  /** Desktop, Aufgaben: die Karte in der Detailspalte rechts (statt im Sheet); null: keine gewählt */
  detailId: null as string | null,
  /** Desktop: Eingabe im Suchfeld oben (Aufgaben und Wächter; die Boards nutzen filter.search, das Blatt „Filter“ zeigt dasselbe Feld) */
  query: '',
  /** geöffnetes Foto oder PDF (Vollbild in der App) */
  viewer: null as null | { items: Attachment[]; index: number },
  toasts: [] as Toast[],
  /** Rückfrage vor einer Aktion, die sich nicht von selbst zurücknehmen lässt */
  confirm: null as null | ConfirmRequest,
  /** Einrichtung beim ersten Start: läuft sie gerade (Antwort des Servers, siehe onboarding.svelte.ts) und der gemerkte Stand dazu */
  onboarding: { needs: false, progress: null as OnboardingProgress | null },
  /** Desktop: „Neuer Wächter“ soll im Reiter Wächter aufklappen (aus „Gefunden“ oder den Einstellungen); die Ansicht liest und löscht es */
  newWatcher: null as null | NewWatcherRequest,
});

/**
 * Was angezeigt wird. Im Add-on (Anmeldung über Home Assistant) bleibt alles wie bisher, auch wenn Home Assistant
 * gerade nicht antwortet. Nur beim eigenständigen Betrieb mit eigener Anmeldung entfällt, was es dort nicht gibt.
 */
/** Darf diese Person das? Die Oberfläche blendet danach ein und aus; der Server prüft jede Anfrage selbst. */
export const can = (key: Permission): boolean => mayDo(ui, key);

/** Rolle und Berechtigungen aus der Antwort des Servers (ändern sich, wenn ein Administrator sie ändert: auch beim Nachladen) */
export function applyRole(me: { isAdmin: boolean; isChild: boolean; permissions?: Permission[] }): void {
  ui.isAdmin = me.isAdmin;
  ui.isChild = me.isChild;
  const next = me.permissions ?? [];
  if (next.join() !== ui.permissions.join()) ui.permissions = next;
}

export const feat = {
  /** eigene Konten statt Home Assistant */
  get standalone(): boolean {
    return ui.caps?.auth === 'session';
  },
  get watchers(): boolean {
    return !this.standalone || (ui.caps?.watchers ?? false);
  },
  get push(): boolean {
    return !this.standalone || (ui.caps?.push.length ?? 0) > 0;
  },
  /** Push über die Companion App (Home Assistant) */
  get haPush(): boolean {
    return ui.caps ? ui.caps.push.includes('ha-notify') : !this.standalone;
  },
  /** Push über einen ntfy-Server */
  get ntfy(): boolean {
    return ui.caps?.push.includes('ntfy') ?? false;
  },
  /** Stups sitzt in Home Assistant (Add-on): Dashboard-Button, Kopfzeile von Home Assistant, Bubble Card, Diagnose-Seite */
  get haUi(): boolean {
    return !this.standalone;
  },
  /** Verbindung zu Home Assistant besteht (App oder eigener Container mit Adresse und Token): Personen als Vorschläge */
  get ha(): boolean {
    return ui.caps?.ha ?? !this.standalone;
  },
  /** Haus-Kanäle (Ansage über einen Lautsprecher, Lampe): nur mit Verbindung zu Home Assistant */
  get house(): boolean {
    return ui.caps?.house ?? false;
  },
  /** Die Beta-App (mit eigenen Daten; Push und Wächter sind dort zunächst aus) */
  get beta(): boolean {
    return ui.caps?.channel === 'beta';
  },
  /** Anmeldung mit Passkey: vom Server eingerichtet und vom Browser unterstützt */
  get passkeys(): boolean {
    return this.standalone && (ui.caps?.passkeys ?? false) && passkeysSupported();
  },
  /** Umzug zwischen zwei Add-ons */
  get migration(): boolean {
    return !this.standalone;
  },
};
