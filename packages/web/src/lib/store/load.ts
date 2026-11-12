import { api, ApiError } from '../api';
import { applyCards, deltaIds } from '../delta';
import type { SyncInfo } from '../sync';
import { applyRole, ui } from './state.svelte';
import { errorText, toast } from './toasts';

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

export function ensureColumn(): void {
  const cols = ui.view?.columns ?? [];
  if (!cols.some((c) => c.id === ui.columnId)) ui.columnId = cols[0]?.id ?? null;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;

/** Solange „offline" gilt, alle paar Sekunden neu laden (bis 15 s Abstand); Erfolg setzt `ui.online` zurück */
function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      void refresh().then(() => {
        if (ui.online) retryCount = 0;
        else retryCount++;
      });
    },
    Math.min(2000 * 2 ** retryCount, 15_000),
  );
}

async function load(): Promise<void> {
  try {
    // Die Personenliste gehört zur Ansicht: Änderungen von anderen Geräten (neue Person, Umbenennen) kommen so mit
    // Auch die eigene Rolle: ein Administrator kann Berechtigungen geben oder nehmen, dann ändern sich die Seiten und Knöpfe sofort
    const [boards, people, me] = await Promise.all([api.boards(), api.people(), api.me()]);
    ui.boards = boards;
    ui.people = people;
    applyRole(me);
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
    ui.archivedBoards = ui.isChild ? [] : await api.archivedBoards().catch(() => ui.archivedBoards);
    ui.rev += 1;
    ui.online = true;
    ui.allowed = true; // der Zugriff war entzogen und ist zurück: die Erklärung verschwindet ohne Neuladen
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      ui.online = false;
      scheduleRetry(); // Netz noch nicht da (z. B. gleich nach dem Aufwachen): von selbst weiter versuchen
    } else if (e instanceof ApiError && e.status === 403) ui.allowed = false; // Zugriff wurde entzogen
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

// ---------- Aktionen ----------

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
