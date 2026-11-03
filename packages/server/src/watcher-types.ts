import { ValidationError } from './errors.js';
import { t } from './i18n/index.js';

export type TriggerKind = 'state' | 'above' | 'below';

/** Wann ein Wächter auslöst */
export interface WatchTrigger {
  entityId: string;
  kind: TriggerKind;
  /** Zustand, in den die Entität wechselt (nur bei kind = state) */
  to: string | null;
  /** Schwellwert (bei above/below) */
  value: number | null;
  /** muss so viele Minuten ununterbrochen gelten */
  forMin: number;
  /** erst beim N-ten Mal eine Karte (1 = jedes Mal) */
  count: number;
}

/** Wann sich die Karte von selbst erledigt */
export interface DoneTrigger {
  entityId: string;
  kind: TriggerKind;
  to: string | null;
  value: number | null;
}

export type DueRule =
  | { kind: 'none' }
  /** in so vielen Minuten, ab dem Zuweisen (oder ab dem Anlegen, wenn niemand wartet) */
  | { kind: 'in'; minutes: number }
  /** heute oder morgen um diese Uhrzeit (Ortszeit) */
  | { kind: 'at'; day: 'today' | 'tomorrow'; time: string };

export interface CardTemplate {
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  categoryIds: string[];
  priority: string | null;
  due: DueRule;
}

export type AssignMode = 'fixed' | 'rotation' | 'rotation_present' | 'all_present' | 'first_home' | 'suggest' | 'none';
export type Fallback = 'next' | 'all' | 'none' | 'fixed';
export type WaitFallback = 'all' | 'none' | 'fixed';

export interface AssignRule {
  mode: AssignMode;
  /** feste Personen oder der Kreis, aus dem gewählt wird (leer = alle Personen) */
  personIds: string[];
  /** wenn niemand zu Hause ist (rotation_present, all_present) */
  fallback: Fallback;
  /** wenn nach 24 Stunden niemand heimgekommen ist (first_home) */
  waitFallback: WaitFallback;
  /** Person für die Rückfälle „fixed" */
  fallbackPersonId: string | null;
}

export interface WatcherConfig {
  name: string;
  active: boolean;
  trigger: WatchTrigger;
  card: CardTemplate;
  assign: AssignRule;
  done: DoneTrigger | null;
  /** Sperrzeit in Minuten */
  cooldownMin: number;
  /** keine zweite Karte, solange die erste offen ist */
  dedupe: boolean;
  /** nach so vielen Minuten stupsen, wenn noch offen (null = nie) */
  nudgeAfterMin: number | null;
}

export type WatcherStatus = 'ok' | 'entity_missing' | 'target_missing';

const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MODES: AssignMode[] = ['fixed', 'rotation', 'rotation_present', 'all_present', 'first_home', 'suggest', 'none'];
/** So lange wartet eine vorgeschlagene Karte auf ein „Übernehmen", dann greift der Rückfall des Wächters */
export const SUGGEST_WAIT_MIN = 30;

/** Wartezeit der Vorgabe: Zahlenwerte schwanken, Zustandswechsel gelten sofort */
export const DEFAULT_FOR_MIN = { state: 0, above: 3, below: 3 } as const;
export const WAITING_MARKER = '⏳ Wartet auf die erste Person, die heimkommt.';

const obj = (raw: unknown, what: string): Record<string, unknown> => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ValidationError(t('{what} fehlt oder ist ungültig', { what }));
  return raw as Record<string, unknown>;
};

function text(raw: unknown, what: string, max: number, required = true): string | null {
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw new ValidationError(t('{what} fehlt', { what }));
    return null;
  }
  if (typeof raw !== 'string') throw new ValidationError(t('{what} muss ein Text sein', { what }));
  const value = raw.trim();
  if (value === '') {
    if (required) throw new ValidationError(t('{what} fehlt', { what }));
    return null;
  }
  if (value.length > max) throw new ValidationError(t('{what} ist zu lang (höchstens {max} Zeichen)', { what, max }));
  return value;
}

function int(raw: unknown, what: string, min: number, max: number, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
    throw new ValidationError(t('{what} muss eine ganze Zahl von {min} bis {max} sein', { what, min, max }));
  }
  return raw;
}

function entity(raw: unknown): string {
  const id = text(raw, t('Die Entität'), 255)!;
  if (!ENTITY_RE.test(id)) throw new ValidationError(t('Die Entität muss die Form domain.name haben'));
  return id;
}

function strings(raw: unknown, what: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) throw new ValidationError(t('{what} müssen eine Liste sein', { what }));
  return [...new Set(raw as string[])];
}

function kindOf(raw: unknown): TriggerKind {
  if (raw !== 'state' && raw !== 'above' && raw !== 'below') throw new ValidationError(t('Die Bedingung ist unbekannt'));
  return raw;
}

function bound(kind: TriggerKind, o: Record<string, unknown>): { to: string | null; value: number | null } {
  if (kind === 'state') return { to: text(o.to, t('Der Zielzustand'), 255)!, value: null };
  if (typeof o.value !== 'number' || !Number.isFinite(o.value)) throw new ValidationError(t('Der Schwellwert muss eine Zahl sein'));
  return { to: null, value: o.value };
}

export function parseTrigger(raw: unknown): WatchTrigger {
  const o = obj(raw, t('Der Auslöser'));
  const kind = kindOf(o.kind);
  return {
    entityId: entity(o.entityId),
    kind,
    ...bound(kind, o),
    forMin: int(o.forMin, t('Die Wartezeit'), 0, 1440, DEFAULT_FOR_MIN[kind]),
    count: int(o.count, t('Die Anzahl'), 1, 100, 1),
  };
}

export function parseDone(raw: unknown): DoneTrigger | null {
  if (raw === undefined || raw === null) return null;
  const o = obj(raw, t('Die Bedingung zum Erledigen'));
  const kind = kindOf(o.kind);
  return { entityId: entity(o.entityId), kind, ...bound(kind, o) };
}

function parseDue(raw: unknown): DueRule {
  if (raw === undefined || raw === null) return { kind: 'none' };
  const o = obj(raw, t('Die Fälligkeit'));
  if (o.kind === 'none') return { kind: 'none' };
  if (o.kind === 'in') return { kind: 'in', minutes: int(o.minutes, t('Die Minuten'), 0, 60 * 24 * 14, 0) };
  if (o.kind === 'at') {
    if (o.day !== 'today' && o.day !== 'tomorrow') throw new ValidationError(t('Die Fälligkeit muss heute oder morgen sein'));
    if (typeof o.time !== 'string' || !HM_RE.test(o.time)) throw new ValidationError(t('Die Uhrzeit muss die Form HH:MM haben'));
    return { kind: 'at', day: o.day, time: o.time };
  }
  throw new ValidationError(t('Die Fälligkeit ist unbekannt'));
}

export function parseTemplate(raw: unknown): CardTemplate {
  const o = obj(raw, t('Die Karte'));
  return {
    boardId: text(o.boardId, t('Das Board'), 100)!,
    columnId: text(o.columnId, t('Die Spalte'), 100)!,
    title: text(o.title, t('Der Titel'), 200)!,
    description: text(o.description, t('Die Beschreibung'), 5000, false),
    categoryIds: strings(o.categoryIds, t('Kategorien')),
    priority: text(o.priority, t('Die Priorität'), 20, false),
    due: parseDue(o.due),
  };
}

export function parseAssign(raw: unknown): AssignRule {
  const o = obj(raw, t('Die Zuweisung'));
  const mode = o.mode as AssignMode;
  if (!MODES.includes(mode)) throw new ValidationError(t('Die Art der Zuweisung ist unbekannt'));
  const fallback = (o.fallback ?? 'next') as Fallback;
  if (!['next', 'all', 'none', 'fixed'].includes(fallback)) throw new ValidationError(t('Der Rückfall ist unbekannt'));
  const waitFallback = (o.waitFallback ?? 'none') as WaitFallback;
  if (!['all', 'none', 'fixed'].includes(waitFallback)) throw new ValidationError(t('Der Rückfall nach 24 Stunden ist unbekannt'));
  const personIds = strings(o.personIds, t('Personen'));
  const fallbackPersonId = text(o.fallbackPersonId, t('Die Person für den Rückfall'), 100, false);
  if (mode === 'fixed' && personIds.length === 0) throw new ValidationError(t('Wähle mindestens eine Person'));
  if ((fallback === 'fixed' || waitFallback === 'fixed') && !fallbackPersonId) throw new ValidationError(t('Wähle die Person für den Rückfall'));
  return { mode, personIds, fallback, waitFallback, fallbackPersonId };
}

/** Prüft und normalisiert die Eingabe der Oberfläche (Anlegen und Ändern) */
export function parseWatcher(raw: unknown): WatcherConfig {
  const o = obj(raw, t('Der Wächter'));
  return {
    name: text(o.name, t('Der Name'), 80)!,
    active: o.active === undefined ? true : o.active === true,
    trigger: parseTrigger(o.trigger),
    card: parseTemplate(o.card),
    assign: parseAssign(o.assign),
    done: parseDone(o.done),
    cooldownMin: int(o.cooldownMin, t('Die Sperrzeit'), 0, 1440, 10),
    dedupe: o.dedupe === undefined ? true : o.dedupe === true,
    nudgeAfterMin: o.nudgeAfterMin === undefined || o.nudgeAfterMin === null ? null : int(o.nudgeAfterMin, t('Das Stupsen nach'), 5, 1440, 60),
  };
}

/** Erfüllt dieser Zustand die Bedingung? */
export function conditionMet(c: { kind: TriggerKind; to: string | null; value: number | null }, state: string): boolean {
  if (c.kind === 'state') return state === c.to;
  if (state === '' || state === 'unknown' || state === 'unavailable') return false;
  const n = Number(state);
  if (!Number.isFinite(n) || c.value === null) return false;
  return c.kind === 'above' ? n > c.value : n < c.value;
}
