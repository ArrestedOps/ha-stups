import { currentLanguage } from './index.js';

/** Namen von Wochentagen (ab Sonntag, wie `Date.getUTCDay()`) und Monaten (ab Januar) in der Sprache der Anfrage oder des Empfängers */
const DE = {
  weekdaysShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  monthsShort: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
};
const EN = {
  weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export const names = () => (currentLanguage() === 'de' ? DE : EN);

/** Tag des Monats: „5." auf Deutsch, „5" auf Englisch */
export const dayOfMonth = (d: number): string => (currentLanguage() === 'de' ? `${d}.` : String(d));
