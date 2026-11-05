import { t } from './i18n/index.svelte';

/**
 * Berechtigungen, die ein Administrator einzelnen Mitgliedern geben kann. Spiegelt server/src/permissions.ts (ein Test vergleicht die
 * Schlüssel); der Server entscheidet am Ende, die Oberfläche blendet nur aus und ein.
 * Nicht delegierbar (bleibt bei Administratoren): Administratorrechte, Rolle Kind, Berechtigungen selbst, Zugänge, Panel- und Dashboard-Pfad.
 */
export const PERMISSION_KEYS = ['watchers', 'house', 'settings', 'people', 'confirm'] as const;
export type Permission = (typeof PERMISSION_KEYS)[number];

export interface PermissionRow {
  key: Permission;
  title: string;
  hint: string;
}

/** Titel und kurze Erklärung je Berechtigung, in der Sprache der Oberfläche (zur Laufzeit, damit der Sprachwechsel greift) */
export function permissionRows(): PermissionRow[] {
  return [
    { key: 'watchers', title: t('Wächter'), hint: t('Wächter erstellen, bearbeiten, ausprobieren und löschen.') },
    { key: 'house', title: t('Ansage und Lampe'), hint: t('Lautsprecher und Lampen der Personen und den Sprachdienst einrichten.') },
    {
      key: 'settings',
      title: t('App-Einstellungen'),
      hint: t('Standard-Uhrzeit für Termine, Tageszusammenfassung, Symbole erkennen und Vorlagen löschen. Nicht dabei: Dashboard und Panel-Pfad.'),
    },
    { key: 'people', title: t('Personen'), hint: t('Personen freigeben und Anzeigenamen ändern. Nicht dabei: Rollen, Anmeldungen, Entfernen und Berechtigungen.') },
    { key: 'confirm', title: t('Bestätigen für Kinder'), hint: t('„Erledigt“-Anfragen aller Kinder bestätigen oder zurückgeben.') },
  ];
}

export interface PermissionCtx {
  isAdmin: boolean;
  isChild: boolean;
  /** Was der Server für diese Person meldet (Administrator: alles, Kind: nichts) */
  permissions: readonly string[];
}

/** Darf diese Person das? Ein Kind nie (auch nicht als eingetragener Administrator), ein Administrator immer, sonst nach Liste */
export function mayDo(ctx: PermissionCtx, key: Permission): boolean {
  if (ctx.isChild) return false;
  return ctx.isAdmin || ctx.permissions.includes(key);
}
