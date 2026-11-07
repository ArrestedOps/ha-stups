// Wächter: Karten automatisch aus Zuständen in Home Assistant. Diese Typen spiegeln die Schnittstelle des Servers.
import type { Nudge } from './reminder';

export type ConditionKind = 'state' | 'above' | 'below';
/** Dazu Termine eines Kalenders (mit Vorlauf) und Regen in der Vorhersage: Stups fragt sie im Takt ab */
export type TriggerKind = ConditionKind | 'calendar_event' | 'forecast';
export type AssignMode = 'fixed' | 'rotation' | 'rotation_present' | 'all_present' | 'first_home' | 'suggest' | 'none';
export type DueRule = { kind: 'none' } | { kind: 'in'; minutes: number } | { kind: 'at'; day: 'today' | 'tomorrow'; time: string };

export interface WatchTrigger {
  entityId: string;
  kind: TriggerKind;
  to: string | null;
  value: number | null;
  forMin: number;
  count: number;
  /** Kalender: so viele Minuten vor dem Termin entsteht die Karte */
  leadMin?: number;
  /** Vorhersage: Regen in den nächsten so vielen Stunden */
  forecast?: { condition: 'rain'; hours: number };
}

export interface DoneTrigger {
  entityId: string;
  kind: ConditionKind;
  to: string | null;
  value: number | null;
}

export interface WatcherCard {
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  categoryIds: string[];
  priority: string | null;
  due: DueRule;
  /** Symbol und Farbe der Karte von Hand (leer: das Symbol der beobachteten Entität) */
  icon?: string | null;
  iconColor?: string | null;
}

export interface AssignRule {
  mode: AssignMode;
  personIds: string[];
  fallback: 'next' | 'all' | 'none' | 'fixed';
  waitFallback: 'all' | 'none' | 'fixed';
  fallbackPersonId: string | null;
}

export interface WatcherRun {
  id: string;
  watcherId: string;
  at: string;
  result: 'created' | 'retriggered' | 'counted' | 'cooldown' | 'waiting' | 'assigned' | 'auto_done' | 'nudged' | 'test' | 'error' | 'passed' | 'suggested' | 'claimed' | 'suggest_fallback' | 'no_assignees';
  cardId: string | null;
  assignedTo: string[];
  note: string | null;
}

/** Was beim Anlegen und Ändern an den Server geht */
export interface WatcherInput {
  name: string;
  active: boolean;
  trigger: WatchTrigger;
  card: WatcherCard;
  assign: AssignRule;
  done: DoneTrigger | null;
  cooldownMin: number;
  dedupe: boolean;
  /** Stupsen, wenn noch offen: nach …, danach alle … (null = nur einmal), höchstens … ×; null = nie */
  nudge: Nudge | null;
  /** Kategorie zum Gruppieren (null = „Ohne Kategorie"); gleiche Namen legt der Server zusammen */
  category: string | null;
  /** Die Karten zählen zur Fairness (zusätzlich zum Board). Ohne Angabe beim Anlegen gilt der Wert des Boards. */
  countsForFairness?: boolean;
}

export interface WatcherItem extends Omit<WatcherInput, 'countsForFairness'> {
  countsForFairness: boolean;
  id: string;
  /** assignees_missing: keine gültigen Zuständigen mehr, der Wächter bleibt aktiv, legt aber keine Karten an */
  status: 'ok' | 'entity_missing' | 'target_missing' | 'assignees_missing';
  /** Bei target_missing: das Board ist archiviert oder gelöscht (fehlt oder null: nur die Spalte fehlt) */
  pausedBy?: 'archived' | 'deleted' | null;
  lastFiredAt: string | null;
  lastAssignees: string[];
  armed: boolean;
  counter: number;
  /** Home Assistant hat das Abo bestätigt */
  subscribed: boolean;
  lastRun: WatcherRun | null;
  entityState: string | null;
  entityName: string | null;
  entityUnit: string | null;
  /** Friendly Name der Entität, ohne ihn die Entitäts-ID (immer gesetzt) */
  subject: string;
  /** Die Kategorie, die Stups vorschlüge (für Wächter ohne) */
  suggestedCategory: string;
  openCard: { id: string; title: string; boardId: string; assigneeIds: string[]; waiting: boolean } | null;
}

/** Die Bedingung gilt beim Speichern schon und der Wächter löst nicht von selbst aus: Die App fragt, ob die Karte jetzt entstehen soll */
export interface MetNow {
  entityName: string;
  /** der Zustand in Worten („aus“, „412 W“), in der Sprache der Anfrage */
  stateText: string;
  reason: 'already_met';
}

/** Antwort auf Anlegen und Ändern: der Wächter, dazu `metNow` (fehlt, wenn nur pausiert oder wieder eingeschaltet wurde) */
export interface SavedWatcher extends WatcherItem {
  metNow?: MetNow | null;
}

export interface WatcherActivity extends WatcherRun {
  watcherName: string;
  /** Das Gerät unter dem Namen, solange der Name es nicht nennt */
  subject?: string | null;
}

export interface HaEntity {
  entityId: string;
  name: string;
  state: string;
  unit: string | null;
  domain: string;
  /** Vorschlag für die Kategorie des neuen Wächters (aus Domäne, Geräteklasse und Name) */
  category?: string;
}

// ---------- Vorlagen, Gefunden, Probelauf (vom Server) ----------

export interface TemplateDraft {
  name: string;
  trigger:
    | { kind: 'below' | 'above'; value: number; forMin: number; count?: number }
    | { kind: 'state'; to: string; forMin: number; count?: number }
    | { kind: 'calendar_event'; leadMin: number }
    | { kind: 'forecast'; condition: 'rain'; hours: number };
  card: { title: string; due: DueRule };
  assign: { mode: AssignMode };
  done: { kind: 'above'; value: number } | null;
}

export interface WatcherTemplate {
  id: string;
  kind: 'watcher' | 'recurring';
  title: string;
  hint: string;
  domain: string | null;
  search: string;
  draft: TemplateDraft | null;
  recurring: { title: string; recurrence: Record<string, unknown> } | null;
  /** Kann der Sensor belegen, dass die Aufgabe erledigt ist? */
  canSelfComplete: boolean;
  whyNoSelfComplete: string | null;
  /** Kategorie, die der Assistent vorbelegt (Vorlagen ohne Wächter haben keine) */
  category?: string | null;
}

export interface WatcherSuggestion {
  templateId: string;
  entityId: string;
  name: string;
  reason: string;
  variant: 'power' | 'status' | 'default';
  unit?: string;
  draft?: TemplateDraft;
  /** Kurzer Gerätename für Name und Kartentitel des neuen Wächters */
  label?: string;
}

export interface DryRunResult {
  fired: { at: string }[];
  quick: number;
  sentence: string;
  points: { at: string; v: number }[];
  noHistory: boolean;
  truncated: boolean;
  from: string;
  to: string;
}

/** Die Reihenfolge für „An wen" (`GET /api/watchers/order`): der Kreis in der Reihenfolge der Verteilung, wer als Nächstes dran ist, wer zu Hause ist */
export interface OrderView {
  mode: AssignMode;
  circle: { id: string; present: boolean | null; next: boolean }[];
  /** reihum: zwischen den Personen stehen Pfeile */
  ordered: boolean;
  /** wie viele aus dem Kreis zu Hause sind; null, wenn sich niemand zuordnen lässt */
  home: number | null;
}
