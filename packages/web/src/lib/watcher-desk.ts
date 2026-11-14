import { t } from './i18n/index.svelte';
import type { HomeItem } from './api';
import type { AssignMode, WatcherSuggestion } from './watcher-types';
import { watcherLayout } from './watcherList';
import { formProblems, type WatcherForm } from './watchers';

/**
 * Reine Logik für das Formular „Neuer Wächter“ am Desktop (ein Bereich über der Liste statt vier Schritte): die vier Arten „Wer bekommt die
 * Aufgabe?“, Entwurf, automatischer Name, Vorschlags-Chips und die Zahlen über der Liste. Alles Weitere (Bedingung, Aufgabe, Speichern) kommt
 * aus `watchers.ts` und `watcher-flow.ts`, das Datenmodell ist dasselbe wie im Assistenten am Handy.
 */

// ---------- Wer bekommt die Aufgabe? ----------

/** Die vier Segmente; „Erst vorschlagen“ und „Niemand“ stehen als weitere Arten daneben */
export type DeskMode = 'fixed' | 'first_home' | 'rotation' | 'all_present';
export const DESK_MODES: DeskMode[] = ['fixed', 'first_home', 'rotation', 'all_present'];

/** Welches Segment gilt für die Art? „Fair im Wechsel“ gilt für reihum, mit und ohne „nur Anwesende“; sonst keins */
export function deskModeOf(mode: AssignMode): DeskMode | null {
  if (mode === 'rotation_present') return 'rotation';
  return (DESK_MODES as string[]).includes(mode) ? (mode as DeskMode) : null;
}

/** Ein Segment wählen: „Fair im Wechsel“ behält „nur Anwesende“; „Eine feste Person“ wählt `me` vor, solange niemand gewählt ist */
export function withDeskMode(f: WatcherForm, id: DeskMode, me: string | null = null): WatcherForm {
  if (id === 'rotation') return { ...f, assignMode: f.assignMode === 'rotation_present' ? 'rotation_present' : 'rotation' };
  if (id === 'fixed') return { ...f, assignMode: 'fixed', personIds: f.personIds.length === 0 && me ? [me] : f.personIds };
  return { ...f, assignMode: id };
}

/** Bei „Fair im Wechsel“: nur wer zu Hause ist (rotation_present) oder jede Person (rotation) */
export const presentOnly = (f: Pick<WatcherForm, 'assignMode'>): boolean => f.assignMode === 'rotation_present';
export const withPresentOnly = (f: WatcherForm, on: boolean): WatcherForm => ({ ...f, assignMode: on ? 'rotation_present' : 'rotation' });

// ---------- Bedingung ----------

/** Die drei Arten als Segment in der Zeile „Wert …“ (Reihenfolge wie im Entwurf: steigt über, fällt unter, ist) */
export function deskConditionItems(): { id: 'above' | 'below' | 'state'; label: string }[] {
  return [
    { id: 'above', label: t('steigt über') },
    { id: 'below', label: t('fällt unter') },
    { id: 'state', label: t('ist') },
  ];
}

// ---------- Entwurf, Name, Kategorie ----------

/** Hat der Mensch seit dem Aufklappen etwas geändert? `initial` ist der Stand, sobald alles geladen und vorbelegt ist (null: noch nicht) */
export const formDirty = (current: WatcherForm, initial: WatcherForm | null): boolean => initial !== null && JSON.stringify(current) !== JSON.stringify(initial);

/** Der Name, wenn das Feld leer bleibt: der der Vorlage (ohne Gerät), sonst der Name der Entität */
export const autoName = (f: Pick<WatcherForm, 'baseName' | 'entityName'>): string => f.baseName || f.entityName;

/** Das erste, was fehlt, in der Reihenfolge des Formulars: der Name (er füllt sich selbst) kommt zuletzt, sonst fehlte angeblich er, obwohl die Entität fehlt */
export function deskProblem(f: WatcherForm): string | null {
  const all = formProblems(f);
  return (all.find((p) => p.step !== 4) ?? all[0])?.text ?? null;
}

/** Die Kategorie stammt von Vorlage oder Entität (nicht vom Menschen): dann steht „vorgeschlagen“ dabei */
export const categorySuggested = (f: Pick<WatcherForm, 'category' | 'categorySource'>): boolean =>
  f.category.trim() !== '' && (f.categorySource === 'template' || f.categorySource === 'entity');

// ---------- Vorschläge („Gefunden“) als Chips ----------

export interface SuggestionChip {
  suggestion: WatcherSuggestion;
  label: string;
}

/** So viele Vorschläge stehen als Chips da, der Rest hinter „+N“ */
export const CHIP_MAX = 3;

export function suggestionChips(items: WatcherSuggestion[], max = CHIP_MAX): { chips: SuggestionChip[]; more: number } {
  return { chips: items.slice(0, max).map((s) => ({ suggestion: s, label: s.label || s.name })), more: Math.max(0, items.length - max) };
}

// ---------- Liste ----------

/** Die Zahlen links in der Leiste über der Liste: alle, aktuell (wartet, läuft, kommt bald) und ausgeschaltet */
export function listSummary(items: HomeItem[]): { total: number; current: number; off: number } {
  const l = watcherLayout(items);
  return { total: items.length, current: l.waiting.length + l.running.length + l.soon.length, off: items.filter((i) => !i.active).length };
}
