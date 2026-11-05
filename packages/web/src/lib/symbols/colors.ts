import { t } from '../i18n/index.svelte';
import type { TileColor } from '../../components/ui/Tile.svelte';

/** Name einer Kachelfarbe (für Screenreader an den Farbpunkten) */
export function colorName(c: TileColor): string {
  switch (c) {
    case 'orange':
      return t('Orange');
    case 'blue':
      return t('Blau');
    case 'green':
      return t('Grün');
    case 'violet':
      return t('Violett');
    case 'purple':
      return t('Lila');
    case 'red':
      return t('Rot');
    case 'teal':
      return t('Türkis');
    case 'gray':
      return t('Grau');
  }
}
