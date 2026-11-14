import { api } from '../api';
import type { Attachment, Card } from '../api';
import { formatDue } from '../datetime';
import { t, tn } from '../i18n/index.svelte';
import { DEFAULT_FILTER } from '../schedule';
import type { ShiftTarget } from '../statsSheets';
import { swipeTarget } from '../swipe';
import { shiftBatch, undoShifts, type ShiftBatch, type ShiftRecord } from '../undoShift';
import { act, actResult } from './load';
import { closeDetail, closeSheet, personById, setScheduleFilter } from './navigation';
import { ui } from './state.svelte';
import { toast } from './toasts';

// ---------- Aktionen auf Aufgaben ----------

export async function completeCard(card: Pick<Card, 'id'>): Promise<void> {
  const res = await act(() => api.complete(card.id));
  if (res?.awaitingConfirmation) {
    toast(t('Gemeldet: wartet auf Bestätigung'));
    return;
  }
  if (!res || !res.completionId) return;
  const id = res.completionId;
  const text = res.nextDueAt ? t('Erledigt · nächste Aufgabe {when}', { when: formatDue(res.nextDueAt) }) : t('Erledigt');
  toast(text, { action: { label: t('Rückgängig'), run: () => void act(() => api.undo(id)) } });
}

/**
 * „In der Liste filtern" in den Blättern „Heute fällig" und „Überfällig": schließt das Blatt und stellt den Filter der Liste auf
 * Wann = Heute (oder Überfällig) und Wer = Meine (ein Kind kennt „Wer" nicht, es sieht ohnehin nur die eigenen). Sonst gilt der Grundfilter.
 */
export function filterListFor(kind: 'today' | 'overdue'): void {
  const me = ui.me;
  setScheduleFilter({ ...DEFAULT_FILTER, when: [kind], personIds: me?.isPerson && !ui.isChild ? [me.id] : [] });
  closeSheet();
}

/**
 * Überfällige Aufgaben verschieben (Blatt „Überfällig"): Termin auf heute, morgen oder Samstag, Uhrzeit bleibt (shiftDue). Über die
 * gewöhnliche Aufgaben-Änderung; „Geplant" und zurück regelt der Server. Gemeldet wird nur, was wirklich verschoben wurde, mit „Rückgängig"
 * (stellt die alten Termine wieder her); schlägt es für alle fehl, gibt es nur die Fehlermeldung. Kinder ändern keine Aufgaben.
 */
export async function shiftCards(cards: { id: string; title: string; dueAt: string | null; version?: number }[], target: ShiftTarget): Promise<void> {
  if (ui.isChild) return;
  const items = cards.filter((c): c is { id: string; title: string; dueAt: string; version?: number } => !!c.dueAt);
  if (items.length === 0) return;
  let batch: ShiftBatch = { moved: [], failed: 0, first: null };
  const r = await actResult(async () => {
    batch = await shiftBatch(items, target, Date.now(), (id, patch) => api.updateCard(id, patch));
    if (batch.moved.length === 0) throw batch.first; // alles fehlgeschlagen: die Fehlermeldung kommt von actResult
  });
  if (!r.ok) return;
  const { moved, failed } = batch;
  const when = target === 'today' ? t('heute') : target === 'tomorrow' ? t('morgen') : t('Samstag');
  const text =
    moved.length === 1
      ? t('„{title}“ auf {when} verschoben', { title: moved[0]!.title, when })
      : tn('{n} Aufgabe auf {when} verschoben', '{n} Aufgaben auf {when} verschoben', moved.length).replace('{when}', when);
  toast(text, {
    action: {
      label: t('Rückgängig'),
      run: () => void undoShift(moved),
    },
  });
  if (failed > 0) toast(tn('{n} Aufgabe ließ sich nicht verschieben', '{n} Aufgaben ließen sich nicht verschieben', failed), { tone: 'error' });
}

/**
 * „Rückgängig" des Verschiebens: setzt nur zurück, was noch so dasteht, wie das Verschieben es hinterlassen hat (siehe undoShift.ts).
 * Was inzwischen jemand anderes geändert hat, bleibt; das wird gesagt, damit niemand einen verlorenen Termin vermutet.
 */
async function undoShift(moved: ShiftRecord[]): Promise<void> {
  const res = await act(() => undoShifts(moved, { card: (id) => api.card(id), update: (id, p) => api.updateCard(id, p) }));
  if (!res) return;
  if (res.conflicts.length > 0) {
    toast(
      res.conflicts.length === 1
        ? t('„{title}“ wurde inzwischen geändert und bleibt, wie sie ist', { title: res.conflicts[0]!.title })
        : tn('{n} Aufgabe wurde inzwischen geändert und bleibt, wie sie ist', '{n} Aufgaben wurden inzwischen geändert und bleiben, wie sie sind', res.conflicts.length),
    );
  }
  if (res.failed > 0) toast(tn('{n} Aufgabe ließ sich nicht zurücksetzen', '{n} Aufgaben ließen sich nicht zurücksetzen', res.failed), { tone: 'error' });
}

/** Eine heute erledigte Aufgabe wieder öffnen (Blatt „Heute erledigt"): macht die letzte Erledigung rückgängig, wie „Rückgängig" nach dem Abhaken */
export async function reopenCard(card: Pick<Card, 'id' | 'title'>): Promise<void> {
  const r = await actResult(async () => {
    const last = (await api.card(card.id)).history[0];
    if (!last) throw new Error('no completion');
    return api.undo(last.id);
  });
  if (r.ok) toast(t('„{title}“ ist wieder offen', { title: card.title }));
}

/** Eine Aufgabe vom Haus weitergeben: an die nächste Person der Rotation, oder sie bleibt bei mir, wenn gerade niemand sonst dran ist */
export async function passCard(card: Pick<Card, 'id' | 'title'>): Promise<void> {
  const res = await act(() => api.passCard(card.id));
  if (!res) return;
  if (res.to === null) toast(t('Gerade ist niemand sonst dran'));
  else toast(t('Weitergegeben an {name}', { name: personById(res.to)?.displayName ?? '?' }));
}

/** "Erst vorschlagen": die Aufgabe übernehmen (wer zuerst tippt, bekommt sie) */
export async function claimCard(card: Pick<Card, 'id'>): Promise<void> {
  const res = await act(() => api.claimCard(card.id));
  if (res) toast(t('Übernommen'));
}

/** Ein Bestätiger sagt „Bestätigen" (die Aufgabe ist erledigt, zählt aufs Kind) oder „Nochmal" (das Kind bekommt sie zurück) */
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
    // Bei einer Wiederholung liegt die neue Aufgabe inzwischen im geladenen Board
    const next = card.recurrence ? ui.view?.cards.find((c) => c.repeatedFrom === card.id) : undefined;
    const text = next?.dueAt ? t('Erledigt · nächste Aufgabe {when}', { when: formatDue(next.dueAt) }) : t('Erledigt');
    toast(text, { action: { label: t('Rückgängig'), run: () => void act(() => api.undo(completion.id)) } });
    return;
  }

  const landed = columns.find((c) => c.id === res.columnId);
  if (wanted && landed && landed.id !== wanted.id) {
    // Der Server hat die Aufgabe in die passende Spalte gelegt: „Geplant" gibt es nur für Termine nach heute
    toast(
      wanted.isPlanned
        ? t('Nach „Geplant" kommen nur Aufgaben mit einem Termin nach heute.')
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

/** Wischen: eine Aufgabe in den nächsten (rechts) oder vorigen (links) Status, „Geplant" wird übersprungen */
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

/**
 * Fragt vor dem Sammel-Vorschlag der Kategorien nach („Kategorien vorschlagen"): Wächter ohne Kategorie bekommen den Vorschlag von Stups,
 * vorhandene Kategorien bleiben immer. Das Ergebnis steht als Zahl da.
 */
export function askSuggestWatcherCategories(n: number): void {
  ui.confirm = {
    title: t('Kategorien vorschlagen?'),
    text: tn(
      '{n} Wächter hat noch keine Kategorie. Er bekommt den Vorschlag von Stups, zum Beispiel „Batterien“. Vorhandene Kategorien bleiben.',
      '{n} Wächter haben noch keine Kategorie. Sie bekommen den Vorschlag von Stups, zum Beispiel „Batterien“. Vorhandene Kategorien bleiben.',
      n,
    ),
    label: t('Vorschlagen'),
    run: async () => {
      try {
        const r = await api.suggestWatcherCategories();
        ui.watchers = await api.watchers().catch(() => ui.watchers);
        ui.rev += 1;
        toast(tn('{n} Kategorie gesetzt', '{n} Kategorien gesetzt', r.updated));
      } catch (e) {
        toast(e instanceof Error ? e.message : t('Kategorien vorschlagen fehlgeschlagen'), { tone: 'error' });
      }
    },
  };
}

/** Fragt vor dem Löschen nach; gelöscht wird erst nach „Löschen" */
export function removeCard(card: Card): void {
  ui.confirm = {
    title: t('Aufgabe löschen?'),
    text: t('„{title}“ kommt in den Papierkorb und lässt sich von dort wiederherstellen.', { title: card.title }),
    label: t('Löschen'),
    run: async () => {
      const r = await actResult(() => api.deleteCard(card.id));
      if (!r.ok) return; // der Fehler steht schon als Hinweis da; die Aufgabe bleibt offen
      closeSheet();
      if (ui.detailId === card.id) closeDetail();
      toast(t('Aufgabe gelöscht'), { action: { label: t('Rückgängig'), run: () => void act(() => api.restore('card', card.id)) } });
    },
  };
}
