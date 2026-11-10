import { mount } from 'svelte';
import './fonts.css';
import './app.css';
import App from './App.svelte';
import { browserSafeAreaEnv, startSafeArea } from './lib/haSafeArea';
import { preloadLanguage } from './lib/store.svelte';

// Eingebettet in Home Assistant (iframe): Statusleiste und Home-Balken hält die Companion App schon frei, siehe app.css
try {
  if (window.parent !== window) document.documentElement.classList.add('embedded');
} catch {
  /* kein Zugriff auf das übergeordnete Fenster: dann sicher ein iframe */
  document.documentElement.classList.add('embedded');
}

// Ab Home Assistant 2026.8 übernimmt Stups die Sicherheitsabstände selbst (sonst bleibt unter der Seite ein Streifen), siehe lib/haSafeArea.ts
startSafeArea(browserSafeAreaEnv());

// Der englische Katalog ist ein eigenes Paket: bei Englisch vor dem ersten Bild laden, bei Deutsch gar nicht
void preloadLanguage().then(() => mount(App, { target: document.getElementById('app')! }));
