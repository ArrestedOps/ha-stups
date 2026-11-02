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
};

export const DICTIONARIES: Record<string, Dictionary> = { de };
