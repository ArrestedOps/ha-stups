import { catKey } from './colors';
import { t } from './i18n/index.svelte';

/** Die Farben für eine neue Kategorie, mit Namen in der gewählten Sprache (ruft `t` bei jedem Aufruf, also folgt der Sprachwechsel) */
export const categoryColors = (): [string, string][] => [
  ['orange', t('Orange')],
  ['blue', t('Blau')],
  ['green', t('Grün')],
  ['pink', t('Pink')],
  ['purple', t('Lila')],
  ['red', t('Rot')],
  ['teal', t('Türkis')],
];

/** Die erste Farbe, die im Board noch nicht vergeben ist (sonst Orange) */
export const nextCategoryColor = (used: string[]): string => categoryColors().map((c) => c[0]).find((c) => !used.includes(c)) ?? 'orange';

/** Der Punkt einer Kategorie in ihrer Farbe */
export const catDot = (color: string): string => `var(--c-${catKey(color)}-fg)`;

/** Der Rechnername eines Links für die Zeile („maps.google.com"), bei einem Fehler der Link selbst */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Ein Link ohne Schema bekommt https:// */
export const withScheme = (u: string): string => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`);
