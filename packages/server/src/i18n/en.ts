/**
 * Englische Texte des Servers. Der Schlüssel ist der deutsche Text, wie er im Quelltext in t('…') steht.
 * Platzhalter {name} bleiben in beiden Sprachen gleich; Mehrzahlen (tn) sind Paare [eins, andere] mit {n}.
 * Ein Test (i18n-coverage.test.ts) hält die Datei mit dem Quelltext vollständig.
 */
export type Catalog = Record<string, string | [string, string]>;

export const en: Catalog = {
  'Kein Zugriff': 'No access',
  'Nicht gefunden': 'Not found',
  'Interner Fehler': 'Internal error',
  'Das dürfen nur Administratoren': 'Only administrators may do this',
  'Kein Zugriff: Bitte einen Administrator, dich freizugeben': 'No access: please ask an administrator to approve you',
};
