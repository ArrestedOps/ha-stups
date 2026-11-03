import { mount } from 'svelte';
import '@fontsource-variable/bricolage-grotesque';
import './app.css';
import App from './App.svelte';

// Eingebettet in Home Assistant (iframe): Statusleiste und Home-Balken hält die Companion App schon frei, siehe app.css
try {
  if (window.parent !== window) document.documentElement.classList.add('embedded');
} catch {
  /* kein Zugriff auf das übergeordnete Fenster: dann sicher ein iframe */
  document.documentElement.classList.add('embedded');
}

mount(App, { target: document.getElementById('app')! });
