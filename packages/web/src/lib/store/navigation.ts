import { deviceTz } from '../datetime';
import { hiddenByPerson } from '../filters';
import { DEFAULT_FILTER, effectiveFilter, parseScheduleFilter, personFilterActive, type FilterContext, type ScheduleFilter } from '../schedule';
import type { SettingsPageId } from '../settingsPages';
import { startTab, type Tab } from '../tabs';
import { refresh } from './load';
import { memo } from './memo';
import { ui, type NewWatcherRequest, type Sheet } from './state.svelte';

// ---------- Auswahl und Ansicht ----------

export async function selectBoard(id: string): Promise<void> {
  ui.boardId = id;
  ui.columnId = null;
  ui.filter.categoryIds = [];
  ui.sheet = null;
  memo.set('stups.board', id);
  await refresh();
}

/** Wie `selectBoard`, lässt aber das offene Fenster stehen (Board-Einstellungen: ein anderes Board wählen, ohne zu schließen) */
export async function showBoard(id: string): Promise<void> {
  if (ui.boardId === id) return;
  ui.boardId = id;
  ui.columnId = null;
  ui.filter.categoryIds = [];
  memo.set('stups.board', id);
  await refresh();
}

export function selectColumn(id: string): void {
  ui.columnId = id;
  memo.set('stups.column', id);
}

/** Gemerkte Ansicht und gemerkter Filter von diesem Gerät (nur bekannte Boards und Personen bleiben im Filter) */
export function restoreView(): void {
  // Start immer auf Aufgaben (siehe startTab)
  ui.tab = startTab();
  const stored = parseScheduleFilter(
    memo.get('stups.schedule'),
    { personIds: ui.people.map((p) => p.id), boardIds: ui.boards.map((b) => b.id) },
    { isChild: ui.isChild },
  );
  // Beim Start ist immer „Meine" gewählt (Aufgaben und Boards): zuerst sieht man, was für mich dran ist. Übrige gemerkte Filter bleiben.
  const mine = ui.me?.isPerson && !ui.isChild ? ui.me.id : null;
  ui.sf = mine ? { ...(stored ?? DEFAULT_FILTER), personIds: [mine], unassigned: false } : (stored ?? ui.sf);
  ui.filter.onlyMine = mine !== null;
}

/**
 * Eine neue Aufgabe soll man sehen: Verstecken sie die Personenfilter (Start mit „Meine"), wechselt die Ansicht für Boards und
 * Aufgaben auf „Alle", statt die Aufgabe unauffindbar zu lassen.
 */
export function revealNewCard(card: { assigneeIds: string[] }): void {
  if (hiddenByPerson(card.assigneeIds, ui.filter, ui.me?.id ?? null)) {
    ui.filter.onlyMine = false;
    ui.filter.personIds = [];
  }
  const sf = ui.sf;
  const hiddenInList = personFilterActive(sf) && !(card.assigneeIds.some((id) => sf.personIds.includes(id)) || (sf.unassigned && card.assigneeIds.length === 0));
  if (hiddenInList) setScheduleFilter({ personIds: [], unassigned: false });
}

/** Reiter Aufgaben als Liste oder als Kalender öffnen (die Leiste unten hat beides) */
export function goTasks(to: 'list' | 'calendar'): void {
  ui.tab = 'tasks';
  ui.sheet = null;
  ui.detailId = null;
  ui.query = '';
  ui.tasksGoto = to;
}

export function selectTab(tab: Tab): void {
  ui.tab = tab;
  ui.sheet = null;
  ui.detailId = null;
  ui.query = '';
}

/**
 * Wo eine Aufgabe aufgeht. Auf dem Desktop steht sie in Aufgaben in der Detailspalte rechts (die Liste bleibt sichtbar), überall sonst
 * (Boards, Kalender, Handy) als Sheet. Alle Wege, eine Aufgabe zu öffnen, laufen hierüber.
 */
export function openCard(id: string): void {
  if (ui.desktop && ui.tab === 'tasks' && !ui.tasksCalendar) {
    ui.sheet = null;
    ui.detailId = id;
  } else {
    ui.sheet = { type: 'card', id };
  }
}
export const closeDetail = (): void => void (ui.detailId = null);

/** Das Fenster wird breiter oder schmaler als 1024 px: eine offene Aufgabe wechselt zwischen Detailspalte und Sheet */
export function setDesktop(on: boolean): void {
  ui.desktop = on;
  if (!on && ui.detailId) {
    const id = ui.detailId;
    ui.detailId = null;
    ui.sheet = { type: 'card', id };
  } else if (on && ui.sheet?.type === 'card') {
    openCard(ui.sheet.id);
  }
}

/** Was das Filtern außer dem Filter braucht: ich, die Uhr (neu gerechnet bei jeder Änderung der Daten) und die Zeitzone des Geräts */
export function filterContext(): FilterContext {
  void ui.rev;
  return { meId: ui.me?.id ?? null, nowMs: Date.now(), tz: deviceTz() };
}

/** Der Filter von Aufgaben und Kalender, wie er für diese Rolle gilt (ein Kind: ohne „Wer" und „nur von Wächtern") */
export const activeScheduleFilter = (): ScheduleFilter => effectiveFilter(ui.sf, ui.isChild);

/** Ändert den Filter von Agenda und Kalender und merkt ihn sich auf diesem Gerät */
export function setScheduleFilter(patch: Partial<ScheduleFilter>): void {
  ui.sf = { ...ui.sf, ...patch };
  memo.set('stups.schedule', JSON.stringify(ui.sf));
}

/** Öffnet eine Aufgabe aus Agenda oder Kalender, auch wenn sie in einem anderen Board liegt */
export async function openCardAnywhere(card: { id: string; boardId: string }): Promise<void> {
  if (card.boardId !== ui.boardId) await selectBoard(card.boardId);
  openCard(card.id);
}

/** Öffnet das Aufgaben-Menü („…") einer Aufgabe aus Aufgaben, auch wenn sie in einem anderen Board liegt */
export async function openCardMenuAnywhere(card: { id: string; boardId: string }): Promise<void> {
  if (card.boardId !== ui.boardId) await selectBoard(card.boardId);
  ui.sheet = { type: 'cardMenu', id: card.id };
}

/** Lässt eine Aufgabe kurz hüpfen: die Rückmeldung nach dem Stupsen */
export function hopCard(id: string): void {
  ui.hop = id;
  setTimeout(() => {
    if (ui.hop === id) ui.hop = null;
  }, 900);
}

export function openSheet(s: Sheet): void {
  if (s?.type === 'card') openCard(s.id);
  else ui.sheet = s;
}
/**
 * „Neuer Wächter“ öffnen. Auf dem Desktop klappt im Reiter Wächter der Bereich über der Liste auf (die Ansicht liest `ui.newWatcher`),
 * auf dem Handy öffnet wie bisher der Assistent als Fenster; `from` sagt ihm, wohin „Zurück“ führt.
 */
export function openNewWatcher(init: NewWatcherRequest & { from?: 'settings' | 'found' } = {}): void {
  const { from, ...request } = init;
  if (ui.desktop) {
    ui.sheet = null;
    ui.detailId = null;
    ui.tab = 'watchers';
    ui.newWatcher = request;
  } else {
    ui.sheet = { type: 'watcher', id: null, ...(from ? { from } : {}), ...request };
  }
}
/** Öffnet die Einstellungen, auf Wunsch gleich eine Unterseite */
export function openSettings(page?: SettingsPageId): void {
  ui.sheet = { type: 'settings', ...(page ? { page } : {}) };
}
export function closeSheet(): void {
  ui.sheet = null;
}
export const personById = (id: string) => ui.people.find((p) => p.id === id);
