import { applyTemplate, emptyForm, formProblem, toInput, type WatcherForm } from './watchers';
import type { WatcherInput, WatcherSuggestion, WatcherTemplate } from './watcher-types';

interface HitOptions {
  template: WatcherTemplate;
  hit: WatcherSuggestion;
  boardId: string;
  columnId: string;
  personIds: string[];
}

/**
 * Aus einem Treffer von „Gefunden“ das Formular des Wächters, so wie der Assistent es vorbelegt (Vorlage und Treffer über
 * `applyTemplate`), nur ohne Rückfragen: Zuständige sind „wer zu Hause ist, reihum" unter den übergebenen Personen, die Fairness-Zählung
 * richtet sich nach dem Board. Genutzt vom Onboarding; der Assistent (watcher-editor.svelte.ts) lässt dieselbe Vorbelegung von Hand ändern.
 */
export function watcherFormFromHit(opts: HitOptions): WatcherForm {
  const { template, hit, boardId, columnId, personIds } = opts;
  const form = applyTemplate(emptyForm(boardId, columnId), template, {
    entityId: hit.entityId,
    name: hit.name,
    ...(hit.unit ? { unit: hit.unit } : {}),
    ...(hit.draft ? { draft: hit.draft } : {}),
  });
  return personIds.length > 0 ? { ...form, assignMode: 'rotation_present', personIds, fallback: 'next' } : form;
}

/** Der fertige Wächter für den Server; eine unfertige Eingabe wirft die Meldung des Formulars, statt etwas Halbes zu speichern */
export function watcherInputFromHit(opts: HitOptions): WatcherInput {
  const form = watcherFormFromHit(opts);
  const problem = formProblem(form);
  if (problem) throw new Error(problem);
  return toInput(form);
}

/** Die Spalte, in die neue Karten kommen: die erste, die weder „erledigt" noch „geplant" ist */
export function defaultColumnId(columns: { id: string; isDone: boolean; isPlanned: boolean }[]): string {
  return (columns.find((c) => !c.isDone && !c.isPlanned) ?? columns[0])?.id ?? '';
}
