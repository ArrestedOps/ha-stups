<script lang="ts">
  import { api } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { act, can, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import Tile from '../ui/Tile.svelte';
  import Page from './Page.svelte';

  /**
   * Nachhaken um …: die Uhrzeit, zu der ein Nachhaken in Tagen oder Wochen kommt, wenn es keine eigene Uhrzeit hat. Die Uhrzeit aus der App
   * hat Vorrang vor der Standard-Uhrzeit (18:00); „Zurücksetzen“ lässt wieder die Standard-Uhrzeit gelten. Ändern dürfen Administratoren
   * und wer die Berechtigung „App-Einstellungen“ hat.
   */
  const effective = $derived(ui.settings?.effectiveOverdueNagTime ?? '18:00');
  const own = $derived(ui.settings?.overdueNagTime ?? null);
  const fallback = $derived(ui.settings?.defaultOverdueNagTime ?? '18:00');

  async function save(value: string | null) {
    const settings = await act(() => api.saveSettings({ overdueNagTime: value === '' ? null : value }));
    if (settings) ui.settings = settings;
  }
</script>

<Page title={t('Nachhaken um …')}>
  <div class="flex flex-col gap-3.5 pt-1">
    <p class="px-1 text-[14px] leading-[1.45] text-hint">
      {t('Wenn ein Nachhaken in Tagen oder Wochen keine eigene Uhrzeit hat, kommt es zu dieser Uhrzeit. Die Uhrzeit gilt für alle; das ändern Administratoren und wer die Berechtigung „App-Einstellungen“ hat.')}
    </p>
    <div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3">
      <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="nag-time">{t('Uhrzeit')}</label>
      <input
        id="nag-time"
        type="time"
        class="block min-h-6 w-full bg-transparent p-0 text-[16px] font-semibold outline-none disabled:opacity-60"
        value={effective}
        disabled={!can('settings')}
        aria-label={t('Uhrzeit des Nachhakens')}
        onchange={(e) => void save(e.currentTarget.value)}
      />
    </div>
    {#if own !== null && can('settings')}
      <ListRow title={t('Zurücksetzen')} onclick={() => void save(null)}>
        {#snippet tile()}<Tile color="gray"><Icon name="undo" size={22} stroke={1.8} /></Tile>{/snippet}
        {#snippet meta()}{t('Wieder die Standard-Uhrzeit nehmen ({time})', { time: fallback })}{/snippet}
      </ListRow>
    {:else if own === null}
      <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Gerade gilt die Standard-Uhrzeit ({time}).', { time: fallback })}</p>
    {/if}
  </div>
</Page>
