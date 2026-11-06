// Wächter: Karten automatisch aus Zuständen in Home Assistant. Diese Typen spiegeln die Schnittstelle des Servers.

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
  result: 'created' | 'retriggered' | 'counted' | 'cooldown' | 'waiting' | 'assigned' | 'auto_done' | 'nudged' | 'test' | 'error' | 'passed' | 'suggested' | 'claimed' | 'suggest_fallback';
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
  nudgeAfterMin: number | null;
}

export interface WatcherItem extends WatcherInput {
  id: string;
  status: 'ok' | 'entity_missing' | 'target_missing';
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
  /** Kurzer Gerätename */
  deviceLabel: string;
  /** Der Name nennt das Gerät schon */
  nameHasDevice: boolean;
  /** Der Name ist noch der einer Vorlage */
  defaultName: boolean;
  /** So hieße der Wächter mit Gerät (null: nichts zu ergänzen oder Entität unbekannt) */
  suggestedName: string | null;
  suggestedTitle: string | null;
  openCard: { id: string; title: string; boardId: string; assigneeIds: string[]; waiting: boolean } | null;
}

export interface WatcherActivity extends WatcherRun {
  watcherName: string;
  /** Das Gerät unter dem Namen, solange der Name es nicht nennt */
  subject?: string | null;
}

export interface HaEntity {
  entityId: string;
  name: string;
  /** Kurzer Gerätename für Name und Kartentitel eines Wächters ("iPhone Rene" statt "iPhone Rene Battery Level") */
  label?: string;
  state: string;
  unit: string | null;
  domain: string;
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
