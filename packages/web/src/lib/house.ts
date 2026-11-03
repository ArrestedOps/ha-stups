import type { HouseResult } from './api';
import { t } from './i18n/index.svelte';

/** Was zuletzt mit einem Haus-Kanal geschah, als kurzer Text (ohne Uhrzeit); bei einem Fehler der verständliche Grund */
export function houseResultLabel(r: HouseResult): string {
  switch (r.result) {
    case 'delivered':
      return t('Zugestellt');
    case 'queued':
      return t('Wartet auf die Heimkehr');
    case 'skipped_away':
      return t('Verworfen, nicht zu Hause');
    case 'skipped_quiet':
      return t('Verworfen, Ruhezeit');
    case 'error':
      return r.error?.message ?? t('Fehler');
  }
}
