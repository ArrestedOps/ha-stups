// Wächter: Karten automatisch aus Zuständen in Home Assistant. Diese Typen spiegeln die Schnittstelle des Servers.

export type TriggerKind = 'state' | 'above' | 'below';
export type AssignMode = 'fixed' | 'rotation' | 'rotation_present' | 'all_present' | 'first_home' | 'none';
export type DueRule = { kind: 'none' } | { kind: 'in'; minutes: number } | { kind: 'at'; day: 'today' | 'tomorrow'; time: string };

export interface WatchTrigger {
  entityId: string;
  kind: TriggerKind;
  to: string | null;
  value: number | null;
  forMin: number;
  count: number;
}

export interface DoneTrigger {
  entityId: string;
  kind: TriggerKind;
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
  openCard: { id: string; title: string; boardId: string; assigneeIds: string[]; waiting: boolean } | null;
}

export interface WatcherActivity extends WatcherRun {
  watcherName: string;
}

export interface HaEntity {
  entityId: string;
  name: string;
  state: string;
  unit: string | null;
  domain: string;
}
