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
import { passkeysSupported } from './passkeys';
import { DEFAULT_FILTER, type ScheduleFilter } from './schedule';
import { swipeTarget } from './swipe';
import { startSync } from './sync';

export type Sheet =
  | null
  | { type: 'card'; id: string }
  | { type: 'cardMenu'; id: string }
  | { type: 'new'; columnId: string; dueAt?: string }
  | { type: 'slot'; at: string }
  | { type: 'boards' }
  | { type: 'boardSettings' }
  | { type: 'settings' }
  | { type: 'people' }
  | { type: 'watcher'; id: string | null; template?: string }
  | { type: 'nudge'; id: string }
  | { type: 'trash' }
  | { type: 'archive' };

export type Tab = 'boards' | 'agenda' | 'calendar' | 'watchers';

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
  /** Ansicht unten in der Leiste: Boards, Agenda (Liste der Termine) oder Kalender */
  tab: 'boards' as Tab,
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

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Etwas ist schiefgelaufen');

/** Führt eine Aktion aus, lädt danach neu und meldet Fehler als Hinweis. */
export async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn();
    await refresh();
    return result;
  } catch (e) {
    toast(errorText(e), { tone: 'error' });
    await refresh();
    return undefined;
  }
}

// ---------- Laden ----------

let refreshing: Promise<void> | null = null;
let again = false;
let pendingRefresh = false;

export function refresh(): Promise<void> {
  if (ui.dragging) {
    pendingRefresh = true; // erst nach dem Loslassen, sonst springt die Karte unter dem Finger weg
    return Promise.resolve();
  }
  if (refreshing) {
    again = true;
    return refreshing;
  }
  refreshing = (async () => {
    do {
      again = false;
      await load();
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
    void refresh();
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
    if (!ui.boards.some((b) => b.id === ui.boardId)) {
      ui.boardId = ui.boards[0]?.id ?? null;
      ui.columnId = null;
    }
    ui.view = ui.boardId ? await api.board(ui.boardId) : null;
    ensureColumn();
    ui.watchers = await api.watchers().catch(() => ui.watchers);
    ui.rev += 1;
    ui.online = true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) ui.online = false;
    else if (e instanceof ApiError && e.status === 403) ui.allowed = false; // Zugriff wurde entzogen
    else toast(errorText(e), { tone: 'error' });
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
    ui.isAdmin = me.isAdmin;
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
    () => void refresh(),
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
      toast('Zurück zum Dashboard geht nur innerhalb von Home Assistant');
      return;
    }
    window.parent.history.pushState(null, '', path);
    window.parent.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  } catch {
    try {
      window.top!.location.assign(path);
    } catch {
      toast('Das Dashboard konnte nicht geöffnet werden', { tone: 'error' });
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

const TABS: Tab[] = ['boards', 'agenda', 'calendar', 'watchers'];

/** Gemerkte Ansicht und gemerkter Filter von diesem Gerät (nur bekannte Boards und Personen bleiben im Filter) */
function restoreView(): void {
  const tab = memo.get('stups.tab') as Tab | null;
  if (tab && TABS.includes(tab) && (tab !== 'watchers' || feat.watchers)) ui.tab = tab;
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
export function closeSheet(): void {
  ui.sheet = null;
}
export const personById = (id: string) => ui.people.find((p) => p.id === id);

// ---------- Aktionen auf Karten ----------

export async function completeCard(card: Card): Promise<void> {
  const res = await act(() => api.complete(card.id));
  if (!res || !res.completionId) return;
  const id = res.completionId;
  const text = res.nextDueAt ? `Erledigt · nächste Karte ${formatDue(res.nextDueAt)}` : 'Erledigt';
  toast(text, { action: { label: 'Rückgängig', run: () => void act(() => api.undo(id)) } });
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
    const text = next?.dueAt ? `Erledigt · nächste Karte ${formatDue(next.dueAt)}` : 'Erledigt';
    toast(text, { action: { label: 'Rückgängig', run: () => void act(() => api.undo(completion.id)) } });
    return;
  }

  const landed = columns.find((c) => c.id === res.columnId);
  if (wanted && landed && landed.id !== wanted.id) {
    // Der Server hat die Karte in die passende Spalte gelegt: „Geplant" gibt es nur für Termine nach heute
    toast(
      wanted.isPlanned
        ? 'Nach „Geplant" kommen nur Karten mit einem Termin nach heute.'
        : `„${res.title}" hat einen Termin nach heute und wartet deshalb in „${landed.name}".`,
    );
    return;
  }
  if (landed && from && landed.id !== from.id) {
    toast(`„${res.title}“ → ${landed.name}`, {
      action: { label: 'Rückgängig', run: () => void act(() => api.moveCard(card.id, from.id)) },
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
    title: 'Karte löschen?',
    text: `„${card.title}“ kommt in den Papierkorb und lässt sich von dort wiederherstellen.`,
    label: 'Löschen',
    run: async () => {
      await act(() => api.deleteCard(card.id));
      closeSheet();
      toast('Karte gelöscht', { action: { label: 'Rückgängig', run: () => void act(() => api.restore('card', card.id)) } });
    },
  };
}
