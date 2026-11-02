/**
 * Englische Texte. Der Schlüssel ist der deutsche Text, wie er im Quelltext in t('…') steht.
 * Platzhalter {name} bleiben in beiden Sprachen gleich; Mehrzahlen (tn) sind Paare [eins, andere] mit {n}.
 * Ein Test (i18n-coverage.test.ts) hält die Datei mit dem Quelltext vollständig.
 */
export type Catalog = Record<string, string | [string, string]>;

export const en: Catalog = {
  // Einstellungen › Sprache
  Sprache: 'Language',
  'Gilt auf allen deinen Geräten und für Push-Nachrichten. „Automatisch“ folgt der Sprache des Geräts.': 'Applies to all your devices and to push notifications. “Automatic” follows the language of the device.',
  Automatisch: 'Automatic',

  // Zeiten und Zähler (lib/datetime.ts, lib/schedule.ts)
  'heute {time}': 'today {time}',
  'morgen {time}': 'tomorrow {time}',
  'gestern {time}': 'yesterday {time}',
  '{n} Tag': ['{n} day', '{n} days'],
  '{n} Std.': '{n} h',
  '{n} Min.': '{n} min',
  heute: 'today',
  gestern: 'yesterday',
  'vor {n} Tagen': '{n} days ago',
  '{n} Karte': ['{n} card', '{n} cards'],
  Überfällig: 'Overdue',
  Heute: 'Today',
  Morgen: 'Tomorrow',
  Gestern: 'Yesterday',

  // Verlauf einer Karte (lib/activity.ts)
  ' (per Push)': ' (via push)',
  Angelegt: 'Created',
  'Gestupst: {to}': 'Nudged: {to}',
  Antwort: 'Reply',
  'Aus Wiederholung angelegt': 'Created from a repeat',
  Wächter: 'Watcher',
  Erledigt: 'Done',
  'Verschoben: {from} → {to}': 'Moved: {from} → {to}',
  'Wieder geöffnet: {to}': 'Reopened: {to}',
  'Wieder geöffnet': 'Reopened',
  'Termin entfernt': 'Due date removed',
  'Termin gesetzt: {due}': 'Due date set: {due}',
  'Termin: {from} → {to}': 'Due: {from} → {to}',

  // Schnell-Eingabe: Chips und Hinweise (lib/quickadd/labels.ts)
  'Priorität hoch': 'High priority',
  'Priorität mittel': 'Medium priority',
  '„{value}" unbekannt': '“{value}” unknown',
  '„{value}" nicht eindeutig': '“{value}” ambiguous',
  'neu: {value}': 'new: {value}',
  'Eine Person „{value}" gibt es nicht. Tippe auf den Chip, um es wegzulassen, oder schreibe den Namen anders.':
    'There is no person “{value}”. Tap the chip to leave it out, or write the name differently.',
  '„{value}" passt auf mehrere Personen. Schreibe etwas mehr vom Namen oder tippe auf den Chip, um es wegzulassen.':
    '“{value}” matches several people. Write more of the name or tap the chip to leave it out.',

  // Stupsen (lib/nudge.ts)
  'hat kein Push-Gerät': 'has no push device',
  'wieder ab {time}': 'again from {time}',
  'wird um {time} zugestellt': 'delivered at {time}',
  'Gestupst!': 'Nudged!',
  '{names} bekommt es um {time}.': '{names} will get it at {time}.',
  '{names}: erst wieder ab {time}.': '{names}: not before {time}.',
};
