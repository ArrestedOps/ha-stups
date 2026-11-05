import { ValidationError } from './errors.js';
import { t } from './i18n/index.js';

export const DASHBOARD_PATH_MAX = 200;

/** Ist das ein Pfad auf Home Assistant selbst? Beginnt mit „/", kein „//", kein Schema, kein „\", keine Steuerzeichen oder Leerzeichen, höchstens 200 Zeichen. */
export function isDashboardPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= DASHBOARD_PATH_MAX &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('://') &&
    ![...value].some((ch) => ch <= ' ' || ch === '\u007f')
  );
}

/** Prüft die Wahl einer Person: null (= Standard) oder ein gültiger Pfad; sonst 400 */
export function checkDashboardPath(value: unknown): string | null {
  if (value === null) return null;
  if (!isDashboardPath(value)) {
    throw new ValidationError(t('Der Pfad muss mit / beginnen, darf höchstens {max} Zeichen haben und keine Adresse oder Leerzeichen enthalten', { max: DASHBOARD_PATH_MAX }));
  }
  return value;
}
