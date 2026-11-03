import { numberLocale } from './i18n/index.svelte';

/** Der Tag als YYYY-MM-DD in der Ortszeit des Geräts (für das Datumsfeld) */
export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Früheste und späteste Wahl für „Wenig Zeit": heute bis 90 Tage (wie im Server) */
export function busyRange(now = new Date()): { min: string; max: string } {
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
  return { min: dateKey(now), max: dateKey(max) };
}

/** „Fr., 6. Nov." für einen Tag YYYY-MM-DD (mittags gerechnet, damit keine Zeitzone den Tag verschiebt) */
export function formatBusy(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12).toLocaleDateString(numberLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
}
