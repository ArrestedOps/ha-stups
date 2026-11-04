import {
  api,
  ApiError,
  setUnauthorizedHandler,
  type Attachment,
  type BoardSummary,
  type BoardView,
  type Capabilities,
  type Card,
  type Settings,
  type User,
  type WatcherItem,
} from './api';
import { formatDue } from './datetime';
import { applyHeaderHiding } from './hideHaHeader';
import { applyAccent, hueFromStorage, type Scheme } from './accent';
import { i18n, type LanguageChoice, languageFromStorage, resolveLanguage, setLanguage, t } from './i18n/index.svelte';
import { passkeysSupported } from './passkeys';
import { DEFAULT_FILTER, type ScheduleFilter } from './schedule';
import { swipeTarget } from './swipe';
import type { SettingsPageId } from './settingsPages';
import type { TemplateDraft } from './watcher-types';
import { startTab, visibleTabs, type Tab } from './tabs';
import { applyCards, deltaIds } from './delta';
import { startSync, type SyncInfo } from './sync';

export type Sheet =
  | null
  | { type: 'card'; id: string }
  | { type: 'cardMenu'; id: string }
  | { type: 'new'; columnId: string; dueAt?: string }
  | { type: 'slot'; at: string }
  | { type: 'boards' }
  | { type: 'boardSettings' }
  | { type: 'settings'; page?: SettingsPageId }
  | { type: 'people' }
  | { type: 'watcher'; id: string | null; template?: string; hit?: { entityId: string; name: string; unit?: string; draft?: TemplateDraft } }
  | { type: 'found' }
  | { type: 'nudge'; id: string }
  | { type: 'trash' }
  | { type: 'archive' }
  | { type: 'week' };

export type { Tab };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => Promise<void> | void };
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
  /** Rolle „Kind": die Oberfläche zeigt nur, was ein Kind darf (der Server prüft es ohnehin) */
  isChild: false,
  /** false: der Benutzer ist (noch) nicht freigegeben, statt der App steht eine Erklärung */
  allowed: true,
  people: [] as User[],
  boards: [] as BoardSummary[],
  boardId: null as string | null,
  view: null as BoardView | null,
  columnId: null as string | null,
  settings: null as Settings | null,
  /** Wächter (null = noch nicht geladen); bestimmt mit, ob der Reiter „Wächter" erscheint */
  watchers: null as { available: boolean; items: WatcherItem[] } | null,
  filter: { categoryIds: [] as string[], onlyMine: false, nudged: false, search: '' },
  searchOpen: false,
  sheet: null as Sheet,
  /** Karte, die gerade „hüpft" (nach dem Stupsen) */
  hop: null as string | null,
  /** Ansicht unten in der Leiste: Heute, Boards, Kalender oder Zuhause */
  tab: 'today' as Tab,
  /** Filter für Agenda und Kalender (Personen, Boards, Erledigtes) */
  sf: { ...DEFAULT_FILTER } as ScheduleFilter,
  /** zählt bei jedem Nachladen hoch, damit offene Detailansichten und die Agenda sich aktualisieren */
  rev: 0,
  dragging: false,
  /** ab 1024 px Breite: alle Spalten nebeneinander, Ziehen mit der Maus */
  desktop: false,
  /** geöffnetes Foto oder PDF (Vollbild in der App) */
  viewer: null as null | { items: Attachment[]; index: number },
  toasts: [] as Toast[],
  /** Rückfrage vor einer Aktion, die sich nicht von selbst zurücknehmen lässt */
  confirm: null as null | { title: string; text: string; label: string; run: () => Promise<void> | void },
});

/**
 * Was angezeigt wird. Im Add-on (Anmeldung über Home Assistant) bleibt alles wie bisher, auch wenn Home Assistant
 * gerade nicht antwortet. Nur beim eigenständigen Betrieb mit eigener Anmeldung entfällt, was es dort nicht gibt.
 */
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

// ---------- lokale Merkzettel (können im iframe blockiert sein) ----------

const memo = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* egal */
    }
  },
};

// ---------- Sprache ----------

const LANGUAGE_KEY = 'stups.language';

/** Wendet die Wahl an (Automatisch: Sprache des Geräts) und merkt sie sich, damit schon die Anmeldeseite stimmt */
export function applyLanguage(choice: LanguageChoice): void {
  memo.set(LANGUAGE_KEY, choice);
  setLanguage(resolveLanguage(choice, navigator.languages?.length ? navigator.languages : [navigator.language ?? '']));
}

/** Die Person wählt in den Einstellungen eine Sprache */
export async function changeLanguage(choice: LanguageChoice): Promise<void> {
  applyLanguage(choice);
  if (ui.me) ui.me = { ...ui.me, languageChoice: choice, language: i18n.lang };
  try {
    await api.setLanguage(choice, i18n.lang);
  } catch (e) {
    toast(errorText(e), { tone: 'error' });
  }
}

// ---------- Akzentfarbe ----------

const ACCENT_KEY = 'stups.accent';
let accentHue: number | null = null;
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const currentScheme = (): Scheme => (darkQuery?.matches === false ? 'light' : 'dark');
// Wechselt das Gerät zwischen Hell und Dunkel, wird die Farbe für das andere Thema neu gerechnet
darkQuery?.addEventListener('change', () => applyAccent(accentHue, currentScheme()));

/** Wendet den Farbton an (null: Orange) und merkt ihn sich, damit schon die Anmeldeseite stimmt */
export function applyAccentHue(hue: number | null): void {
  accentHue = hue;
  memo.set(ACCENT_KEY, hue === null ? '' : String(hue));
  applyAccent(hue, currentScheme());
}

/** Die Person wählt in den Einstellungen eine Farbe */
export async function changeAccent(hue: number | null): Promise<void> {
  applyAccentHue(hue);
  if (ui.me) ui.me = { ...ui.me, accentHue: hue };
  try {
    await api.setAccent(hue);
  } catch (e) {
    toast(errorText(e), { tone: 'error' });
  }
}

// ---------- Hinweise ----------

let toastId = 0;

export function toast(text: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}): void {
  const t: Toast = { id: ++toastId, text, tone: opts.tone ?? 'info', action: opts.action };
  ui.toasts.push(t);
  setTimeout(() => dismissToast(t.id), opts.action ? 7000 : 4000);
}

export function dismissToast(id: number): void {
  const i = ui.toasts.findIndex((t) => t.id === id);
  if (i >= 0) ui.toasts.splice(i, 1);
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : t('Etwas ist schiefgelaufen'));

/**
 * Wie `act`, sagt aber, ob es geklappt hat. `act` gibt bei einem Fehler und bei einer Aktion ohne Ergebnis (löschen)
 * beide `undefined` zurück; wer danach etwas bestätigt („Karte gelöscht“, „Gespeichert“), braucht dieses Ergebnis.
 */
export async function actResult<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const value = await fn();
    await refresh();
    return { ok: true, value };
  } catch (e) {
    toast(errorText(e), { tone: 'error' });
    await refresh();
    return { ok: false };
  }
}

/** Führt eine Aktion aus, lädt danach neu und meldet Fehler als Hinweis. */
export async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const r = await actResult(fn);
  return r.ok ? r.value : undefined;
}

// ---------- Laden ----------

let refreshing: Promise<void> | null = null;
let again = false;
let pendingRefresh = false;
/** Was noch nachzuladen ist: alles, oder einzelne Karten (mehrere Meldungen während des Ladens fließen zusammen) */
const todo = { full: false, ids: new Set<string>() };

/** Lädt nach: ohne Angabe alles, mit der Meldung des Servers nur die geänderten Karten (wenn der Server das sagen kann) */
export function refresh(info?: SyncInfo): Promise<void> {
  const ids = info ? deltaIds(info.changes, info.gap) : null;
  if (ids === null) todo.full = true;
  else for (const id of ids) todo.ids.add(id);
  if (ui.dragging) {
    pendingRefresh = true; // erst nach dem Loslassen, sonst springt die Karte unter dem Finger weg
    return Promise.resolve();
  }
  return flush();
}

function flush(): Promise<void> {
  if (refreshing) {
    again = true;
    return refreshing;
  }
  refreshing = (async () => {
    do {
      again = false;
      const full = todo.full;
      const ids = [...todo.ids];
      todo.full = false;
      todo.ids.clear();
      if (full) await load();
      else await loadCards(ids);
    } while (again);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function setDragging(on: boolean): void {
  ui.dragging = on;
  if (!on && pendingRefresh) {
    pendingRefresh = false;
    void flush(); // was sich währenddessen angesammelt hat (nur Karten oder alles)
  }
}

function ensureColumn(): void {
  const cols = ui.view?.columns ?? [];
  if (!cols.some((c) => c.id === ui.columnId)) ui.columnId = cols[0]?.id ?? null;
}

async function load(): Promise<void> {
  try {
    // Die Personenliste gehört zur Ansicht: Änderungen von anderen Geräten (neue Person, Umbenennen) kommen so mit
    const [boards, people] = await Promise.all([api.boards(), api.people()]);
    ui.boards = boards;
    ui.people = people;
    // die eigene Person folgt der Liste (Bild, „wenig Zeit" … ändern sich auch auf anderen Geräten)
    const mine = people.find((p) => p.id === ui.me?.id);
    if (mine && ui.me) ui.me = { ...ui.me, ...mine };
    if (!ui.boards.some((b) => b.id === ui.boardId)) {
      ui.boardId = ui.boards[0]?.id ?? null;
      ui.columnId = null;
    }
    ui.view = ui.boardId ? await api.board(ui.boardId) : null;
    ensureColumn();
    ui.watchers = await api.watchers().catch(() => ui.watchers);
    ui.rev += 1;
    ui.online = true;
    ui.allowed = true; // der Zugriff war entzogen und ist zurück: die Erklärung verschwindet ohne Neuladen
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) ui.online = false;
    else if (e instanceof ApiError && e.status === 403) ui.allowed = false; // Zugriff wurde entzogen
    else toast(errorText(e), { tone: 'error' });
  }
}

/**
 * Nur die gemeldeten Karten nachladen (statt Board, Personen, Wächter und alle Karten). Alles, was dabei nicht
 * eindeutig ist (Kosten, anderes Board, Fehler), lädt wie bisher alles neu.
 */
async function loadCards(ids: string[]): Promise<void> {
  if (ids.length === 0) return; // geändert hat sich nichts, was eine Ansicht zeigt
  const view = ui.view;
  if (!view) return load();
  try {
    const [boards, fetched] = await Promise.all([api.boards(), api.cardsByIds(ids)]);
    const next = ui.view === view && boards.some((b) => b.id === ui.boardId) ? applyCards(view, ids, fetched) : null;
    if (!next) return load();
    ui.boards = boards;
    ui.view = next;
    ui.rev += 1;
    ui.online = true;
  } catch {
    return load(); // meldet Fehler und Verbindungsabbruch wie gewohnt
  }
}

/** Nach einer erfolgreichen Anmeldung oder Einrichtung: alles frisch laden (Sitzung, Synchronisierung, Ansicht) */
export function reloadApp(): void {
  location.reload();
}

export async function logout(): Promise<void> {
  try {
    await api.logout();
  } finally {
    reloadApp();
  }
}

export async function init(): Promise<void> {
  applyLanguage(languageFromStorage(memo.get(LANGUAGE_KEY)));
  applyAccentHue(hueFromStorage(memo.get(ACCENT_KEY)));
  try {
    ui.caps = await api.capabilities().catch(() => null);
    if (ui.caps?.auth === 'session') {
      setUnauthorizedHandler(() => {
        ui.gate = 'login'; // Sitzung abgelaufen: zurück zur Anmeldung
      });
      const status = await api.authStatus();
      if (status.setupRequired || !status.authenticated) {
        ui.gate = status.setupRequired ? 'setup' : 'login';
        ui.ready = true;
        return;
      }
    }
    const me = await api.me();
    ui.me = me.user;
    // Die Wahl der Person gilt auf allen Geräten. Meldet dieses Gerät eine andere Sprache als zuletzt, erfährt es der Server (für Push)
    applyLanguage(me.user.languageChoice);
    applyAccentHue(me.user.accentHue ?? null);
    if (me.allowed && me.user.language !== i18n.lang) void api.setLanguage(me.user.languageChoice, i18n.lang).catch(() => undefined);
    ui.isAdmin = me.isAdmin;
    ui.isChild = me.isChild;
    if (!me.allowed) {
      // Home Assistant kennt den Benutzer, Stups lässt ihn nicht hinein: nur die Erklärung zeigen
      ui.allowed = false;
      ui.ready = true;
      return;
    }
    const [boards, settings] = await Promise.all([api.boards(), api.settings()]);
    ui.people = me.people;
    ui.boards = boards;
    ui.settings = settings;
    const remembered = memo.get('stups.board');
    ui.boardId = boards.find((b) => b.id === remembered)?.id ?? boards[0]?.id ?? null;
    ui.columnId = memo.get('stups.column');
    restoreView();
    if (ui.boardId) ui.view = await api.board(ui.boardId);
    ensureColumn();
    ui.watchers = await api.watchers().catch(() => null);
    ui.ready = true;
  } catch (e) {
    ui.fatal = errorText(e);
    return;
  }

  if (feat.haUi) applyHeaderHiding();
  const cardId = takeDeepLink();
  if (cardId) ui.sheet = { type: 'card', id: cardId };
  reportPanelPath();
  startSync(
    (info) => void refresh(info),
    (online) => (ui.online = online),
  );
}

// ---------- Home Assistant: Link zur Karte, Panel-Pfad, Zurück zum Dashboard ----------

/** Aus dem Push: ?card=<id> in der Adresse von Home Assistant (außerhalb des iframes). */
function takeDeepLink(): string | null {
  try {
    const url = new URL(window.parent.location.href);
    const id = url.searchParams.get('card');
    if (id) {
      url.searchParams.delete('card');
      window.parent.history.replaceState(null, '', url.toString());
    }
    return id;
  } catch {
    return null;
  }
}

/** Meldet dem Server den Pfad des Panels, damit Push-Nachrichten die App öffnen können. */
function reportPanelPath(): void {
  try {
    if (window.parent === window) return;
    const path = window.parent.location.pathname;
    if (ui.settings && ui.settings.panelPath !== path) void api.saveSettings({ panelPath: path });
  } catch {
    /* kein Zugriff auf das übergeordnete Fenster */
  }
}

export function goToDashboard(): void {
  const path = ui.settings?.effectiveDashboardPath ?? '/';
  try {
    if (window.parent === window) {
      toast(t('Zurück zum Dashboard geht nur innerhalb von Home Assistant'));
      return;
    }
    window.parent.history.pushState(null, '', path);
    window.parent.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  } catch {
    try {
      window.top!.location.assign(path);
    } catch {
      toast(t('Das Dashboard konnte nicht geöffnet werden'), { tone: 'error' });
    }
  }
}

// ---------- Auswahl und Ansicht ----------

export async function selectBoard(id: string): Promise<void> {
  ui.boardId = id;
  ui.columnId = null;
  ui.filter.categoryIds = [];
  ui.sheet = null;
  memo.set('stups.board', id);
  await refresh();
}

export function selectColumn(id: string): void {
  ui.columnId = id;
  memo.set('stups.column', id);
}

/** Gemerkte Ansicht und gemerkter Filter von diesem Gerät (nur bekannte Boards und Personen bleiben im Filter) */
function restoreView(): void {
  // Start auf Heute; gemerkt werden nur Boards und Kalender (siehe startTab)
  ui.tab = startTab(memo.get('stups.tab'), visibleTabs({ watchers: feat.watchers, isChild: ui.isChild }));
  try {
    const raw = JSON.parse(memo.get('stups.schedule') ?? 'null') as Partial<ScheduleFilter> | null;
    if (!raw) return;
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    ui.sf = {
      personIds: ids(raw.personIds).filter((id) => ui.people.some((p) => p.id === id)),
      unassigned: raw.unassigned === true,
      boardIds: ids(raw.boardIds).filter((id) => ui.boards.some((b) => b.id === id)),
      showDone: raw.showDone === true,
    };
  } catch {
    /* kaputter Merkzettel: Standardfilter */
  }
}


export function selectTab(tab: Tab): void {
  ui.tab = tab;
  ui.sheet = null;
  memo.set('stups.tab', tab);
}

/** Ändert den Filter von Agenda und Kalender und merkt ihn sich auf diesem Gerät */
export function setScheduleFilter(patch: Partial<ScheduleFilter>): void {
  ui.sf = { ...ui.sf, ...patch };
  memo.set('stups.schedule', JSON.stringify(ui.sf));
}

/** Öffnet eine Karte aus Agenda oder Kalender, auch wenn sie in einem anderen Board liegt */
export async function openCardAnywhere(card: { id: string; boardId: string }): Promise<void> {
  if (card.boardId !== ui.boardId) await selectBoard(card.boardId);
  ui.sheet = { type: 'card', id: card.id };
}

/** Lässt eine Karte kurz hüpfen: die Rückmeldung nach dem Stupsen */
export function hopCard(id: string): void {
  ui.hop = id;
  setTimeout(() => {
    if (ui.hop === id) ui.hop = null;
  }, 900);
}

export function openSheet(s: Sheet): void {
  ui.sheet = s;
}
/** Öffnet die Einstellungen, auf Wunsch gleich eine Unterseite */
export function openSettings(page?: SettingsPageId): void {
  ui.sheet = { type: 'settings', ...(page ? { page } : {}) };
}
export function closeSheet(): void {
  ui.sheet = null;
}
export const personById = (id: string) => ui.people.find((p) => p.id === id);

// ---------- Aktionen auf Karten ----------

export async function completeCard(card: Pick<Card, 'id'>): Promise<void> {
  const res = await act(() => api.complete(card.id));
  if (res?.awaitingConfirmation) {
    toast(t('Gemeldet: wartet auf Bestätigung'));
    return;
  }
  if (!res || !res.completionId) return;
  const id = res.completionId;
  const text = res.nextDueAt ? t('Erledigt · nächste Karte {when}', { when: formatDue(res.nextDueAt) }) : t('Erledigt');
  toast(text, { action: { label: t('Rückgängig'), run: () => void act(() => api.undo(id)) } });
}

/** Eine Karte vom Haus weitergeben: an die nächste Person der Rotation, oder sie bleibt bei mir, wenn gerade niemand sonst dran ist */
export async function passCard(card: Pick<Card, 'id' | 'title'>): Promise<void> {
  const res = await act(() => api.passCard(card.id));
  if (!res) return;
  if (res.to === null) toast(t('Gerade ist niemand sonst dran'));
  else toast(t('Weitergegeben an {name}', { name: personById(res.to)?.displayName ?? '?' }));
}

/** "Erst vorschlagen": die Karte übernehmen (wer zuerst tippt, bekommt sie) */
export async function claimCard(card: Pick<Card, 'id'>): Promise<void> {
  const res = await act(() => api.claimCard(card.id));
  if (res) toast(t('Übernommen'));
}

/** Ein Bestätiger sagt „Bestätigen" (die Karte ist erledigt, zählt aufs Kind) oder „Nochmal" (das Kind bekommt sie zurück) */
export async function answerConfirmation(card: Pick<Card, 'id' | 'title'>, answer: 'confirm' | 'reject'): Promise<void> {
  const res = await act(async (): Promise<boolean> => {
    if (answer === 'confirm') await api.confirmCard(card.id);
    else await api.rejectCard(card.id);
    return true;
  });
  if (!res) return;
  toast(answer === 'confirm' ? t('Bestätigt') : t('Zurückgegeben: {title}', { title: card.title }));
}

export async function moveCard(card: Card, columnId: string, afterId?: string | null): Promise<void> {
  const columns = ui.view?.columns ?? [];
  const from = columns.find((c) => c.id === card.columnId);
  const wanted = columns.find((c) => c.id === columnId);
  const res = await act(() => api.moveCard(card.id, columnId, afterId));
  if (!res) return;

  const completedNow = res.completedAt && !card.completedAt;
  const completion = res.history[0];
  if (completedNow && completion) {
    // Bei einer Wiederholung liegt die neue Karte inzwischen im geladenen Board
    const next = card.recurrence ? ui.view?.cards.find((c) => c.repeatedFrom === card.id) : undefined;
    const text = next?.dueAt ? t('Erledigt · nächste Karte {when}', { when: formatDue(next.dueAt) }) : t('Erledigt');
    toast(text, { action: { label: t('Rückgängig'), run: () => void act(() => api.undo(completion.id)) } });
    return;
  }

  const landed = columns.find((c) => c.id === res.columnId);
  if (wanted && landed && landed.id !== wanted.id) {
    // Der Server hat die Karte in die passende Spalte gelegt: „Geplant" gibt es nur für Termine nach heute
    toast(
      wanted.isPlanned
        ? t('Nach „Geplant" kommen nur Karten mit einem Termin nach heute.')
        : t('„{title}" hat einen Termin nach heute und wartet deshalb in „{column}".', { title: res.title, column: landed.name }),
    );
    return;
  }
  if (landed && from && landed.id !== from.id) {
    toast(t('„{title}“ → {column}', { title: res.title, column: landed.name }), {
      action: { label: t('Rückgängig'), run: () => void act(() => api.moveCard(card.id, from.id)) },
    });
  }
}

/** Wischen: eine Karte in den nächsten (rechts) oder vorigen (links) Status, „Geplant" wird übersprungen */
export async function swipeCard(card: Card, dir: 'left' | 'right'): Promise<void> {
  const target = swipeTarget(ui.view?.columns ?? [], card.columnId, dir);
  if (target) await moveCard(card, target.id, null);
}

export function openViewer(items: Attachment[], index: number): void {
  ui.viewer = { items, index };
}
export function closeViewer(): void {
  ui.viewer = null;
}

/** Fragt vor dem Löschen nach; gelöscht wird erst nach „Löschen" */
export function removeCard(card: Card): void {
  ui.confirm = {
    title: t('Karte löschen?'),
    text: t('„{title}“ kommt in den Papierkorb und lässt sich von dort wiederherstellen.', { title: card.title }),
    label: t('Löschen'),
    run: async () => {
      const r = await actResult(() => api.deleteCard(card.id));
      if (!r.ok) return; // der Fehler steht schon als Hinweis da; die Karte bleibt offen
      closeSheet();
      toast(t('Karte gelöscht'), { action: { label: t('Rückgängig'), run: () => void act(() => api.restore('card', card.id)) } });
    },
  };
}
