import type { FastifyRequest } from 'fastify';
import type { AccessResult } from './access.js';
import { ForbiddenError, ValidationError } from './errors.js';
import { t } from './i18n/index.js';

/**
 * Berechtigungen, die ein Administrator einzelnen Mitgliedern geben kann. Das ist die EINE Stelle dafür: Die Liste, die Prüfung
 * (`hasPermission`, `requirePermission`) und die Rechte-Regeln stehen hier; Routen fragen nie selbst nach Listen oder Rollen.
 *
 * Regeln (siehe dev/entwicklung.md, „Berechtigungen"):
 * - Ein Administrator hat immer alles; ein Kind hat nie etwas (feste Einschränkung); niemand außer Administratoren vergibt Rechte.
 * - Was Sicherheit oder Rechte betrifft, ist nicht delegierbar und bleibt bei `requireAdmin`: Administratorrechte, Rolle Kind,
 *   Berechtigungen selbst, Zugänge und Konten, Zugriffsmodus, Personen entfernen, Panel- und Dashboard-Pfad, Beta-Schalter,
 *   Umzug, ntfy-Thema und Push-Geräte anderer Personen.
 * - Neue delegierbare Rechte: hier eintragen, in der Oberfläche (lib/permissions.ts, Texte de/en) beschriften, Tests ergänzen.
 */
export const PERMISSIONS = [
  /** Wächter erstellen, bearbeiten, löschen, testen (samt Vorschlägen, Probelauf und Entitätssuche) */
  'watchers',
  /** Haus-Kanäle (Ansage, Lampe) und Haus-Einstellungen */
  'house',
  /** Standard-Fälligkeitszeit, Tageszusammenfassung, Symbole erkennen, fremde Vorlagen löschen (NICHT Panel-/Dashboard-Pfad) */
  'settings',
  /** Personen freigeben, Namen und Foto anderer ändern (NICHT Rollen, Konten, Rechte, Entfernen) */
  'people',
  /** Erledigt-Anfragen von Kindern bestätigen oder ablehnen (wie ein gewählter Bestätiger, für alle Kinder) */
  'confirm',
  /** Rückmeldungen der Nutzer lesen, den Stand ändern und löschen (samt Bildern) */
  'feedback',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const isPermission = (x: unknown): x is Permission => typeof x === 'string' && (PERMISSIONS as readonly string[]).includes(x);

/** Eine Liste aus einer Anfrage prüfen: nur bekannte Schlüssel, ohne Doppelte, in der festen Reihenfolge von `PERMISSIONS` */
export function cleanPermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) throw new ValidationError(t('Die Berechtigungen müssen eine Liste sein'));
  for (const key of raw) {
    if (!isPermission(key)) throw new ValidationError(t('Unbekannte Berechtigung: {key}', { key: String(key) }));
  }
  const set = new Set<unknown>(raw);
  return PERMISSIONS.filter((p) => set.has(p));
}

/** Darf diese Anfrage das? Administrator immer, Kind nie (beides steckt schon in `access.permissions`), Mitglied nach Eintrag */
export function hasPermission(access: Pick<AccessResult, 'permissions'> | null | undefined, key: Permission): boolean {
  return access?.permissions.includes(key) ?? false;
}

/** Für delegierbare Routen: 403, wenn die Berechtigung fehlt (Administratoren haben sie immer) */
export function requirePermission(req: FastifyRequest, key: Permission): void {
  if (!hasPermission(req.access, key)) throw new ForbiddenError(t('Dafür fehlt dir die Berechtigung'));
}
