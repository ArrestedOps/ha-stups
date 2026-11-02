import { t } from './i18n/index.svelte';
import { toInputValue } from './datetime';
import { names } from './i18n/names';

export type Recurrence =
  | {
      type: 'fixed';
      freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
      every: number;
      weekdays?: number[];
      monthDay?: number;
    }
  | { type: 'after_completion'; every: number; unit: 'days' | 'weeks' | 'months' };

/** 1 = Montag … 7 = Sonntag */
const dayShort = (d: number) => names().weekdaysShort[d % 7]!;
const dayLong = (d: number) => names().weekdaysLong[d % 7]!;
const unitPlural = (u: 'days' | 'weeks' | 'months') => ({ days: t('Tage'), weeks: t('Wochen'), months: t('Monate') })[u];
const unitEach = (u: 'days' | 'weeks' | 'months') => ({ days: t('jeden Tag'), weeks: t('jede Woche'), months: t('jeden Monat') })[u];

export function describeRecurrence(rule: Recurrence): string {
  if (rule.type === 'after_completion') {
    return rule.every === 1
      ? t('{each} nach Erledigung', { each: unitEach(rule.unit) })
      : t('alle {n} {unit} nach Erledigung', { n: rule.every, unit: unitPlural(rule.unit) });
  }
  const n = rule.every;
  switch (rule.freq) {
    case 'daily':
      return n === 1 ? t('täglich') : t('alle {n} Tage', { n });
    case 'weekly': {
      const days = [...(rule.weekdays ?? [])].sort((a, b) => a - b);
      if (days.length === 0) return n === 1 ? t('wöchentlich') : t('alle {n} Wochen', { n });
      if (n === 1) {
        return days.length === 1 ? t('jeden {day}', { day: dayLong(days[0]!) }) : t('jeden {day}', { day: days.map(dayShort).join(' + ') });
      }
      return t('alle {n} Wochen ({days})', { n, days: days.map(dayShort).join(', ') });
    }
    case 'monthly': {
      const day = rule.monthDay === -1 ? t('am letzten Tag') : rule.monthDay ? t('am {day}.', { day: rule.monthDay }) : '';
      const base = n === 1 ? t('monatlich') : t('alle {n} Monate', { n });
      return day ? `${base} ${day}` : base;
    }
    case 'yearly':
      return n === 1 ? t('jährlich') : t('alle {n} Jahre', { n });
  }
}

/** Zustand des Wiederholungs-Editors, unabhängig vom gespeicherten Format */
export interface RecurrenceEditor {
  mode: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'after';
  every: number;
  /** 1 = Montag … 7 = Sonntag */
  weekdays: number[];
  /** 1–31, -1 = letzter Tag, 0 = Tag des Termins */
  monthDay: number;
  unit: 'days' | 'weeks' | 'months';
}

export const emptyEditor = (): RecurrenceEditor => ({ mode: 'none', every: 1, weekdays: [], monthDay: 0, unit: 'days' });

export function editorFromRule(rule: Recurrence | null): RecurrenceEditor {
  if (!rule) return emptyEditor();
  if (rule.type === 'after_completion') return { ...emptyEditor(), mode: 'after', every: rule.every, unit: rule.unit };
  return {
    ...emptyEditor(),
    mode: rule.freq,
    every: rule.every,
    weekdays: rule.weekdays ?? [],
    monthDay: rule.monthDay ?? 0,
  };
}

/** Baut die Regel für die API. Fehlende Angaben werden aus dem Termin (Ortszeit) ergänzt. */
export function ruleFromEditor(e: RecurrenceEditor, dueIso: string, tz?: string): Recurrence | null {
  if (e.mode === 'none') return null;
  const every = Math.max(1, Math.floor(e.every) || 1);
  if (e.mode === 'after') return { type: 'after_completion', every, unit: e.unit };

  const local = toInputValue(dueIso, tz); // YYYY-MM-DDTHH:mm in Ortszeit
  const day = Number(local.slice(8, 10));
  const weekdayOfDue = ((new Date(`${local.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

  if (e.mode === 'weekly') {
    return { type: 'fixed', freq: 'weekly', every, weekdays: e.weekdays.length ? [...e.weekdays].sort((a, b) => a - b) : [weekdayOfDue] };
  }
  if (e.mode === 'monthly') return { type: 'fixed', freq: 'monthly', every, monthDay: e.monthDay === 0 ? day : e.monthDay };
  return { type: 'fixed', freq: e.mode, every };
}
