import { api, ApiError, type AccessInfo, type User } from './api';
import { t } from './i18n/index.svelte';
import {
  buildCandidates,
  defaultSelection,
  matchDevices,
  nextOpenStep,
  rankHits,
  stepsFor,
  toggleSelection,
  type Candidate,
  type Step,
} from './onboarding';
import { can, feat, refresh, toast, ui } from './store.svelte';
import type { DryRunResult, WatcherSuggestion, WatcherTemplate } from './watcher-types';
import { defaultColumnId, watcherFormFromHit, watcherInputFromHit } from './watcherFromHit';

/**
 * Einrichtung beim ersten Start (docs/onboarding/README.md): der Zustand und die Aufrufe hinter Onboarding.svelte.
 * Alles, was sich ohne Oberfläche entscheiden lässt, steht in onboarding.ts (mit Tests). Der Fortschritt (Schritt und Auswahl) liegt auf dem
 * Server, pro Person: Ein Abbruch auf dem Handy lässt sich am Desktop weiterführen.
 */

export type TestState = 'idle' | 'sending' | 'sent' | 'nopath' | 'failed';

export const ob = $state({
  step: 'welcome' as Step,
  /** ein Aufruf läuft: die Knöpfe sperren sich (nichts wird doppelt angelegt) */
  busy: false,
  // --- Personen ---
  loadingPeople: false,
  info: null as AccessInfo | null,
  candidates: [] as Candidate[],
  /** Schlüssel der gewählten Personen (siehe Candidate.key) */
  selected: [] as string[],
  /** Schlüssel der Personen mit der Rolle Kind */
  children: [] as string[],
  /** Ids der Personen in Stups, nachdem sie gespeichert sind (für den Wächter und für Wiederaufnahme) */
  personIds: [] as string[],
  childIds: [] as string[],
  peopleNames: [] as string[],
  peopleDone: false,
  // --- Wächter ---
  loadingHits: false,
  hits: null as WatcherSuggestion[] | null,
  hitsError: false,
  templates: [] as WatcherTemplate[],
  /** Kennungen der Entitäten, deren Wächter eingeschaltet werden */
  on: [] as string[],
  dry: null as DryRunResult | null,
  watcherNames: [] as string[],
  watcherCards: [] as string[],
  created: [] as string[],
  watchersDone: false,
  // --- Test ---
  test: 'idle' as TestState,
  testDone: false,
  // --- Fertig ---
  quickTitle: '',
});

/** Welche Schritte es für diese Person gibt */
export const stepsNow = (): Step[] =>
  stepsFor({ isAdmin: ui.isAdmin && !ui.isChild, isChild: ui.isChild }, { people: feat.ha, watcher: feat.watchers && feat.ha && can('watchers') });

const firstName = (u: { displayName: string } | null): string => u?.displayName.trim().split(/\s+/)[0] ?? '';

// ---------- Anfang, Weiter, Zurück ----------

/** Beim Öffnen: zum gemerkten Schritt springen und die Auswahl wiederherstellen */
export function begin(): void {
  const progress = ui.onboarding.progress;
  const sel = (progress?.selection ?? {}) as Record<string, unknown>;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  ob.personIds = list(sel.personIds);
  ob.childIds = list(sel.childIds);
  ob.peopleNames = list(sel.peopleNames);
  ob.peopleDone = sel.peopleDone === true;
  ob.on = list(sel.on);
  ob.created = list(sel.created);
  ob.watcherNames = list(sel.watcherNames);
  ob.watcherCards = list(sel.watcherCards);
  ob.watchersDone = sel.watchersDone === true;
  ob.testDone = sel.testDone === true;
  ob.test = ob.testDone ? 'sent' : 'idle';
  // Eine frühere Runde (Einstellungen › „Einrichtung nochmal durchgehen") hinterlässt nichts
  Object.assign(ob, { busy: false, info: null, candidates: [], selected: [], children: [], hits: null, hitsError: false, dry: null, quickTitle: '' });
  ob.step = nextOpenStep(stepsNow(), progress?.step);
}

function snapshot(): Record<string, unknown> {
  return {
    personIds: ob.personIds,
    childIds: ob.childIds,
    peopleNames: ob.peopleNames,
    peopleDone: ob.peopleDone,
    on: ob.on,
    created: ob.created,
    watcherNames: ob.watcherNames,
    watcherCards: ob.watcherCards,
    watchersDone: ob.watchersDone,
    testDone: ob.testDone,
  };
}

/** Zu einem Schritt wechseln und den Stand auf dem Server merken (ein Fehler dabei stört die Einrichtung nicht) */
export function go(step: Step): void {
  ob.step = step;
  ui.onboarding.progress = { step, selection: snapshot() };
  void api.saveOnboardingProgress(step, snapshot()).catch(() => undefined);
}

export function next(): void {
  const steps = stepsNow();
  const i = steps.indexOf(ob.step);
  const to = steps[i + 1];
  if (to) go(to);
}

export function back(): void {
  const steps = stepsNow();
  const to = steps[steps.indexOf(ob.step) - 1];
  if (to) go(to);
}

/** „Überspringen" im ersten Schritt: die App öffnet normal, die Einrichtung erscheint nicht mehr von selbst */
export async function skipAll(): Promise<void> {
  await close('skipped');
}

/** „Zu den Aufgaben" (oder Ende der Kurzfassung): Status fertig, der Reiter Aufgaben öffnet */
export async function finish(): Promise<void> {
  await close('done');
}

async function close(status: 'done' | 'skipped'): Promise<void> {
  if (ob.busy) return;
  ob.busy = true;
  try {
    await api.setOnboarding(status);
    ui.onboarding = { needs: false, progress: null };
    ui.tab = 'tasks';
    await refresh();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : t('Speichern fehlgeschlagen'), { tone: 'error' });
  }
  ob.busy = false;
}

/** Einstellungen › „Einrichtung nochmal durchgehen" */
export async function restart(): Promise<void> {
  try {
    await api.resetOnboarding();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : t('Speichern fehlgeschlagen'), { tone: 'error' });
    return;
  }
  ui.onboarding = { needs: true, progress: { step: 'welcome' } };
  ui.sheet = null;
}

// ---------- Personen ----------

/** Alle erkannten Personen laden und vorwählen; bei einer Wiederaufnahme sind die gewählten die gespeicherten */
export async function loadPeople(): Promise<void> {
  if (ob.loadingPeople) return;
  ob.loadingPeople = true;
  try {
    const info = await api.access();
    ob.info = info;
    const me = ui.me!;
    ob.candidates = buildCandidates({ me, people: info.people, haPersons: info.haPersons, services: info.services ?? [] });
    if (ob.personIds.length > 0) {
      const chosen = new Set(ob.personIds);
      ob.selected = ob.candidates.filter((c) => c.self || (c.personId && chosen.has(c.personId))).map((c) => c.key);
      ob.children = ob.candidates.filter((c) => c.personId && ob.childIds.includes(c.personId)).map((c) => c.key);
    } else {
      ob.selected = defaultSelection(ob.candidates);
      ob.children = ob.candidates.filter((c) => c.isChild).map((c) => c.key);
    }
  } catch (e) {
    toast(e instanceof ApiError ? e.message : t('Keine Verbindung zu Home Assistant'), { tone: 'error' });
  }
  ob.loadingPeople = false;
}

export const togglePerson = (key: string): void => {
  ob.selected = toggleSelection(ob.selected, key, ob.candidates);
};

export function toggleChild(key: string): void {
  ob.children = ob.children.includes(key) ? ob.children.filter((k) => k !== key) : [...ob.children, key];
}

/** Gespeichert wird erst beim Weiter: ein Aufruf je neue Person, ein weiterer für Handy und Rolle (bestehende Personen werden nicht doppelt angelegt) */
export async function savePeople(): Promise<boolean> {
  if (ob.busy) return false;
  ob.busy = true;
  try {
    const ids: Record<string, string> = {};
    const names: string[] = [];
    for (const c of ob.candidates.filter((x) => ob.selected.includes(x.key))) {
      const person = c.personId ? null : await api.addPerson({ name: c.name, haUserId: c.haUserId });
      const id = c.personId ?? person!.id;
      ids[c.key] = id;
      names.push(c.name);
      const patch: Parameters<typeof api.updatePerson>[1] = {};
      if (c.deviceNew && c.device) patch.notifyServices = [c.device];
      const child = !c.self && ob.children.includes(c.key);
      if (child !== c.isChild) patch.isChild = child;
      if (Object.keys(patch).length > 0) await api.updatePerson(id, patch);
    }
    ob.personIds = Object.values(ids);
    ob.childIds = ob.candidates.filter((c) => ids[c.key] && ob.children.includes(c.key) && !c.self).map((c) => ids[c.key]!);
    ob.peopleNames = names;
    ob.peopleDone = true;
    await refresh();
    ob.busy = false;
    return true;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : t('Speichern fehlgeschlagen'), { tone: 'error' });
    ob.busy = false;
    await loadPeople(); // was schon angelegt ist, steht jetzt als bestehende Person da: ein zweiter Versuch legt nichts doppelt an
    return false;
  }
}

// ---------- Wächter ----------

const householdBoard = () => ui.boards.find((b) => b.visibility === 'all') ?? ui.boards[0] ?? null;

/** Die Treffer laden und den Probelauf für den besten rechnen */
export async function loadHits(): Promise<void> {
  if (ob.loadingHits) return;
  ob.loadingHits = true;
  ob.hitsError = false;
  try {
    ob.templates = (await api.watcherTemplates().catch(() => [])).filter((x) => x.kind === 'watcher');
    const r = await api.watcherSuggestions();
    ob.hits = r.items;
    const { best, others } = rankHits(r.items);
    if (best && ob.on.length === 0) ob.on = [best, ...others].map((h) => h.entityId);
    ob.dry = null;
    if (best) void dryRunFor(best);
  } catch {
    // Keine Verbindung zu Home Assistant oder nichts gefunden: freundlicher Leerzustand, Weiter bleibt möglich
    ob.hits = [];
    ob.hitsError = true;
  }
  ob.loadingHits = false;
}

const templateOf = (h: WatcherSuggestion): WatcherTemplate | undefined => ob.templates.find((x) => x.id === h.templateId);

async function dryRunFor(h: WatcherSuggestion): Promise<void> {
  const board = householdBoard();
  const template = templateOf(h);
  if (!board || !template) return;
  try {
    // Für den Probelauf zählt nur die Regel (Auslöser und Wartezeit); die Spalte der Karte spielt dabei keine Rolle
    const input = watcherInputFromHit({ template, hit: h, boardId: board.id, columnId: 'probelauf', personIds: [] });
    if (!['state', 'above', 'below'].includes(input.trigger.kind)) return;
    const res = await api.dryRun({ trigger: input.trigger, cooldownMin: input.cooldownMin });
    // Nur mit Verlauf; ohne Verlauf bleibt die Zeile weg (nie eine Zahl behaupten, die es nicht gibt)
    ob.dry = res.noHistory ? null : res;
  } catch {
    ob.dry = null;
  }
}

export function toggleHit(entityId: string): void {
  ob.on = ob.on.includes(entityId) ? ob.on.filter((x) => x !== entityId) : [...ob.on, entityId];
}

/** Wer die Wächter bekommt: die gewählten Personen, ohne Kinder (gibt es nur Kinder, dann diese) */
export function assignees(): string[] {
  const pool = ob.personIds.length > 0 ? ob.personIds : ui.people.filter((p) => p.isPerson).map((p) => p.id);
  const adults = pool.filter((id) => !ob.childIds.includes(id));
  return adults.length > 0 ? adults : pool;
}

/** Die gewählten Wächter anlegen. Ein Tipp: Vorlagen-Voreinstellungen, keine Rückfrage (auch nicht bei „Bedingung schon erfüllt"). */
export async function enableWatchers(): Promise<boolean> {
  if (ob.busy) return false;
  const board = householdBoard();
  if (!board || !ob.hits) return false;
  ob.busy = true;
  try {
    const { best, others } = rankHits(ob.hits);
    const wanted = [best, ...others].filter((h): h is WatcherSuggestion => !!h && ob.on.includes(h.entityId) && !ob.created.includes(h.entityId));
    const view = await api.board(board.id);
    const columnId = defaultColumnId(view.columns);
    for (const h of wanted) {
      const template = templateOf(h);
      if (!template) continue;
      const saved = await api.createWatcher(watcherInputFromHit({ template, hit: h, boardId: board.id, columnId, personIds: assignees() }));
      ob.created = [...ob.created, h.entityId];
      ob.watcherNames = [...ob.watcherNames, saved.name];
      ob.watcherCards = [...ob.watcherCards, saved.card.title];
    }
    ob.watchersDone = ob.created.length > 0;
    ui.watchers = await api.watchers().catch(() => ui.watchers);
    ob.busy = false;
    return true;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('Speichern fehlgeschlagen'), { tone: 'error' });
    ob.busy = false;
    return false;
  }
}

// ---------- Testnachricht ----------

/** Hat die Person ein Handy (Gerät der Companion App oder ntfy-Thema)? */
export const hasPhone = (u: Pick<User, 'notifyServices' | 'ntfy'> | null = ui.me): boolean => !!u && (u.notifyServices.length > 0 || u.ntfy);

/** Der Wächter, der gerade den Ton angibt: der erste angelegte, sonst der beste Treffer, solange er eingeschaltet ist */
function leadingWatcher(): { title: string; card: string } | null {
  if (ob.watcherNames[0] && ob.watcherCards[0]) return { title: ob.watcherNames[0], card: ob.watcherCards[0] };
  const best = rankHits(ob.hits ?? []).best;
  const board = householdBoard();
  const template = best ? templateOf(best) : undefined;
  if (!best || !template || !board || !ob.on.includes(best.entityId)) return null;
  const form = watcherFormFromHit({ template, hit: best, boardId: board.id, columnId: 'vorschau', personIds: [] });
  return { title: form.name, card: form.title };
}

/** Titel und Text der Vorschau (und der gesendeten Nachricht): der gewählte Wächter, sonst das Beispiel Waschmaschine */
export function previewTexts(): { title: string; body: string } {
  const name = firstName(ui.me);
  const w = leadingWatcher();
  if (w) return { title: w.title, body: `${name}, ${w.card}` };
  return { title: t('Waschmaschine fertig'), body: t('{name}, die Waschmaschine ist fertig. Ausräumen?', { name }) };
}

export async function sendTest(): Promise<void> {
  if (ob.test === 'sending') return;
  if (!hasPhone()) {
    ob.test = 'nopath';
    return;
  }
  ob.test = 'sending';
  try {
    const m = previewTexts();
    await api.testPushOwn({ kind: 'onboarding', title: m.title, body: m.body });
    ob.test = 'sent';
    ob.testDone = true;
  } catch {
    ob.test = 'failed';
  }
}

/** Das eigene Handy automatisch eintragen, wenn genau eins zum Namen passt (Kurzfassung für Mitglieder) */
export async function connectOwnPhone(): Promise<void> {
  const me = ui.me;
  if (!me || hasPhone(me)) return;
  try {
    const info = await api.access();
    const found = matchDevices(me.displayName, info.services ?? []);
    if (found.length === 1) {
      await api.updatePerson(me.id, { notifyServices: [found[0]!] });
      await refresh();
    }
  } catch {
    // ohne Eintrag bleibt es bei der Anleitung
  }
}
