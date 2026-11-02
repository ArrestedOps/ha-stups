import { i18n } from './index.svelte';

/**
 * Namen von Wochentagen und Monaten je Sprache. Sie stehen hier als Listen und nicht im Katalog, weil kurze Schlüssel wie „Mo"
 * oder „Mai" mehrdeutig wären. Wochentage ab Sonntag (wie `Date.getUTCDay()`), Monate ab Januar.
 */
const DE = {
  weekdaysShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  weekdaysLong: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  monthsShort: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  monthsLong: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
};
const EN = {
  weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  weekdaysLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

export const names = () => (i18n.lang === 'de' ? DE : EN);

/** Tag des Monats: „5." auf Deutsch, „5" auf Englisch */
export const dayOfMonth = (d: number): string => (i18n.lang === 'de' ? `${d}.` : String(d));
