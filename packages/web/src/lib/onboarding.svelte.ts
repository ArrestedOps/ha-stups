import { api, ApiError, type AccessInfo, type User } from './api';
import { cardTitleWithEntity } from './cardTitle';
import { formatDue } from './datetime';
import { t } from './i18n/index.svelte';
import {
  assigneeIds,
  buildCandidates,
  defaultSelection,
  effectiveDevices,
  matchDevices,
  nextOpenStep,
  stepsFor,
  toggleDevice,
  toggleSelection,
  type Candidate,
  type Step,
} from './onboarding';
import { can, feat, refresh, toast, ui } from './store.svelte';
import type { SavedWatcher } from './watcher-types';

/**
 * Einrichtung beim ersten Start (docs/onboarding/README.md): der Zustand und die Aufrufe hinter Onboarding.svelte.
 * Alles, was sich ohne Oberfläche entscheiden lässt, steht in onboarding.ts (mit Tests). Der Fortschritt (Schritt und Auswahl) liegt auf dem
 * Server, pro Person: Ein Abbruch auf dem Handy lässt sich am Desktop weiterführen. Der Wächter selbst entsteht im Assistenten (Handy) bzw.
 * im Editor (Desktop) der App, unverändert (OnboardingWatcher.svelte); hier steht nur, was danach zählt.
 */

export type TestState = 'idle' | 'sending' | 'sent' | 'failed';

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
  /** Handys von Hand gewählt, je Person (Schlüssel wie bei `selected`); fehlt ein Eintrag, gilt, was erkannt wurde */
  devices: {} as Record<string, string[]>,
  /** „Mich auch hinzufügen": der Administrator ist sonst keine Person und kommt nirgends vor */
  includeSelf: false,
  /** Ids der Personen in Stups, nachdem sie gespeichert sind (für den Assistenten und für Wiederaufnahme) */
  personIds: [] as string[],
  childIds: [] as string[],
  peopleNames: [] as string[],
  peopleDone: false,
  // --- Wächter ---
  watcherNames: [] as string[],
  watcherCards: [] as string[],
  watchersDone: false,
  // --- Test ---
  /** Die Person, an deren Handy die Testnachricht geht (der Administrator ist keine Person und wählt) */
  testTo: null as string | null,
  test: 'idle' as TestState,
  testDone: false,
});

/** Welche Schritte es für diese Person gibt */
export const stepsNow = (): Step[] =>
  stepsFor({ isAdmin: ui.isAdmin && !ui.isChild, isChild: ui.isChild }, { people: feat.ha, watcher: feat.watchers && feat.ha && can('watchers') });

// ---------- Anfang, Weiter, Zurück ----------

/** Beim Öffnen: zum gemerkten Schritt springen und die Auswahl wiederherstellen */
export function begin(): void {
  const progress = ui.onboarding.progress;
  const sel = (progress?.selection ?? {}) as Record<string, unknown>;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  Object.assign(ob, { busy: false, info: null, candidates: [], selected: [], children: [], devices: {}, testTo: null });
  ob.includeSelf = sel.includeSelf === true || ui.me?.isPerson === true;
  ob.personIds = list(sel.personIds);
  ob.childIds = list(sel.childIds);
  ob.peopleNames = list(sel.peopleNames);
  ob.peopleDone = sel.peopleDone === true;
  ob.watcherNames = list(sel.watcherNames);
  ob.watcherCards = list(sel.watcherCards);
  ob.watchersDone = sel.watchersDone === true;
  ob.testDone = sel.testDone === true;
  ob.test = ob.testDone ? 'sent' : 'idle';
  ob.step = nextOpenStep(stepsNow(), progress?.step);
}

function snapshot(): Record<string, unknown> {
  return {
    includeSelf: ob.includeSelf,
    personIds: ob.personIds,
    childIds: ob.childIds,
    peopleNames: ob.peopleNames,
    peopleDone: ob.peopleDone,
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
  const to = steps[steps.indexOf(ob.step) + 1];
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
      ob.selected = ob.candidates.filter((c) => c.personId && chosen.has(c.personId)).map((c) => c.key);
      ob.children = ob.candidates.filter((c) => c.personId && ob.childIds.includes(c.personId)).map((c) => c.key);
    } else {
      ob.selected = defaultSelection(ob.candidates, ob.includeSelf);
      ob.children = ob.candidates.filter((c) => !c.self && c.isChild).map((c) => c.key);
    }
  } catch (e) {
    toast(e instanceof ApiError ? e.message : t('Keine Verbindung zu Home Assistant'), { tone: 'error' });
  }
  ob.loadingPeople = false;
}

export const togglePerson = (key: string): void => {
  ob.selected = toggleSelection(ob.selected, key, ob.candidates);
  ob.children = ob.children.filter((k) => ob.selected.includes(k));
};

/** Ein Gerät für eine Person an- oder abwählen (Handy von Hand wählen) */
export function toggleCandidateDevice(c: Candidate, service: string): void {
  ob.devices = { ...ob.devices, [c.key]: toggleDevice(effectiveDevices(c, ob.devices), service) };
}

export function toggleChild(key: string): void {
  ob.children = ob.children.includes(key) ? ob.children.filter((k) => k !== key) : [...ob.children, key];
}

/** „Mich auch hinzufügen": der Administrator wird eine Person und steht dann in der Liste und bei den Zuständigen */
export function toggleSelf(on: boolean): void {
  ob.includeSelf = on;
  const rest = ob.selected.filter((k) => k !== 'self');
  ob.selected = on ? ob.candidates.map((c) => c.key).filter((k) => k === 'self' || rest.includes(k)) : rest;
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
      // Neue Geräte (erkannt oder gewählt) eintragen; bei einer bestehenden Person nur, wenn sie von Hand geändert wurden
      const devices = effectiveDevices(c, ob.devices);
      const changed = c.deviceNew || (ob.devices[c.key] !== undefined && (devices.length !== c.devices.length || devices.some((d) => !c.devices.includes(d))));
      if (changed && devices.length > 0) patch.notifyServices = devices;
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

/** Wer im Assistenten bei „Wer kommt infrage?" vorgewählt ist: die Personen aus dem ersten Schritt, ohne Kinder */
export function assignees(): string[] {
  const pool = ob.personIds.length > 0 ? ob.personIds : ui.people.filter((p) => p.isPerson).map((p) => p.id);
  return assigneeIds(pool, ob.childIds);
}

/** Der Wächter ist im Assistenten bzw. Editor der App gespeichert: merken, was danach zählt (Test, Fertig) */
export function watcherSaved(saved: SavedWatcher): void {
  ob.watcherNames = [...ob.watcherNames, saved.name];
  // der Titel, den die echte Karte (und ihre Nachricht) bekommt: mit dem Namen des Geräts, wie die Vorschau im Editor ihn zeigt
  ob.watcherCards = [...ob.watcherCards, cardTitleWithEntity(saved.card.title, saved.trigger.kind, saved.entityName ?? saved.trigger.entityId)];
  ob.watchersDone = true;
}

// ---------- Testnachricht ----------

/** Hat die Person ein Handy (Gerät der Companion App oder ntfy-Thema)? */
export const hasPhone = (u: Pick<User, 'notifyServices' | 'ntfy'> | null = ui.me): boolean => !!u && (u.notifyServices.length > 0 || u.ntfy);

/** Wer eine Testnachricht bekommen kann: Personen mit Handy, dazu der Administrator selbst, wenn er sein Handy eingetragen hat (er ist keine Person) */
export const testRecipients = (): User[] => {
  const list = ui.people.filter((p) => p.isPerson && hasPhone(p));
  const me = ui.me;
  return me && !me.isPerson && hasPhone(me) && !list.some((p) => p.id === me.id) ? [...list, me] : list;
};

/** Der Eintrag des Administrators in der Liste der Erkannten (seine Geräte nach der Zuordnung von Home Assistant), auch bei Wiederaufnahme im Testschritt */
export async function ownCandidate(): Promise<Candidate | null> {
  if (ob.candidates.length === 0) await loadPeople();
  return ob.candidates.find((c) => c.self) ?? null;
}

/** Das eigene Handy des Administrators eintragen (seine Zeile, ohne dass er eine Person wird) und als Empfänger wählen */
export async function connectAdminPhone(c: Candidate): Promise<boolean> {
  const me = ui.me;
  const services = effectiveDevices(c, ob.devices);
  if (!me || services.length === 0 || ob.busy) return false;
  ob.busy = true;
  try {
    const saved = await api.updatePerson(me.id, { notifyServices: services });
    // der Administrator steht nicht in der Liste der Personen: seine Zeile kommt aus der Antwort
    ui.me = { ...me, notifyServices: saved.notifyServices };
    await refresh();
    ob.testTo = me.id;
    ob.test = 'idle';
    return true;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : t('Keine Verbindung zu Home Assistant'), { tone: 'error' });
    return false;
  } finally {
    ob.busy = false;
  }
}

/** Die Person, an die es geht: die gewählte, sonst die erste mit Handy */
export function testTarget(): User | null {
  const list = testRecipients();
  return list.find((p) => p.id === ob.testTo) ?? list[0] ?? null;
}

/** Titel und Text der Testnachricht: genau, was eine neue Karte eines Wächters auf dem Handy zeigt (der Server baut dieselbe Nachricht) */
export function previewTexts(): { title: string; body: string } {
  const due = formatDue(new Date(Date.now() + 30 * 60_000).toISOString());
  // in der Beta setzt der Server den Kanalnamen davor (Beta ·), die Vorschau zeigt es ebenso
  return { title: (feat.beta ? 'Beta · ' : '') + (ob.watcherCards[0] ?? t('Waschmaschine ausräumen')), body: t('Neue Karte für dich · fällig {due}', { due }) };
}

/** Für Mitglieder (Kurzfassung) geht sie an sie selbst, für den Administrator an die gewählte Person */
export async function sendTest(own = false): Promise<void> {
  if (ob.test === 'sending') return;
  const target = own ? ui.me : testTarget();
  if (!target) return;
  ob.test = 'sending';
  try {
    await api.testPushOwn({ kind: 'onboarding', ...(ob.watcherCards[0] ? { cardTitle: ob.watcherCards[0] } : {}), ...(own || target.id === ui.me?.id ? {} : { personId: target.id }) });
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

