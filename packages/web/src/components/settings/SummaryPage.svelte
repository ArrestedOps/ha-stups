<script lang="ts">
  import { api } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { act, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import Tile from '../ui/Tile.svelte';
  import Page from './Page.svelte';

  /**
   * Tageszusammenfassung: ab welcher Uhrzeit Stups morgens aufzählt, was heute und überfällig ist. Die Uhrzeit aus der App hat Vorrang vor der
   * Option des Add-ons (`daily_summary_time`); „zurücksetzen" lässt wieder die Option gelten. Nur Administratoren ändern sie.
   */
  const effective = $derived(ui.settings?.effectiveDailySummaryTime ?? '08:00');
  const own = $derived(ui.settings?.dailySummaryTime ?? null);
  const fallback = $derived(ui.settings?.defaultDailySummaryTime ?? '08:00');

  async function save(value: string | null) {
    const settings = await act(() => api.saveSettings({ dailySummaryTime: value === '' ? null : value }));
    if (settings) ui.settings = settings;
  }
</script>

<Page title={t('Tageszusammenfassung')}>
  <div class="flex flex-col gap-3.5 pt-1">
    <p class="px-1 text-[14px] leading-[1.45] text-hint">
      {t('Ab dieser Uhrzeit bekommt jede Person morgens eine Nachricht, was heute fällig und überfällig ist. Ist nichts offen, bleibt Stups still. Die Uhrzeit gilt für alle; nur Administratoren ändern sie.')}
    </p>
    <div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3">
      <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="summary-time">{t('Uhrzeit')}</label>
      <input
        id="summary-time"
        type="time"
        class="block min-h-6 w-full bg-transparent p-0 text-[16px] font-semibold outline-none disabled:opacity-60"
        value={effective}
        disabled={!ui.isAdmin}
        aria-label={t('Uhrzeit der Tageszusammenfassung')}
        onchange={(e) => void save(e.currentTarget.value)}
      />
    </div>
    {#if own !== null && ui.isAdmin}
      <ListRow title={t('Zurücksetzen')} onclick={() => void save(null)}>
        {#snippet tile()}<Tile color="gray"><Icon name="undo" size={22} stroke={1.8} /></Tile>{/snippet}
        {#snippet meta()}{t('Wieder die Uhrzeit aus der Konfiguration der App nehmen ({time})', { time: fallback })}{/snippet}
      </ListRow>
    {:else}
      <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Gerade gilt die Uhrzeit aus der Konfiguration der App ({time}).', { time: fallback })}</p>
    {/if}
  </div>
</Page>
