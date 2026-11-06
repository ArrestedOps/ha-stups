import { conditionMet, type AssignMode, type WatchTrigger } from './watcher-types.js';
import type { Watcher } from './watcher-data.js';
import type { WatcherStatus } from './watcher-types.js';

/**
 * Der Reiter „Wächter" zeigt den Zustand der Wächter. Jeder Wächter ist in genau einer Phase (ein pausierter ist ruhig, es sei denn, seine
 * Karte ist noch offen):
 * - waiting: seine Karte ist offen, jemand muss etwas tun
 * - running: der Vorgang, auf dessen Ende er wartet, ist gerade im Gang (die Waschmaschine läuft)
 * - soon: bald dran (Zähler steht auf „2 von 3", der nächste Termin steht an)
 * - quiet: nichts zu melden
 */
export type HomePhase = 'waiting' | 'running' | 'soon' | 'quiet';

export interface SeenState {
  state: string;
  lastChanged: string | null;
  /** Einheit und Geräteklasse der Entität: daran erkennt Stups, ob sie einen Vorgang misst (Leistung) oder einen Pegel (Batterie) */
  unit?: string;
  deviceClass?: string;
}

/** Was Stups sich je Wächter merkt (im Speicher), um „läuft gerade" zu erkennen */
export interface PhaseMemory {
  /** seit wann der Vorgang läuft, soweit beobachtet */
  runningSince: string | null;
  /** bei `above`: die Bedingung war seit dem letzten Auslösen einmal erfüllt (der Wert war über der Schwelle) */
  touched: boolean;
  /** Stups hat seit dem Start schon einmal gesehen, dass nichts läuft: erst dann ist ein Beginn echt beobachtet, sonst bleibt er unbekannt */
  sawQuiet?: boolean;
}

export interface PhaseInput {
  watcher: Watcher;
  seen: SeenState | null;
  lastFireAt: string | null;
  counter: number;
  openCard: { id: string; createdAt: string } | null;
  memory: PhaseMemory;
  nextEvent: { title: string; at: string } | null;
  nowIso: string;
}

const PROCESS_CLASSES = new Set(['power', 'apparent_power', 'reactive_power', 'current', 'energy']);
const PROCESS_UNITS = new Set(['w', 'kw', 'va', 'a', 'ma', 'kwh', 'wh']);

/**
 * Misst die Entität einen Vorgang, der läuft und endet (Leistung einer Waschmaschine, Strom)? Dann heißt „über der Schwelle": läuft.
 * Batterie, Temperatur, Luftfeuchte, Füllstand und alles Unbekannte sind Pegel: ein Normalzustand, kein Vorgang. Im Zweifel nein.
 */
export function measuresProcess(seen: Pick<SeenState, 'unit' | 'deviceClass'> | null): boolean {
  if (!seen) return false;
  if (seen.deviceClass) return PROCESS_CLASSES.has(seen.deviceClass);
  return !!seen.unit && PROCESS_UNITS.has(seen.unit.trim().toLowerCase());
}

const LEVEL_CLASSES = new Set(['battery', 'temperature', 'humidity', 'moisture']);
const BATTERY_ID = /batter|akku/;

/**
 * Ist es ein Pegel, bei dem „schon unter der Schwelle" ein Befund ist (Batterie, Temperatur, Feuchte)? Dann löst der Wächter
 * auch aus, wenn die Bedingung beim Anlegen schon erfüllt ist. Im Zweifel nein: Ein Vorgang (Waschmaschine) oder etwas
 * Unbekanntes bleibt vorsichtig und wartet auf den nächsten Wechsel.
 */
export function measuresLevel(seen: Pick<SeenState, 'unit' | 'deviceClass'> | null, entityId: string): boolean {
  if (!seen) return false;
  if (seen.deviceClass) return LEVEL_CLASSES.has(seen.deviceClass);
  return seen.unit?.trim() === '%' && BATTERY_ID.test(entityId.toLowerCase());
}

const numeric = (state: string): boolean => state !== '' && state !== 'unknown' && state !== 'unavailable' && Number.isFinite(Number(state));

/**
 * Ist der Vorgang gerade im Gang?
 * below: der Wert liegt über dem Schwellwert (solange er nicht gefallen ist, läuft die Maschine);
 * above: darunter, aber zuletzt darüber gewesen; state: nicht im Zielzustand und seit dem letzten Auslösen verändert.
 */
export function isRunning(trigger: Pick<WatchTrigger, 'kind' | 'to' | 'value'>, seen: SeenState | null, lastFireAt: string | null, touched: boolean): boolean {
  if (!seen) return false;
  if (conditionMet(trigger, seen.state)) return false;
  if (trigger.kind === 'below') return measuresProcess(seen) && numeric(seen.state);
  if (trigger.kind === 'above') return measuresProcess(seen) && numeric(seen.state) && touched;
  if (trigger.kind === 'state') {
    if (!lastFireAt || !seen.lastChanged || seen.state === 'unknown' || seen.state === 'unavailable') return false;
    return Date.parse(seen.lastChanged) > Date.parse(lastFireAt);
  }
  return false;
}

export function phaseOf(input: PhaseInput): { phase: HomePhase; since: string | null } {
  const { watcher: w, seen, openCard, memory } = input;
  if (openCard) return { phase: 'waiting', since: openCard.createdAt };
  if (isRunning(w.trigger, seen, input.lastFireAt, memory.touched)) return { phase: 'running', since: memory.runningSince };
  if (w.trigger.count > 1 && input.counter > 0) return { phase: 'soon', since: null };
  if (input.nextEvent) return { phase: 'soon', since: null };
  return { phase: 'quiet', since: null };
}

export interface HomeItem {
  watcherId: string;
  name: string;
  /** Friendly Name der beobachteten Entität (ohne Namen die Entitäts-ID): steht in der Liste immer unter dem Namen */
  subject: string;
  /** Friendly Name der beobachteten Entität (ohne Namen: die Entitäts-ID), immer (für die Zeile bei „Ruhig") */
  entity: string;
  phase: HomePhase;
  since: string | null;
  progress: { n: number; of: number } | null;
  /** Aktueller Wert der Entität mit Einheit ("26 %"); null, wenn Home Assistant keinen Wert hat */
  value: string | null;
  /** Titel der Karte, die danach kommt */
  nextCard: string;
  /** Die Entität gibt es in Home Assistant nicht (mehr) */
  entityMissing: boolean;
  /** ok, entity_missing, target_missing (Board oder Spalte weg, pausiert) oder assignees_missing (keine Karten, braucht neue Zuständige) */
  status: WatcherStatus;
  openCard: { id: string; title: string; boardId: string; assigneeIds: string[]; createdAt: string } | null;
  nextEvent: { title: string; at: string } | null;
  /** Der Wächter ist eingeschaltet (aus: er löst nichts aus, bleibt aber in der Liste) */
  active: boolean;
  /** Kategorie zum Gruppieren (null = „Ohne Kategorie") */
  category: string | null;
  /** Die Bedingung: daraus baut die Oberfläche den kurzen Satz der Tabelle */
  trigger: WatchTrigger;
  /** Einheit der beobachteten Entität („W", „%"), null ohne */
  entityUnit: string | null;
  /** Wann der Wächter zuletzt eine Karte angelegt hat (null: noch nie) und für wen */
  lastFiredAt: string | null;
  lastAssigneeIds: string[];
  /** An wen die Karte geht: Art und feste Personen bzw. Kreis */
  assign: { mode: AssignMode; personIds: string[] };
}

export interface HomeState {
  /** Verbindung zu Home Assistant steht */
  available: boolean;
  /** Seit wann sie fehlt (null, solange sie steht) */
  lostSince: string | null;
  items: HomeItem[];
}
