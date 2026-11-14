import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import {
  cleanText,
  isPosInt,
  optionalText,
  parseCarryOver,
  parseConfirm,
  parseCost,
  parseDue,
  parseEffort,
  parseIcon,
  parseIconColor,
  parseIconSource,
  parsePriority,
  parseRecurrence,
  parseRemind,
  resolveCarry,
} from '../src/store/validate.js';
import { DEFAULT_CARRY } from '../src/store/types.js';

/** Erwartet eine ValidationError (400) mit genau dieser Meldung */
function expectInvalid(fn: () => unknown, message: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ValidationError);
  expect((caught as ValidationError).message).toBe(message);
  expect((caught as ValidationError).status).toBe(400);
}

const REC_MSG = 'Die Wiederholung ist ungültig';
const fixed = (extra: Record<string, unknown> = {}) => ({ type: 'fixed', freq: 'daily', every: 1, ...extra });

describe('cleanText und optionalText', () => {
  it('cleanText: schneidet Leerraum ab und prüft die Länge am gekürzten Text', () => {
    expect(cleanText('  abc  ', 'Titel', 3)).toBe('abc');
    expectInvalid(() => cleanText('abcd', 'Titel', 3), 'Titel ist zu lang (höchstens 3 Zeichen)');
    expectInvalid(() => cleanText('   ', 'Titel', 3), 'Titel fehlt');
  });

  it('optionalText: leer ist null, Nicht-Text und zu langer Text werfen mit Meldung', () => {
    expect(optionalText(undefined, 'Notiz', 3)).toBeNull();
    expect(optionalText(null, 'Notiz', 3)).toBeNull();
    expect(optionalText('abc', 'Notiz', 3)).toBe('abc');
    expectInvalid(() => optionalText(5, 'Notiz', 3), 'Notiz muss Text sein');
    expectInvalid(() => optionalText('abcd', 'Notiz', 3), 'Notiz ist zu lang (höchstens 3 Zeichen)');
  });
});

describe('einfache Felder', () => {
  it('parseDue: Datum mit Zeitzone wird nach UTC normalisiert, alles andere wirft', () => {
    expect(parseDue(undefined)).toBeNull();
    expect(parseDue(null)).toBeNull();
    expect(parseDue('2026-11-03T10:00:00+01:00')).toBe('2026-11-03T09:00:00.000Z');
    const msg = 'Die Fälligkeit braucht Datum und Uhrzeit mit Zeitzone';
    expectInvalid(() => parseDue('2026-11-03'), msg);
    expectInvalid(() => parseDue(5), msg);
    expectInvalid(() => parseDue('2026-13-45T10:00:00Z'), msg);
  });

  it('parsePriority: nur low, medium, high', () => {
    expect(parsePriority(undefined)).toBeNull();
    expect(parsePriority(null)).toBeNull();
    expect(parsePriority('high')).toBe('high');
    const msg = 'Priorität muss low, medium oder high sein';
    expectInvalid(() => parsePriority('urgent'), msg);
    expectInvalid(() => parsePriority(1), msg);
  });

  it('parseRemind: ganze Minuten von 1 bis 43200', () => {
    expect(parseRemind(undefined)).toBeNull();
    expect(parseRemind(null)).toBeNull();
    expect(parseRemind(1)).toBe(1);
    expect(parseRemind(43_200)).toBe(43_200);
    const msg = 'Die Vorab-Erinnerung muss zwischen 1 Minute und 30 Tagen liegen';
    expectInvalid(() => parseRemind(0), msg);
    expectInvalid(() => parseRemind(43_201), msg);
    expectInvalid(() => parseRemind(1.5), msg);
    expectInvalid(() => parseRemind('5'), msg);
  });

  it('parseEffort: leer ist null, unbekannt wirft', () => {
    expect(parseEffort(undefined)).toBeNull();
    expect(parseEffort('medium')).toBe('medium');
    expectInvalid(() => parseEffort('huge'), 'Der Aufwand muss klein, mittel oder groß sein');
  });

  it('parseIcon: Kleinbuchstaben, Ziffern, Bindestriche, höchstens 48 Zeichen', () => {
    expect(parseIcon(undefined)).toBeNull();
    expect(parseIcon('washing-machine')).toBe('washing-machine');
    expect(parseIcon('a'.repeat(48))).toBe('a'.repeat(48));
    const msg = 'Das Symbol ist ungültig';
    expectInvalid(() => parseIcon('a'.repeat(49)), msg);
    expectInvalid(() => parseIcon('Washing'), msg);
    expectInvalid(() => parseIcon(7), msg);
  });

  it('parseIconColor: leer ist null, unbekannte Farbe wirft', () => {
    expect(parseIconColor(undefined)).toBeNull();
    expect(parseIconColor(null)).toBeNull();
    expect(parseIconColor('teal')).toBe('teal');
    expectInvalid(() => parseIconColor('pink'), 'Die Farbe des Symbols ist unbekannt');
  });

  it('parseIconSource: auto, manual oder leer', () => {
    expect(parseIconSource(undefined)).toBeNull();
    expect(parseIconSource('manual')).toBe('manual');
    expectInvalid(() => parseIconSource('x'), 'Die Quelle des Symbols muss auto oder manual sein');
  });

  it('parseConfirm: on, off oder leer', () => {
    expect(parseConfirm(undefined)).toBeNull();
    expect(parseConfirm(null)).toBeNull();
    expect(parseConfirm('off')).toBe('off');
    expectInvalid(() => parseConfirm('maybe'), 'Die Bestätigung muss ein, aus oder leer (Vorgabe) sein');
  });

  it('parseCost: ganze Cent von 0 bis 1 Milliarde', () => {
    expect(parseCost(undefined)).toBeNull();
    expect(parseCost(null)).toBeNull();
    expect(parseCost(0)).toBe(0);
    expect(parseCost(1_000_000_000)).toBe(1_000_000_000);
    const msg = 'Die Kosten müssen eine nicht negative Zahl in Cent sein';
    expectInvalid(() => parseCost(-1), msg);
    expectInvalid(() => parseCost(1_000_000_001), msg);
    expectInvalid(() => parseCost(1.5), msg);
  });
});

describe('Übernahme-Felder', () => {
  it('parseCarryOver: undefined und null bleiben, Liste wird ohne Doppelte geprüft', () => {
    expect(parseCarryOver(undefined)).toBeUndefined();
    expect(parseCarryOver(null)).toBeNull();
    expect(parseCarryOver([])).toStrictEqual([]);
    expect(parseCarryOver(['cost', 'description', 'cost'])).toStrictEqual(['cost', 'description']);
    expectInvalid(() => parseCarryOver('cost'), 'Die Übernahme-Felder müssen eine Liste sein');
    expectInvalid(() => parseCarryOver(['cost', 'bogus']), 'Unbekanntes Feld bei der Wiederholung');
    expectInvalid(() => parseCarryOver([5]), 'Unbekanntes Feld bei der Wiederholung');
  });

  it('resolveCarry: leer, kaputt oder keine Liste ergibt die Voreinstellung, sonst nur bekannte Felder', () => {
    expect(resolveCarry(null)).toStrictEqual([...DEFAULT_CARRY]);
    expect(resolveCarry('')).toStrictEqual([...DEFAULT_CARRY]);
    expect(resolveCarry('kein json')).toStrictEqual([...DEFAULT_CARRY]);
    expect(resolveCarry('{"a":1}')).toStrictEqual([...DEFAULT_CARRY]);
    expect(resolveCarry('["comments","bogus","cost"]')).toStrictEqual(['comments', 'cost']);
    expect(resolveCarry('[]')).toStrictEqual([]);
  });

  it('resolveCarry: liefert eine Kopie, die Voreinstellung bleibt unverändert', () => {
    const before = [...DEFAULT_CARRY];
    resolveCarry(null).push('comments');
    resolveCarry('x').push('comments');
    resolveCarry('{}').push('comments');
    expect([...DEFAULT_CARRY]).toStrictEqual(before);
  });
});

describe('isPosInt', () => {
  it('nur ganze Zahlen ab 1', () => {
    expect(isPosInt(1)).toBe(true);
    expect(isPosInt(0)).toBe(false);
    expect(isPosInt(-3)).toBe(false);
    expect(isPosInt(1.5)).toBe(false);
    expect(isPosInt('3')).toBe(false);
  });
});

describe('parseRecurrence', () => {
  it('leer ist null', () => {
    expect(parseRecurrence(undefined)).toBeNull();
    expect(parseRecurrence(null)).toBeNull();
  });

  it('feste Wiederholung: nur bekannte Felder, keine leeren Schlüssel', () => {
    expect(parseRecurrence({ ...fixed(), extra: 'x' })).toStrictEqual({ type: 'fixed', freq: 'daily', every: 1 });
    for (const freq of ['hourly', 'daily', 'weekly', 'monthly', 'yearly']) {
      expect(parseRecurrence(fixed({ freq }))).toStrictEqual({ type: 'fixed', freq, every: 1 });
    }
  });

  it('feste Wiederholung: Takt und Häufigkeit werden geprüft', () => {
    expect(parseRecurrence(fixed({ every: 999 }))).toStrictEqual({ type: 'fixed', freq: 'daily', every: 999 });
    expectInvalid(() => parseRecurrence(fixed({ every: 1000 })), REC_MSG);
    expectInvalid(() => parseRecurrence(fixed({ every: 0 })), REC_MSG);
    expectInvalid(() => parseRecurrence(fixed({ freq: 'secondly' })), REC_MSG);
    expectInvalid(() => parseRecurrence({ type: 'fixed', every: 1 }), REC_MSG);
    expectInvalid(() => parseRecurrence({ type: 'fixed', freq: 'daily' }), REC_MSG);
  });

  it('Wochentage: 1 bis 7, ganze Zahlen, jeder einzelne zählt', () => {
    expect(parseRecurrence(fixed({ freq: 'weekly', weekdays: [1, 7] }))).toStrictEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [1, 7] });
    expect(parseRecurrence(fixed({ weekdays: [] }))).toStrictEqual({ type: 'fixed', freq: 'daily', every: 1, weekdays: [] });
    for (const weekdays of [[0], [8], [1, 0], [0, 1], [1.5], ['a'], 'mon', 3]) {
      expectInvalid(() => parseRecurrence(fixed({ weekdays })), REC_MSG);
    }
  });

  it('Monatstag: 1 bis 31 oder -1 für den letzten', () => {
    for (const monthDay of [1, 31, -1, 15]) {
      expect(parseRecurrence(fixed({ freq: 'monthly', monthDay }))).toStrictEqual({ type: 'fixed', freq: 'monthly', every: 1, monthDay });
    }
    for (const monthDay of [0, 32, -2, 1.5, '5', null]) {
      expectInvalid(() => parseRecurrence(fixed({ freq: 'monthly', monthDay })), REC_MSG);
    }
  });

  it('Verspätungstoleranz: nur wöchentlich oder monatlich, 0 bis 365 ganze Tage', () => {
    for (const freq of ['weekly', 'monthly']) {
      expect(parseRecurrence(fixed({ freq, lateTolerance: 0 }))).toStrictEqual({ type: 'fixed', freq, every: 1, lateTolerance: 0 });
      expect(parseRecurrence(fixed({ freq, lateTolerance: 365 }))).toStrictEqual({ type: 'fixed', freq, every: 1, lateTolerance: 365 });
    }
    for (const freq of ['hourly', 'daily', 'yearly']) {
      expectInvalid(() => parseRecurrence(fixed({ freq, lateTolerance: 3 })), REC_MSG);
    }
    for (const lateTolerance of [-1, 366, 1.5, '3', null]) {
      expectInvalid(() => parseRecurrence(fixed({ freq: 'weekly', lateTolerance })), REC_MSG);
    }
  });

  it('Zeitfenster: nur stündlich, gültige Uhrzeiten, von vor bis', () => {
    expect(parseRecurrence(fixed({ freq: 'hourly', window: { from: '08:00', to: '18:30', junk: 1 } }))).toStrictEqual({
      type: 'fixed',
      freq: 'hourly',
      every: 1,
      window: { from: '08:00', to: '18:30' },
    });
    const w = (window: unknown, freq = 'hourly') => () => parseRecurrence(fixed({ freq, window }));
    expectInvalid(w({ from: '08:00', to: '18:00' }, 'daily'), REC_MSG);
    expectInvalid(w(null), REC_MSG);
    expectInvalid(w([]), REC_MSG);
    expectInvalid(w('08:00'), REC_MSG);
    expectInvalid(w({ from: '18:00', to: '08:00' }), REC_MSG);
    expectInvalid(w({ from: '08:00', to: '08:00' }), REC_MSG);
    expectInvalid(w({ from: '8:00', to: '18:00' }), REC_MSG);
    expectInvalid(w({ from: '24:00', to: '23:59' }), REC_MSG);
    expectInvalid(w({ from: '08:60', to: '18:00' }), REC_MSG);
    expectInvalid(w({ from: 'x08:00', to: '18:00' }), REC_MSG);
    expectInvalid(w({ from: '08:00', to: '18:00x' }), REC_MSG);
    expectInvalid(w({ from: '08:00x', to: '18:00' }), REC_MSG);
    expectInvalid(w({ from: 'x08:00', to: '18:00' }), REC_MSG);
    expectInvalid(w({ from: 800, to: 1800 }), REC_MSG);
    expectInvalid(w({ from: ['08:00'], to: ['09:00'] }), REC_MSG);
    expectInvalid(w({ from: '08:00' }), REC_MSG);
  });

  it('Wiederholung nach Erledigen: Einheit und Häufigkeit', () => {
    expect(parseRecurrence({ type: 'after_completion', every: 999, unit: 'weeks', junk: 1 })).toStrictEqual({ type: 'after_completion', every: 999, unit: 'weeks' });
    for (const unit of ['hours', 'days', 'weeks', 'months']) {
      expect(parseRecurrence({ type: 'after_completion', every: 2, unit })).toStrictEqual({ type: 'after_completion', every: 2, unit });
    }
    expectInvalid(() => parseRecurrence({ type: 'after_completion', every: 1000, unit: 'days' }), REC_MSG);
    expectInvalid(() => parseRecurrence({ type: 'after_completion', every: 0, unit: 'days' }), REC_MSG);
    expectInvalid(() => parseRecurrence({ type: 'after_completion', every: 1, unit: 'years' }), REC_MSG);
    expectInvalid(() => parseRecurrence({ type: 'after_completion', every: 1 }), REC_MSG);
  });

  it('unbekannter Typ, Nicht-Objekt und Liste werfen', () => {
    expectInvalid(() => parseRecurrence({ type: 'bogus', every: 1, unit: 'days' }), REC_MSG);
    expectInvalid(() => parseRecurrence({}), REC_MSG);
    expectInvalid(() => parseRecurrence('daily'), REC_MSG);
    expectInvalid(() => parseRecurrence([]), REC_MSG);
    // Eine Liste mit Typ-Eigenschaft darf nicht als Objekt durchgehen
    expectInvalid(() => parseRecurrence(Object.assign([], { type: 'after_completion', every: 1, unit: 'days' })), REC_MSG);
  });
});
