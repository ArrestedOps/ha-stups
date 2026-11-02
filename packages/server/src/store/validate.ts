import { ValidationError } from '../errors.js';
import { type Recurrence } from '../recurrence.js';
import { CARRY_FIELDS, DEFAULT_CARRY, type CarryField, type Priority } from './types.js';
import { DUE_RE, PRIORITIES } from './constants.js';
import { t } from '../i18n/index.js';

// Prüfung von Eingaben: wirft ValidationError mit einer verständlichen Meldung
export function cleanText(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ValidationError(t('{what} fehlt', { what }));
  const text = value.trim();
  if (text.length > max) throw new ValidationError(t('{what} ist zu lang (höchstens {max} Zeichen)', { what, max }));
  return text;
}

export function parseDue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !DUE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(t('Die Fälligkeit braucht Datum und Uhrzeit mit Zeitzone'));
  }
  return new Date(value).toISOString();
}

export function parsePriority(value: unknown): Priority | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !PRIORITIES.includes(value)) {
    throw new ValidationError(t('Priorität muss low, medium oder high sein'));
  }
  return value as Priority;
}

export function parseRemind(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 43_200) {
    throw new ValidationError(t('Die Vorab-Erinnerung muss zwischen 1 Minute und 30 Tagen liegen'));
  }
  return value as number;
}

export function parseCost(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000_000) {
    throw new ValidationError(t('Die Kosten müssen eine nicht negative Zahl in Cent sein'));
  }
  return value as number;
}

/** undefined = nicht angegeben, null = Voreinstellung, sonst eine geprüfte Liste ohne Doppelte */
export function parseCarryOver(value: unknown): CarryField[] | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value)) throw new ValidationError(t('Die Übernahme-Felder müssen eine Liste sein'));
  const out: CarryField[] = [];
  for (const v of value) {
    if (typeof v !== 'string' || !(CARRY_FIELDS as readonly string[]).includes(v)) {
      throw new ValidationError(t('Unbekanntes Feld bei der Wiederholung'));
    }
    if (!out.includes(v as CarryField)) out.push(v as CarryField);
  }
  return out;
}

/** Gespeicherte Auswahl (JSON oder null) als Liste, bei null die Voreinstellung */
export function resolveCarry(raw: string | null | undefined): CarryField[] {
  if (!raw) return [...DEFAULT_CARRY];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((v): v is CarryField => (CARRY_FIELDS as readonly string[]).includes(v)) : [...DEFAULT_CARRY];
  } catch {
    return [...DEFAULT_CARRY];
  }
}

export function parseBool(value: unknown, what: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new ValidationError(t('{what} muss wahr oder falsch sein', { what }));
  return value;
}

export function isPosInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

export function parseRecurrence(value: unknown): Recurrence | null {
  if (value === null || value === undefined) return null;
  const r = value as Record<string, unknown>;
  const bad = () => new ValidationError(t('Die Wiederholung ist ungültig'));
  if (typeof r !== 'object') throw bad();
  if (r.type === 'fixed') {
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq as string) || !isPosInt(r.every)) throw bad();
    if (r.weekdays !== undefined) {
      if (!Array.isArray(r.weekdays) || r.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw bad();
    }
    if (r.monthDay !== undefined) {
      if (!Number.isInteger(r.monthDay) || (r.monthDay !== -1 && ((r.monthDay as number) < 1 || (r.monthDay as number) > 31))) {
        throw bad();
      }
    }
    return value as Recurrence;
  }
  if (r.type === 'after_completion') {
    if (!isPosInt(r.every) || !['days', 'weeks', 'months'].includes(r.unit as string)) throw bad();
    return value as Recurrence;
  }
  throw bad();
}
