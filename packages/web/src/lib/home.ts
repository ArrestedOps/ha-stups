import type { HomeItem } from './api';
import { t } from './i18n/index.svelte';

/** Die Wächter nach Phase sortiert, in der Reihenfolge der Seite (leere Abschnitte fehlen dort) */
export function homeSections(items: HomeItem[]): { waiting: HomeItem[]; running: HomeItem[]; soon: HomeItem[]; quiet: HomeItem[] } {
  const by = (phase: HomeItem['phase']) => items.filter((i) => i.phase === phase);
  // am längsten Wartende zuerst; was am längsten läuft, zuerst
  const bySince = (list: HomeItem[]) => [...list].sort((a, b) => (a.since ?? '').localeCompare(b.since ?? ''));
  return { waiting: bySince(by('waiting')), running: bySince(by('running')), soon: by('soon'), quiet: by('quiet') };
}

/** „seit 25 Min.", „seit 2 Std." (wie lange etwas schon läuft) */
export function durationText(sinceIso: string, nowMs = Date.now()): string {
  const min = Math.max(0, Math.floor((nowMs - Date.parse(sinceIso)) / 60_000));
  if (min < 1) return t('gerade erst');
  if (min < 60) return t('seit {n} Min.', { n: min });
  return t('seit {n} Std.', { n: Math.floor(min / 60) });
}

/** „offen seit 12 Min.", „offen seit 3 Std.", „gerade erst offen" (wie lange eine Karte vom Haus schon auf jemanden wartet) */
export function openSinceText(sinceIso: string, nowMs = Date.now()): string {
  const min = Math.max(0, Math.floor((nowMs - Date.parse(sinceIso)) / 60_000));
  if (min < 1) return t('gerade erst offen');
  if (min < 60) return t('offen seit {n} Min.', { n: min });
  return t('offen seit {n} Std.', { n: Math.floor(min / 60) });
}
