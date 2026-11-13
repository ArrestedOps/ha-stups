<script lang="ts">
  import { api, ApiError } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { feat, openSheet, toast, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import SectionHeader from '../ui/SectionHeader.svelte';
  import Tile from '../ui/Tile.svelte';
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
  <div class="flex flex-col gap-3.5 pt-1">
    <div class="flex flex-col gap-2">
      <SectionHeader title={t('Gelöschtes und Erledigtes')} />
      <p class="-mt-1 px-1 text-[12.5px] leading-[1.45] text-hint">{t('Der Papierkorb und das Archiv gehören zum gerade geöffneten Board.')}</p>
      <ListRow title={t('Papierkorb')} label={t('Papierkorb')} onclick={() => openSheet({ type: 'trash' })}>
        {#snippet tile()}<Tile color="gray"><Icon name="trash" size={22} stroke={1.8} /></Tile>{/snippet}
        {#snippet meta()}{t('30 Tage wiederherstellbar')}{/snippet}
        {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
      </ListRow>
      <ListRow title={t('Archiv')} label={t('Archiv')} onclick={() => openSheet({ type: 'archive' })}>
        {#snippet tile()}<Tile color="gray"><Icon name="archive" size={22} stroke={1.8} /></Tile>{/snippet}
        {#snippet meta()}{t('erledigte Aufgaben dieses Boards')}{/snippet}
        {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
      </ListRow>
    </div>

    {#if ui.isAdmin && feat.migration}
      <div class="flex flex-col gap-2">
        <SectionHeader title={t('Umzug')} />
        <ListRow title={t('Umzug: Daten exportieren')}>
          {#snippet tile()}<Tile color="green"><Icon name="download" size={22} stroke={1.8} /></Tile>{/snippet}
          {#snippet meta()}{t('nach /share/stups-umzug')}{/snippet}
          {#snippet right()}
            <button class="bg-surface2 inline-flex h-[34px] shrink-0 items-center rounded-[12px] px-3 text-[13px] font-bold text-text-soft disabled:opacity-40" disabled={exporting} onclick={exportData}>
              {exporting ? t('Exportiere …') : t('Export')}
            </button>
          {/snippet}
        </ListRow>
        <p class="px-1 text-[12.5px] leading-[1.45] text-hint">
          {t('Zieht Stups in Home Assistant auf eine andere Adresse um (zum Beispiel aus einem neuen Repository), kommen die Daten über diesen Export mit: Er legt Datenbank und Anhänge in /share/stups-umzug ab, die neue App übernimmt sie beim ersten Start.')}
        </p>
      </div>
    {/if}
  </div>
</Page>
