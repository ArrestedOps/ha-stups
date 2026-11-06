import { currentLanguage, t } from './i18n/index.js';

/** Bekannte Zustände von Home Assistant in Worten (alles andere erscheint, wie es ist) */
function wordFor(state: string): string | null {
  switch (state) {
    case 'on':
      return t('an');
    case 'off':
      return t('aus');
    case 'home':
      return t('zu Hause');
    case 'not_home':
      return t('unterwegs');
    case 'open':
      return t('offen');
    case 'closed':
      return t('geschlossen');
    case 'locked':
      return t('verriegelt');
    case 'unlocked':
      return t('entriegelt');
    case 'unavailable':
      return t('nicht erreichbar');
    case 'unknown':
      return t('unbekannt');
    default:
      return null;
  }
}

/**
 * Der Zustand einer Entität für einen Satz: „aus", „zu Hause", „412 W", „3 %". Zahlen mit höchstens einer Nachkommastelle in der
 * Schreibweise der Sprache, dahinter die Einheit.
 */
export function stateText(state: string, unit?: string | null): string {
  const n = state.trim() !== '' ? Number(state) : NaN;
  if (Number.isFinite(n)) {
    const v = new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 1 }).format(n);
    return unit ? `${v} ${unit}` : v;
  }
  return wordFor(state) ?? state;
}
