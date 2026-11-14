import { ValidationError } from './errors.js';
import { t } from './i18n/index.js';
import { parseIcon, parseIconColor } from './store/validate.js';
import { cleanCategory } from './watcher-categories.js';
import { parseReminder } from './reminders.js';

/** Bedingungen auf dem Zustand einer Entität (live über subscribe_trigger beobachtet) */
export type ConditionKind = 'state' | 'above' | 'below';
/**
 * Dazu zwei Arten, die Stups im Takt von 30 Minuten selbst abfragt: ein Termin in einem Kalender (mit Vorlauf) und Regen in der
 * Vorhersage einer Wetter-Entität.
 */
export type TriggerKind = ConditionKind | 'calendar_event' | 'forecast';

/** Das Stupsen eines Wächters: an die jeweils Zuständigen, endet mit der Erledigung der Aufgabe */
export interface WatcherNudge {
  afterMin: number;
  everyMin: number | null;
  max: number;
}

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
  /** erst beim N-ten Mal eine Aufgabe (1 = jedes Mal) */
  count: number;
  /** calendar_event: so viele Minuten vor dem Termin entsteht die Aufgabe */
  leadMin?: number;
  /** forecast: Regen in den nächsten so vielen Stunden */
  forecast?: { condition: 'rain'; hours: number };
}

/** Wann sich die Aufgabe von selbst erledigt */
export interface DoneTrigger {
  entityId: string;
  kind: ConditionKind;
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
  /** Symbol und Farbe der Aufgabe; ohne Angabe nimmt der Wächter das Symbol der beobachteten Entität */
  icon?: string | null;
  iconColor?: string | null;
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
  /** keine zweite Aufgabe, solange die erste offen ist */
  dedupe: boolean;
  /** Stupsen, wenn noch offen: nach `afterMin` Minuten, danach alle `everyMin` (null = nur einmal), höchstens `max` ×; null = nie */
  nudge: WatcherNudge | null;
  /** Kategorie zum Gruppieren in der Liste (frei wählbar, null = „Ohne Kategorie"); gleiche Namen legt die Daten-Schicht zusammen */
  category: string | null;
  /**
   * Die Aufgaben dieses Wächters zählen zur Fairness (zusätzlich zum Board: zählt das Board nicht, zählt auch der Wächter nicht). Ohne Angabe
   * beim Anlegen gilt der Wert des Boards; der gespeicherte Wert bleibt auch dann, wenn das Board gerade nicht zählt.
   */
  countsForFairness: boolean;
}

/**
 * ok; entity_missing: die beobachtete Entität gibt es nicht (mehr); target_missing: Board oder Spalte gibt es nicht mehr (pausiert);
 * assignees_missing: es gibt keine gültigen Zuständigen mehr (zum Beispiel wurde die einzige Person aus dem Board genommen): der
 * Wächter bleibt aktiv, legt aber keine Aufgaben an, bis neue Zuständige gespeichert sind.
 */
export type WatcherStatus = 'ok' | 'entity_missing' | 'target_missing' | 'assignees_missing';

const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MODES: AssignMode[] = ['fixed', 'rotation', 'rotation_present', 'all_present', 'first_home', 'suggest', 'none'];
/** So lange wartet eine vorgeschlagene Aufgabe auf ein „Übernehmen", dann greift der Rückfall des Wächters */
export const SUGGEST_WAIT_MIN = 30;

/** Wartezeit der Vorgabe: Zahlenwerte schwanken, Zustandswechsel gelten sofort */
export const DEFAULT_FOR_MIN = { state: 0, above: 3, below: 3, calendar_event: 0, forecast: 0 } as const;
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

function kindOf(raw: unknown): ConditionKind {
  if (raw !== 'state' && raw !== 'above' && raw !== 'below') throw new ValidationError(t('Die Bedingung ist unbekannt'));
  return raw;
}

function bound(kind: ConditionKind, o: Record<string, unknown>): { to: string | null; value: number | null } {
  if (kind === 'state') return { to: text(o.to, t('Der Zielzustand'), 255)!, value: null };
  if (typeof o.value !== 'number' || !Number.isFinite(o.value)) throw new ValidationError(t('Der Schwellwert muss eine Zahl sein'));
  return { to: null, value: o.value };
}

export function parseTrigger(raw: unknown): WatchTrigger {
  const o = obj(raw, t('Der Auslöser'));
  // Kalender und Vorhersage: kein Zustandsvergleich, Stups fragt sie im Takt ab
  if (o.kind === 'calendar_event') {
    const id = entity(o.entityId);
    if (!id.startsWith('calendar.')) throw new ValidationError(t('Für Termine muss es ein Kalender sein (calendar.…)'));
    return { entityId: id, kind: 'calendar_event', to: null, value: null, forMin: 0, count: 1, leadMin: int(o.leadMin, t('Der Vorlauf'), 0, 10_080, 720) };
  }
  if (o.kind === 'forecast') {
    const id = entity(o.entityId);
    if (!id.startsWith('weather.')) throw new ValidationError(t('Für die Vorhersage muss es eine Wetter-Entität sein (weather.…)'));
    const f = o.forecast === undefined || o.forecast === null ? {} : obj(o.forecast, t('Die Vorhersage'));
    if (f.condition !== undefined && f.condition !== 'rain') throw new ValidationError(t('Die Vorhersage kennt nur Regen'));
    return { entityId: id, kind: 'forecast', to: null, value: null, forMin: 0, count: 1, forecast: { condition: 'rain', hours: int(f.hours, t('Die Stunden'), 1, 48, 3) } };
  }
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
  const o = obj(raw, t('Die Aufgabe'));
  return {
    boardId: text(o.boardId, t('Das Board'), 100)!,
    columnId: text(o.columnId, t('Die Spalte'), 100)!,
    title: text(o.title, t('Der Titel'), 200)!,
    description: text(o.description, t('Die Beschreibung'), 5000, false),
    categoryIds: strings(o.categoryIds, t('Kategorien')),
    priority: text(o.priority, t('Die Priorität'), 20, false),
    due: parseDue(o.due),
    ...(o.icon !== undefined && o.icon !== null ? { icon: parseIcon(o.icon) } : {}),
    ...(o.iconColor !== undefined && o.iconColor !== null ? { iconColor: parseIconColor(o.iconColor) } : {}),
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

function parseNudge(raw: unknown): WatcherNudge | null {
  if (raw === undefined || raw === null) return null;
  const spec = parseReminder({ ...obj(raw, t('Das Stupsen')), anchor: 'created' }, { maxMin: 1440 });
  return { afterMin: spec.afterMin, everyMin: spec.everyMin, max: spec.max };
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
    nudge: parseNudge(o.nudge),
    category: cleanCategory(o.category),
    countsForFairness: o.countsForFairness === undefined ? true : o.countsForFairness === true,
  };
}

/** Erfüllt dieser Zustand die Bedingung? */
export function conditionMet(c: { kind: TriggerKind; to: string | null; value: number | null }, state: string): boolean {
  // Kalender und Vorhersage haben keinen Zustandsvergleich (Stups fragt sie im Takt ab)
  if (c.kind === 'calendar_event' || c.kind === 'forecast') return false;
  if (c.kind === 'state') return state === c.to;
  if (state === '' || state === 'unknown' || state === 'unavailable') return false;
  const n = Number(state);
  if (!Number.isFinite(n) || c.value === null) return false;
  return c.kind === 'above' ? n > c.value : n < c.value;
}
