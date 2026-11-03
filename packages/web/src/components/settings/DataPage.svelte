<script lang="ts">
  import { api, ApiError } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { feat, openSheet, toast, ui } from '../../lib/store.svelte';
  import Group from '../Group.svelte';
  import Icon from '../Icon.svelte';
  import Row from '../Row.svelte';
  import Page from './Page.svelte';

  /** Papierkorb, Archiv (die auch im Board-Wechsler stehen) und der Umzug in eine andere App */
  let exporting = $state(false);
  async function exportData() {
    exporting = true;
    try {
      const res = await api.exportData();
      toast(t('Exportiert nach {dir} ({size} MB{files})', { dir: res.dir, size: (res.bytes / 1024 / 1024).toFixed(1), files: res.files ? t(', mit Anhängen') : '' }));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Export fehlgeschlagen'), { tone: 'error' });
    }
    exporting = false;
  }
</script>

<Page title={ui.isAdmin && feat.migration ? t('Papierkorb, Archiv, Umzug') : t('Papierkorb und Archiv')}>
  <Group title={t('Gelöschtes und Erledigtes')} hint={t('Der Papierkorb und das Archiv gehören zum gerade geöffneten Board.')}>
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type: 'trash' })}>
      <Icon name="trash" size={20} /><span class="flex-1">{t('Papierkorb')}</span><Icon name="chevron-right" size={18} />
    </button>
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type: 'archive' })}>
      <Icon name="archive" size={20} /><span class="flex-1">{t('Archiv')}</span><Icon name="chevron-right" size={18} />
    </button>
  </Group>

  {#if ui.isAdmin && feat.migration}
    <Group
      title={t('Umzug')}
      hint={t('Zieht Stups in Home Assistant auf eine andere Adresse um (zum Beispiel aus einem neuen Repository), kommen die Daten über diesen Export mit: Er legt Datenbank und Anhänge in /share/stups-umzug ab, die neue App übernimmt sie beim ersten Start.')}
    >
      <Row label={t('Daten exportieren')}>
        <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={exporting} onclick={exportData}>
          {exporting ? t('Exportiere …') : t('Nach /share')}
        </button>
      </Row>
    </Group>
  {/if}
</Page>
