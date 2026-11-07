import { ValidationError } from '../errors.js';
import { type Recurrence } from '../recurrence.js';
import { CARRY_FIELDS, DEFAULT_CARRY, EFFORTS, ICON_COLORS, type CarryField, type Effort, type IconColor, type IconSource, type Priority } from './types.js';
import { DUE_RE, PRIORITIES } from './constants.js';
import { t } from '../i18n/index.js';

// Prüfung von Eingaben: wirft ValidationError mit einer verständlichen Meldung
export function cleanText(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ValidationError(t('{what} fehlt', { what }));
  const text = value.trim();
  if (text.length > max) throw new ValidationError(t('{what} ist zu lang (höchstens {max} Zeichen)', { what, max }));
  return text;
}

/** Freier Text oder `null`/fehlend (Beschreibung, Symbol, Farbe): alles andere ist ein Fehler, nie ein Wert für die Datenbank */
export function optionalText(value: unknown, what: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new ValidationError(t('{what} muss Text sein', { what }));
  if (value.length > max) throw new ValidationError(t('{what} ist zu lang (höchstens {max} Zeichen)', { what, max }));
  return value;
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

/** Aufwand: klein, mittel, groß; nicht angegeben oder null = leer */
export function parseEffort(value: unknown): Effort | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !EFFORTS.includes(value as Effort)) throw new ValidationError(t('Der Aufwand muss klein, mittel oder groß sein'));
  return value as Effort;
}

/** Name eines Symbols (mdi-Name ohne Präfix, z. B. `washing-machine`); ob er zur Bibliothek der Oberfläche gehört, weiß nur sie (unbekannt = Standardsymbol) */
export const ICON_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function parseIcon(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 48 || !ICON_RE.test(value)) throw new ValidationError(t('Das Symbol ist ungültig'));
  return value;
}

export function parseIconColor(value: unknown): IconColor | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !ICON_COLORS.includes(value as IconColor)) throw new ValidationError(t('Die Farbe des Symbols ist unbekannt'));
  return value as IconColor;
}

export function parseIconSource(value: unknown): IconSource | null {
  if (value === null || value === undefined) return null;
  if (value !== 'auto' && value !== 'manual') throw new ValidationError(t('Die Quelle des Symbols muss auto oder manual sein'));
  return value;
}

/** „Bestätigung" an einer Karte: ein = braucht sie, aus = braucht sie nicht, leer = Vorgabe der zuständigen Person */
export function parseConfirm(value: unknown): 'on' | 'off' | null {
  if (value === null || value === undefined) return null;
  if (value !== 'on' && value !== 'off') throw new ValidationError(t('Die Bestätigung muss ein, aus oder leer (Vorgabe) sein'));
  return value;
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

/** Obergrenze für „alle n …“: darüber rechnet der nächste Termin ins Ungültige, und die Karte ließe sich nie mehr erledigen */
const MAX_EVERY = 999;
const MAX_TOLERANCE = 365;

export function parseRecurrence(value: unknown): Recurrence | null {
  if (value === null || value === undefined) return null;
  const r = value as Record<string, unknown>;
  const bad = () => new ValidationError(t('Die Wiederholung ist ungültig'));
  if (typeof r !== 'object' || Array.isArray(r)) throw bad();
  if (r.type === 'fixed') {
    if (!['hourly', 'daily', 'weekly', 'monthly', 'yearly'].includes(r.freq as string) || !isPosInt(r.every) || r.every > MAX_EVERY) throw bad();
    if (r.weekdays !== undefined) {
      if (!Array.isArray(r.weekdays) || r.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw bad();
    }
    if (r.monthDay !== undefined) {
      if (!Number.isInteger(r.monthDay) || (r.monthDay !== -1 && ((r.monthDay as number) < 1 || (r.monthDay as number) > 31))) {
        throw bad();
      }
    }
    if (r.lateTolerance !== undefined) {
      const lt = r.lateTolerance;
      if (!['weekly', 'monthly'].includes(r.freq as string) || typeof lt !== 'number' || !Number.isInteger(lt) || lt < 0 || lt > MAX_TOLERANCE) throw bad();
    }
    let window: { from: string; to: string } | undefined;
    if (r.window !== undefined) {
      const w = r.window as Record<string, unknown>;
      const time = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
      if (r.freq !== 'hourly' || typeof w !== 'object' || w === null || Array.isArray(w) || !time(w.from) || !time(w.to) || w.from >= w.to) throw bad();
      window = { from: w.from, to: w.to };
    }
    // nur bekannte Felder werden gespeichert
    return {
      type: 'fixed',
      freq: r.freq as 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly',
      every: r.every,
      ...(r.lateTolerance !== undefined ? { lateTolerance: r.lateTolerance as number } : {}),
      ...(window ? { window } : {}),
      ...(r.weekdays !== undefined ? { weekdays: r.weekdays as number[] } : {}),
      ...(r.monthDay !== undefined ? { monthDay: r.monthDay as number } : {}),
    };
  }
  if (r.type === 'after_completion') {
    if (!isPosInt(r.every) || r.every > MAX_EVERY || !['hours', 'days', 'weeks', 'months'].includes(r.unit as string)) throw bad();
    return { type: 'after_completion', every: r.every, unit: r.unit as 'hours' | 'days' | 'weeks' | 'months' };
  }
  throw bad();
}
