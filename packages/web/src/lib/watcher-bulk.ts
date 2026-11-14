import { t, tn } from './i18n/index.svelte';
import { nudgeSentence, type Nudge } from './reminder';
import type { AssignMode, BulkPatch, DueRule, TriggerKind, WatcherItem } from './watcher-types';
import { toInput, whoText, type WatcherForm } from './watchers';

// Mehrere Wächter auf einmal bearbeiten: welche Felder für alle passen, welcher Wert gilt für alle („verschieden“, wenn keiner), und aus dem
// Formular der Patch für `POST /api/watchers/bulk`. Entität, Name und Titel der Karte sind nie dabei.

export type BulkField =
  | 'active'
  | 'category'
  | 'assign'
  | 'board'
  | 'due'
  | 'priority'
  | 'nudge'
  | 'cooldown'
  | 'dedupe'
  | 'fairness'
  | 'threshold'
  | 'forMin'
  | 'count'
  | 'lead'
  | 'forecastHours'
  | 'doneValue';

/** „Verschieden“: die Ausgewählten haben für dieses Feld nicht denselben Wert */
export const MIXED: unique symbol = Symbol('verschieden');

/** Die Felder, die bei jeder Auswahl gelten */
const COMMON: BulkField[] = ['active', 'category', 'assign', 'board', 'due', 'priority', 'nudge', 'cooldown', 'dedupe', 'fairness'];

/** JSON mit sortierten Schlüsseln: Objekte gelten als gleich, wenn sie denselben Inhalt haben */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x ?? null);
}

/**
 * Die gemeinsame Auslöser-Art; bei Schwellwerten (below/above) muss auch die Einheit gleich sein (20 % und 20 W sind nicht derselbe Wert).
 * null: gemischt oder keine Auswahl.
 */
function family(items: WatcherItem[]): TriggerKind | null {
  const first = items[0];
  if (!first) return null;
  const kind = first.trigger.kind;
  const level = kind === 'below' || kind === 'above';
  const unit = first.entityUnit ?? '';
  return items.every((w) => w.trigger.kind === kind && (!level || (w.entityUnit ?? '') === unit)) ? kind : null;
}

/** Welche Felder für alle Ausgewählten passen (Auslöser-Felder nur bei gleicher Art und Einheit) */
export function bulkFields(items: WatcherItem[]): BulkField[] {
  const out = [...COMMON];
  const kind = family(items);
  if (kind === 'below' || kind === 'above') out.push('threshold', 'forMin', 'count');
  else if (kind === 'state') out.push('forMin', 'count');
  else if (kind === 'calendar_event') out.push('lead');
  else if (kind === 'forecast') out.push('forecastHours');
  // „Von selbst erledigt ab“: nur eine vorhandene Bedingung mit Schwellwert lässt sich ändern
  if ((kind === 'below' || kind === 'above') && items.every((w) => w.done !== null && w.done.kind !== 'state')) out.push('doneValue');
  return out;
}

/** Der Wert eines Feldes bei einem Wächter, in einer Form, die sich vergleichen lässt */
const VALUE: Record<BulkField, (w: WatcherItem) => unknown> = {
  active: (w) => w.active,
  category: (w) => w.category?.trim() || null,
  assign: (w) => w.assign,
  board: (w) => ({ boardId: w.card.boardId, columnId: w.card.columnId }),
  due: (w) => w.card.due,
  priority: (w) => w.card.priority ?? null,
  nudge: (w) => w.nudge ?? null,
  cooldown: (w) => w.cooldownMin,
  dedupe: (w) => w.dedupe,
  fairness: (w) => w.countsForFairness,
  threshold: (w) => w.trigger.value,
  forMin: (w) => w.trigger.forMin,
  count: (w) => w.trigger.count,
  lead: (w) => w.trigger.leadMin ?? null,
  forecastHours: (w) => w.trigger.forecast?.hours ?? null,
  doneValue: (w) => w.done?.value ?? null,
};

/** Der gemeinsame Wert je Feld, oder `MIXED`, wenn die Ausgewählten verschiedene haben */
export function commonValues(items: WatcherItem[]): Partial<Record<BulkField, unknown>> {
  const first = items[0];
  if (!first) return {};
  const out: Partial<Record<BulkField, unknown>> = {};
  for (const field of Object.keys(VALUE) as BulkField[]) {
    const v = VALUE[field](first);
    out[field] = items.every((w) => stable(VALUE[field](w)) === stable(v)) ? v : MIXED;
  }
  return out;
}

/**
 * Aus dem Formular und den angefassten Feldern den Patch bauen. Es geht nur ins Paket, was angefasst wurde; alles andere bleibt je Wächter,
 * wie es ist. Ein neues Board nimmt die Spalte mit und leert die Kategorien der Karte (sie gehören dem alten Board).
 */
export function toBulkPatch(form: WatcherForm, touched: ReadonlySet<BulkField>): BulkPatch {
  const input = toInput(form);
  const out: BulkPatch = {};
  const card: NonNullable<BulkPatch['card']> = {};
  const trigger: NonNullable<BulkPatch['trigger']> = {};
  if (touched.has('active')) out.active = form.active;
  if (touched.has('category')) out.category = input.category;
  if (touched.has('assign')) out.assign = input.assign;
  if (touched.has('board')) Object.assign(card, { boardId: input.card.boardId, columnId: input.card.columnId, categoryIds: [] });
  if (touched.has('due')) card.due = input.card.due;
  if (touched.has('priority')) card.priority = input.card.priority;
  if (Object.keys(card).length > 0) out.card = card;
  if (touched.has('nudge')) out.nudge = input.nudge;
  if (touched.has('cooldown')) out.cooldownMin = input.cooldownMin;
  if (touched.has('dedupe')) out.dedupe = input.dedupe;
  if (touched.has('fairness')) out.countsForFairness = form.countsForFairness ?? true;
  if (touched.has('threshold')) trigger.value = input.trigger.value;
  if (touched.has('forMin')) trigger.forMin = input.trigger.forMin;
  if (touched.has('count')) trigger.count = input.trigger.count;
  if (touched.has('lead')) trigger.leadMin = input.trigger.leadMin;
  if (touched.has('forecastHours')) trigger.forecastHours = input.trigger.forecast?.hours;
  if (Object.keys(trigger).length > 0) out.trigger = trigger;
  if (touched.has('doneValue')) out.done = { value: input.done?.value ?? null };
  return out;
}

/**
 * Gemeinsames Einrichten: die angehakten Treffer als Geräte für `POST /api/watchers/bulk-create`, in der Reihenfolge der Treffer und ohne
 * Doppelte (dieselbe Entität kann unter zwei Vorlagen stehen).
 */
export function devicesOf(hits: { entityId: string }[]): { entityId: string }[] {
  const seen = new Set<string>();
  const out: { entityId: string }[] = [];
  for (const h of hits) {
    if (seen.has(h.entityId)) continue;
    seen.add(h.entityId);
    out.push({ entityId: h.entityId });
  }
  return out;
}

// ---------- Anzeige im Sammel-Formular ----------

/** Der Wert, den das Formular für jedes Feld hält (in derselben Form wie `commonValues`): so zeigt das Sammel-Formular einen geänderten Wert */
export function formValues(form: WatcherForm): Record<BulkField, unknown> {
  const input = toInput(form);
  return {
    active: form.active,
    category: input.category,
    assign: input.assign,
    board: { boardId: input.card.boardId, columnId: input.card.columnId },
    due: input.card.due,
    priority: input.card.priority,
    nudge: input.nudge,
    cooldown: input.cooldownMin,
    dedupe: input.dedupe,
    fairness: form.countsForFairness ?? true,
    threshold: input.trigger.value,
    forMin: input.trigger.forMin,
    count: input.trigger.count,
    lead: input.trigger.leadMin ?? null,
    forecastHours: input.trigger.forecast?.hours ?? null,
    doneValue: input.done?.value ?? null,
  };
}

export function fieldLabel(field: BulkField): string {
  switch (field) {
    case 'active':
      return t('Aktiv');
    case 'category':
      return t('Kategorie');
    case 'assign':
      return t('Wer');
    case 'board':
      return t('Board und Spalte');
    case 'due':
      return t('Fällig');
    case 'priority':
      return t('Priorität');
    case 'nudge':
      return t('Stupsen');
    case 'cooldown':
      return t('Sperrzeit');
    case 'dedupe':
      return t('Keine zweite Karte');
    case 'fairness':
      return t('Zählt zur Fairness');
    case 'threshold':
      return t('Schwelle');
    case 'forMin':
      return t('Mindestens so lange');
    case 'count':
      return t('Erst beim N-ten Mal');
    case 'lead':
      return t('Vorlauf vor dem Termin');
    case 'forecastHours':
      return t('Regen in den nächsten Stunden');
    default:
      return t('Erledigt sich von selbst ab');
  }
}

export interface TextContext {
  personName: (id: string) => string;
  boardName: (id: string) => string;
  /** Einheit der Schwelle (leer: keine) */
  unit: string;
}

/** Ein Wert als kurzer Text für die Zeile des Sammel-Formulars; `MIXED` heißt „verschieden“ */
export function valueText(field: BulkField, v: unknown, ctx: TextContext): string {
  if (v === MIXED) return t('verschieden');
  const unit = ctx.unit ? ` ${ctx.unit}` : '';
  const min = (n: unknown) => (typeof n === 'number' ? t('{n} Min.', { n }) : '–');
  switch (field) {
    case 'active':
      return v ? t('aktiv') : t('pausiert');
    case 'category':
      return (v as string | null) || t('Ohne Kategorie');
    case 'assign': {
      const a = v as { mode: AssignMode; personIds: string[] };
      return whoText({ assignMode: a.mode, personIds: a.personIds }, ctx.personName);
    }
    case 'board': {
      const b = v as { boardId: string };
      return b.boardId ? ctx.boardName(b.boardId) : '–';
    }
    case 'due': {
      const d = v as DueRule;
      return d.kind === 'in' ? (d.minutes === 0 ? t('sofort') : t('in {n} Min.', { n: d.minutes })) : d.kind === 'at' ? `${d.day === 'today' ? t('heute') : t('morgen')} ${d.time}` : t('ohne Termin');
    }
    case 'priority':
      return v === 'low' ? t('Niedrig') : v === 'high' ? t('Hoch') : t('Mittel');
    case 'nudge':
      return v ? nudgeSentence(v as Nudge) : t('nie');
    case 'cooldown':
    case 'forMin':
      return min(v);
    case 'dedupe':
    case 'fairness':
      return v ? t('ja') : t('nein');
    case 'threshold':
    case 'doneValue':
      return typeof v === 'number' ? `${String(v).replace('.', ',')}${unit}` : '–';
    case 'count':
      return typeof v === 'number' ? `${v} ×` : '–';
    case 'lead':
      return typeof v === 'number' ? tn('{n} Stunde', '{n} Stunden', Math.round(v / 60)) : '–';
    default:
      return typeof v === 'number' ? tn('{n} Stunde', '{n} Stunden', v) : '–';
  }
}

/** Welche Felder des Formulars zu einem Feld des Sammel-Formulars gehören */
const FORM_KEYS: Record<BulkField, (keyof WatcherForm)[]> = {
  active: ['active'],
  category: ['category', 'categorySource'],
  assign: ['assignMode', 'personIds', 'fallback', 'waitFallback', 'fallbackPersonId'],
  board: ['boardId', 'columnId'],
  due: ['dueKind', 'dueMinutes', 'dueDay', 'dueTime'],
  priority: ['priority'],
  nudge: ['nudgeAfter', 'nudgeEvery', 'nudgeMax'],
  cooldown: ['cooldownMin'],
  dedupe: ['dedupe'],
  fairness: ['countsForFairness'],
  threshold: ['value'],
  forMin: ['forMin'],
  count: ['count'],
  lead: ['leadHours'],
  forecastHours: ['forecastHours'],
  doneValue: ['doneValue'],
};

/** Ein Feld zurücksetzen: die Werte aus `initial` (der Stand beim Öffnen) zurück ins Formular */
export function resetField(form: WatcherForm, initial: WatcherForm, field: BulkField): WatcherForm {
  const out: WatcherForm = { ...form };
  for (const key of FORM_KEYS[field]) (out as unknown as Record<string, unknown>)[key] = structuredClone(initial[key]);
  return out;
}
