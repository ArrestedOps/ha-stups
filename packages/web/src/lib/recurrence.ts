import { toInputValue } from './datetime';

export type Recurrence =
  | {
      type: 'fixed';
      freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
      every: number;
      weekdays?: number[];
      monthDay?: number;
    }
  | { type: 'after_completion'; every: number; unit: 'days' | 'weeks' | 'months' };

const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const UNIT_PLURAL = { days: 'Tage', weeks: 'Wochen', months: 'Monate' } as const;
const UNIT_EACH = { days: 'jeden Tag', weeks: 'jede Woche', months: 'jeden Monat' } as const;

export function describeRecurrence(rule: Recurrence): string {
  if (rule.type === 'after_completion') {
    return rule.every === 1
      ? `${UNIT_EACH[rule.unit]} nach Erledigung`
      : `alle ${rule.every} ${UNIT_PLURAL[rule.unit]} nach Erledigung`;
  }
  const n = rule.every;
  switch (rule.freq) {
    case 'daily':
      return n === 1 ? 'täglich' : `alle ${n} Tage`;
    case 'weekly': {
      const days = [...(rule.weekdays ?? [])].sort((a, b) => a - b);
      if (days.length === 0) return n === 1 ? 'wöchentlich' : `alle ${n} Wochen`;
      if (n === 1) {
        return days.length === 1 ? `jeden ${DAY_LONG[days[0]! - 1]}` : `jeden ${days.map((d) => DAY_SHORT[d - 1]).join(' + ')}`;
      }
      return `alle ${n} Wochen (${days.map((d) => DAY_SHORT[d - 1]).join(', ')})`;
    }
    case 'monthly': {
      const day = rule.monthDay === -1 ? 'am letzten Tag' : rule.monthDay ? `am ${rule.monthDay}.` : '';
      const base = n === 1 ? 'monatlich' : `alle ${n} Monate`;
      return day ? `${base} ${day}` : base;
    }
    case 'yearly':
      return n === 1 ? 'jährlich' : `alle ${n} Jahre`;
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
