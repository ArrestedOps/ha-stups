import { api } from '../api';
import { applyAccent, type Scheme } from '../accent';
import { i18n, type LanguageChoice, languageFromStorage, loadCatalog, resolveLanguage, setLanguage } from '../i18n/index.svelte';
import { memo } from './memo';
import { ui } from './state.svelte';
import { errorText, toast } from './toasts';

// ---------- Sprache ----------

export const LANGUAGE_KEY = 'stups.language';

/** Vor dem ersten Bild: Wer Englisch nutzt, bekommt den englischen Katalog schon geladen (sonst blitzte kurz Deutsch auf); wer Deutsch nutzt, lädt ihn nie */
export async function preloadLanguage(): Promise<void> {
  const choice = languageFromStorage(memo.get(LANGUAGE_KEY));
  const lang = resolveLanguage(choice, navigator.languages?.length ? navigator.languages : [navigator.language ?? '']);
  if (lang === 'en') await loadCatalog().catch(() => undefined);
}

/** Wendet die Wahl an (Automatisch: Sprache des Geräts) und merkt sie sich, damit schon die Anmeldeseite stimmt */
export function applyLanguage(choice: LanguageChoice): void {
  memo.set(LANGUAGE_KEY, choice);
  setLanguage(resolveLanguage(choice, navigator.languages?.length ? navigator.languages : [navigator.language ?? '']));
}

/** Die Person wählt in den Einstellungen eine Sprache */
export async function changeLanguage(choice: LanguageChoice): Promise<void> {
  applyLanguage(choice);
  if (ui.me) ui.me = { ...ui.me, languageChoice: choice, language: i18n.lang };
  try {
    await api.setLanguage(choice, i18n.lang);
  } catch (e) {
    toast(errorText(e), { tone: 'error' });
  }
}

// ---------- Akzentfarbe ----------

export const ACCENT_KEY = 'stups.accent';
let accentHue: number | null = null;
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const currentScheme = (): Scheme => (darkQuery?.matches === false ? 'light' : 'dark');
// Wechselt das Gerät zwischen Hell und Dunkel, wird die Farbe für das andere Thema neu gerechnet
darkQuery?.addEventListener('change', () => applyAccent(accentHue, currentScheme()));

/** Wendet den Farbton an (null: Orange) und merkt ihn sich, damit schon die Anmeldeseite stimmt */
export function applyAccentHue(hue: number | null): void {
  accentHue = hue;
  memo.set(ACCENT_KEY, hue === null ? '' : String(hue));
  applyAccent(hue, currentScheme());
}

/** Die Person wählt in den Einstellungen eine Farbe */
export async function changeAccent(hue: number | null): Promise<void> {
  applyAccentHue(hue);
  if (ui.me) ui.me = { ...ui.me, accentHue: hue };
  try {
    await api.setAccent(hue);
  } catch (e) {
    toast(errorText(e), { tone: 'error' });
  }
}
