/**
 * Wörter der Schnell-Eingabe, eine Sprache pro Eintrag. Die Regeln in index.ts kennen keine Wörter, nur diese Listen.
 * Eine neue Sprache braucht genau einen weiteren Eintrag mit allen Schlüsseln (ein Test prüft das).
 * Alles klein geschrieben; mehrere Wörter in einem Eintrag trennt ein Leerzeichen.
 */
export type Unit = 'day' | 'week' | 'month' | 'year';

export interface Dictionary {
  today: string[];
  tomorrow: string[];
  dayAfterTomorrow: string[];
  /** Montag bis Sonntag, je Tag alle Schreibweisen */
  weekdays: string[][];
  /** Januar bis Dezember, je Monat alle Schreibweisen (auch Abkürzungen) */
  months: string[][];
  /** „nächsten Montag" */
  next: string[];
  /** steht vor einem Datum und gehört dazu: „am Freitag", „bis 1.12." */
  datePrefix: string[];
  /** „um 19" */
  timePrefix: string[];
  /** „19 Uhr" */
  timeWord: string[];
  /** „in 3 Tagen" */
  in: string[];
  /** Einheiten nach „in 3 …" und „alle 3 …", mit Beugungen */
  units: Record<Unit, string[]>;
  /** „in einer Woche" */
  inOne: Record<Unit, string[]>;
  /** feste Wendungen: „jeden Tag", „täglich" */
  every: { daily: string[]; weekly: string[]; monthly: string[]; yearly: string[] };
  /** „jeden Montag" */
  everyWeekday: string[];
  /** „alle 2 Tage" */
  everyN: string[];
  important: string[];
  /** Uhrzeiten mit „am"/„pm" (steht dann auch in `timeWord`); null: nur 24 Stunden */
  meridiem: { am: string[]; pm: string[] } | null;
  /** „1. Dezember": der Tag trägt einen Punkt; sonst „1 December" und „1st December" */
  dayDot: boolean;
  /** Der Monat darf vor dem Tag stehen: „Dec 1" */
  monthFirst: boolean;
}

export const de: Dictionary = {
  today: ['heute'],
  tomorrow: ['morgen'],
  dayAfterTomorrow: ['übermorgen', 'ubermorgen'],
  weekdays: [['montag'], ['dienstag'], ['mittwoch'], ['donnerstag'], ['freitag'], ['samstag', 'sonnabend'], ['sonntag']],
  months: [
    ['januar', 'jan'],
    ['februar', 'feb'],
    ['märz', 'maerz', 'mär', 'mrz'],
    ['april', 'apr'],
    ['mai'],
    ['juni', 'jun'],
    ['juli', 'jul'],
    ['august', 'aug'],
    ['september', 'sept', 'sep'],
    ['oktober', 'okt'],
    ['november', 'nov'],
    ['dezember', 'dez'],
  ],
  next: ['nächsten', 'nächste', 'nächstes', 'kommenden', 'kommende'],
  datePrefix: ['am', 'bis'],
  timePrefix: ['um'],
  timeWord: ['uhr'],
  in: ['in'],
  units: {
    day: ['tag', 'tage', 'tagen'],
    week: ['woche', 'wochen'],
    month: ['monat', 'monate', 'monaten'],
    year: ['jahr', 'jahre', 'jahren'],
  },
  inOne: {
    day: ['einem tag'],
    week: ['einer woche'],
    month: ['einem monat'],
    year: ['einem jahr'],
  },
  every: {
    daily: ['jeden tag', 'täglich'],
    weekly: ['jede woche', 'wöchentlich'],
    monthly: ['jeden monat', 'monatlich'],
    yearly: ['jedes jahr', 'jährlich'],
  },
  everyWeekday: ['jeden'],
  everyN: ['alle'],
  important: ['wichtig'],
  meridiem: null,
  dayDot: true,
  monthFirst: false,
};

/**
 * Englisch: Wochentage nur ausgeschrieben (plus „tues", „thurs", „fri"), damit „Sun cream" und „Wedding gift" Titel bleiben.
 * Zahlenschreibweisen wie „12/1" sind nicht dabei, denn sie bedeuten je nach Land etwas anderes.
 */
export const en: Dictionary = {
  today: ['today'],
  tomorrow: ['tomorrow', 'tmrw'],
  dayAfterTomorrow: ['day after tomorrow'],
  weekdays: [['monday'], ['tuesday', 'tues'], ['wednesday'], ['thursday', 'thurs'], ['friday', 'fri'], ['saturday'], ['sunday']],
  months: [
    ['january', 'jan'],
    ['february', 'feb'],
    ['march', 'mar'],
    ['april', 'apr'],
    ['may'],
    ['june', 'jun'],
    ['july', 'jul'],
    ['august', 'aug'],
    ['september', 'sept', 'sep'],
    ['october', 'oct'],
    ['november', 'nov'],
    ['december', 'dec'],
  ],
  next: ['next'],
  datePrefix: ['on', 'by'],
  timePrefix: ['at'],
  timeWord: ['am', 'pm'],
  in: ['in'],
  units: {
    day: ['day', 'days'],
    week: ['week', 'weeks'],
    month: ['month', 'months'],
    year: ['year', 'years'],
  },
  inOne: {
    day: ['a day', 'one day'],
    week: ['a week', 'one week'],
    month: ['a month', 'one month'],
    year: ['a year', 'one year'],
  },
  every: {
    daily: ['every day', 'daily'],
    weekly: ['every week', 'weekly'],
    monthly: ['every month', 'monthly'],
    yearly: ['every year', 'yearly', 'annually'],
  },
  everyWeekday: ['every'],
  everyN: ['every'],
  important: ['important', 'urgent'],
  meridiem: { am: ['am'], pm: ['pm'] },
  dayDot: false,
  monthFirst: true,
};

export const DICTIONARIES: Record<string, Dictionary> = { de, en };
