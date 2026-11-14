import { ValidationError } from './errors.js';
import { t } from './i18n/index.js';
import type { AssignRule, CardTemplate, DueRule, WatchTrigger, WatcherConfig, WatcherNudge } from './watcher-types.js';

/**
 * Mehrere Wächter auf einmal ändern: ein Teil-Patch, der nur anfasst, was angegeben ist. Entität, Name und Aufgabentitel setzt er nie
 * (jeder Wächter behält seine). Werte-Grenzen prüft nicht dieses Modul: das Ergebnis läuft je Wächter durch `parseWatcher`.
 */
export interface BulkPatch {
  active?: boolean;
  category?: string | null;
  /** ersetzt die Zuteilung ganz */
  assign?: AssignRule;
  card?: Partial<Pick<CardTemplate, 'boardId' | 'columnId' | 'categoryIds' | 'priority' | 'due'>>;
  cooldownMin?: number;
  dedupe?: boolean;
  nudge?: WatcherNudge | null;
  countsForFairness?: boolean;
  trigger?: Partial<Pick<WatchTrigger, 'value' | 'forMin' | 'count' | 'leadMin' | 'to'>> & { forecastHours?: number };
  /** null = „von selbst erledigen" aus; ein Wert ändert nur eine vorhandene Bedingung */
  done?: { value?: number | null; to?: string | null } | null;
}

export type TriggerFamily = 'below' | 'above' | 'state' | 'calendar_event' | 'forecast';

/**
 * Die gemeinsame Auslöser-Art der Wächter, sonst null (gemischt). Bei Schwellwerten (below/above) muss auch die Einheit der
 * beobachteten Entität gleich sein: 20 % und 20 W sind nicht derselbe Wert.
 */
export function commonFamily(ws: { trigger: WatchTrigger; unit?: string | null }[]): TriggerFamily | null {
  const first = ws[0];
  if (!first) return null;
  const kind = first.trigger.kind;
  const unit = first.unit ?? '';
  for (const w of ws) {
    if (w.trigger.kind !== kind) return null;
    if ((kind === 'below' || kind === 'above') && (w.unit ?? '') !== unit) return null;
  }
  return kind;
}

const TOP_KEYS = ['active', 'category', 'assign', 'card', 'cooldownMin', 'dedupe', 'nudge', 'countsForFairness', 'trigger', 'done'] as const;
const CARD_KEYS = ['boardId', 'columnId', 'categoryIds', 'priority', 'due'] as const;
/** Welche Auslöser-Felder zu welcher Art gehören */
const TRIGGER_FIELDS: Record<string, readonly TriggerFamily[]> = {
  value: ['below', 'above'],
  forMin: ['below', 'above', 'state'],
  count: ['below', 'above', 'state'],
  to: ['state'],
  leadMin: ['calendar_event'],
  forecastHours: ['forecast'],
};
const DONE_FIELDS: Record<string, readonly TriggerFamily[]> = { value: ['below', 'above'], to: ['state'] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const invalid = (what: string): ValidationError => new ValidationError(t('{what} fehlt oder ist ungültig', { what }));

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): void {
  const bad = Object.keys(o).find((k) => !allowed.includes(k));
  if (bad !== undefined) throw new ValidationError(t('Unbekannte Angabe: {key}', { key: bad }));
}

/** Wirft ValidationError für unbekannte Schlüssel und für Auslöser-Felder, die nicht zu allen Wächtern passen (family = null: gemischt) */
export function parseBulkPatch(raw: unknown, family: TriggerFamily | null): BulkPatch {
  if (!isObj(raw)) throw invalid(t('Die Änderung'));
  onlyKeys(raw, TOP_KEYS);
  const out: BulkPatch = {};
  const mismatch = (key: string): never => {
    throw new ValidationError(t('„{key}“ passt nicht zu allen ausgewählten Wächtern (verschiedene Auslöser)', { key }));
  };
  if (raw.active !== undefined) out.active = raw.active === true;
  if (raw.category !== undefined) out.category = typeof raw.category === 'string' ? raw.category : null;
  if (raw.assign !== undefined) {
    if (!isObj(raw.assign)) throw invalid(t('Die Zuweisung'));
    out.assign = raw.assign as unknown as AssignRule;
  }
  if (raw.card !== undefined) {
    if (!isObj(raw.card)) throw invalid(t('Die Aufgabe'));
    onlyKeys(raw.card, CARD_KEYS);
    out.card = { ...raw.card } as BulkPatch['card'];
  }
  if (raw.cooldownMin !== undefined) out.cooldownMin = raw.cooldownMin as number;
  if (raw.dedupe !== undefined) out.dedupe = raw.dedupe === true;
  if (raw.nudge !== undefined) {
    if (raw.nudge !== null && !isObj(raw.nudge)) throw invalid(t('Das Stupsen'));
    out.nudge = raw.nudge as WatcherNudge | null;
  }
  if (raw.countsForFairness !== undefined) out.countsForFairness = raw.countsForFairness === true;
  if (raw.trigger !== undefined) {
    if (!isObj(raw.trigger)) throw invalid(t('Der Auslöser'));
    onlyKeys(raw.trigger, Object.keys(TRIGGER_FIELDS));
    for (const key of Object.keys(raw.trigger)) if (!family || !TRIGGER_FIELDS[key]!.includes(family)) mismatch(key);
    out.trigger = { ...raw.trigger } as BulkPatch['trigger'];
  }
  if (raw.done !== undefined) {
    if (raw.done === null) out.done = null;
    else {
      if (!isObj(raw.done)) throw invalid(t('Die Bedingung zum Erledigen'));
      onlyKeys(raw.done, Object.keys(DONE_FIELDS));
      for (const key of Object.keys(raw.done)) if (!family || !DONE_FIELDS[key]!.includes(family)) mismatch(key);
      out.done = { ...raw.done } as BulkPatch['done'];
    }
  }
  return out;
}

/** Wendet den Patch auf eine Konfiguration an (tief für card, trigger und done) und lässt Entität, Name und Aufgabentitel in Ruhe */
export function applyBulkPatch(config: WatcherConfig, patch: BulkPatch): WatcherConfig {
  const out: WatcherConfig = { ...config, trigger: { ...config.trigger }, card: { ...config.card }, done: config.done ? { ...config.done } : null };
  if (patch.active !== undefined) out.active = patch.active;
  if (patch.category !== undefined) out.category = patch.category;
  if (patch.assign !== undefined) out.assign = patch.assign;
  if (patch.cooldownMin !== undefined) out.cooldownMin = patch.cooldownMin;
  if (patch.dedupe !== undefined) out.dedupe = patch.dedupe;
  if (patch.nudge !== undefined) out.nudge = patch.nudge;
  if (patch.countsForFairness !== undefined) out.countsForFairness = patch.countsForFairness;
  if (patch.card) {
    const c = patch.card;
    if (c.boardId !== undefined) out.card.boardId = c.boardId;
    if (c.columnId !== undefined) out.card.columnId = c.columnId;
    if (c.categoryIds !== undefined) out.card.categoryIds = c.categoryIds;
    if (c.priority !== undefined) out.card.priority = c.priority;
    if (c.due !== undefined) out.card.due = c.due as DueRule;
  }
  if (patch.trigger) {
    const p = patch.trigger;
    if (p.value !== undefined) out.trigger.value = p.value;
    if (p.forMin !== undefined) out.trigger.forMin = p.forMin;
    if (p.count !== undefined) out.trigger.count = p.count;
    if (p.leadMin !== undefined) out.trigger.leadMin = p.leadMin;
    if (p.to !== undefined) out.trigger.to = p.to;
    if (p.forecastHours !== undefined) out.trigger.forecast = { condition: 'rain', hours: p.forecastHours };
  }
  if (patch.done === null) out.done = null;
  else if (patch.done && out.done) {
    if (out.done.kind === 'state') {
      if (patch.done.to !== undefined) out.done.to = patch.done.to;
    } else if (patch.done.value !== undefined) out.done.value = patch.done.value;
  }
  return out;
}
