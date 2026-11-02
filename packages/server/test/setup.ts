import { setDefaultLanguage } from '../src/i18n/index.js';

// Die bestehenden Tests prüfen deutsche Meldungen: ohne Angabe gilt in den Tests Deutsch (im Betrieb Englisch)
setDefaultLanguage('de');
