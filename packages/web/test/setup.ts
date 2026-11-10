import { beforeEach } from 'vitest';
import { loadCatalog, setLanguage } from '../src/lib/i18n/index.svelte';

// Die bestehenden Tests prüfen deutsche Texte: Jeder Test beginnt auf Deutsch (Englisch stellt er selbst ein).
// Auch schon beim Einsammeln der Tests, denn manche rechnen ihre Erwartung im Rumpf von describe aus.
setLanguage('de');
beforeEach(() => setLanguage('de'));

// Der englische Katalog kommt in der App als eigenes Paket; die Tests brauchen ihn sofort, wenn sie auf Englisch umstellen.
await loadCatalog();
