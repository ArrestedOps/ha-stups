<script lang="ts">
  import { applyHeaderHiding, isHeaderHidingWanted, setHeaderHidingWanted, showHaHeader } from '../../lib/hideHaHeader';
  import { t } from '../../lib/i18n/index.svelte';
  import Group from '../Group.svelte';
  import Row from '../Row.svelte';
  import Toggle from '../ui/Toggle.svelte';

  /** Blendet die Kopfzeile von Home Assistant über der App aus (gilt nur für dieses Gerät) */
  let headerHidden = $state(isHeaderHidingWanted());
</script>

<Group title={t('Darstellung')} hint={t('Blendet die Kopfzeile von Home Assistant (Titel und Menü) über der App aus. Falls die App danach falsch aussieht, hier wieder ausschalten.')}>
  <Row label={t('HA-Kopfzeile ausblenden')}>
    <Toggle
      checked={headerHidden}
      label={t('Kopfzeile von Home Assistant ausblenden')}
      onchange={(on) => {
        headerHidden = on;
        setHeaderHidingWanted(headerHidden);
        if (headerHidden) applyHeaderHiding();
        else showHaHeader();
      }}
    />
  </Row>
</Group>
