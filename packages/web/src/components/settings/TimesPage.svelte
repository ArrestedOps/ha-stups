<script lang="ts">
  import { api, type Settings } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { act, can, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import Tile from '../ui/Tile.svelte';
  import Page from './Page.svelte';

  /**
   * Erinnerungszeiten: die zwei Uhrzeiten, zu denen Stups von sich aus meldet. Die **Tageszusammenfassung** zählt morgens auf, was heute
   * und überfällig ist (Standard 08:00; in Docker `STUPS_DAILY_SUMMARY_TIME`). **Nachhaken um …** gilt für ein Nachhaken in Tagen oder Wochen
   * ohne eigene Uhrzeit (Standard 18:00; `STUPS_OVERDUE_NAG_TIME`). Die Uhrzeit aus der App hat Vorrang; „Zurücksetzen" lässt wieder die
   * Standard-Uhrzeit gelten. Ändern dürfen Administratoren und wer die Berechtigung „App-Einstellungen“ hat.
   */
  const rows = $derived([
    {
      id: 'summary-time',
      title: t('Tageszusammenfassung'),
      text: t('Ab dieser Uhrzeit bekommt jede Person morgens eine Nachricht, was heute fällig und überfällig ist. Ist nichts offen, bleibt Stups still.'),
      label: t('Uhrzeit der Tageszusammenfassung'),
      key: 'dailySummaryTime' as const,
      effective: ui.settings?.effectiveDailySummaryTime ?? '08:00',
      own: ui.settings?.dailySummaryTime ?? null,
      fallback: ui.settings?.defaultDailySummaryTime ?? '08:00',
    },
    {
      id: 'nag-time',
      title: t('Nachhaken um …'),
      text: t('Wenn ein Nachhaken in Tagen oder Wochen keine eigene Uhrzeit hat, kommt es zu dieser Uhrzeit.'),
      label: t('Uhrzeit des Nachhakens'),
      key: 'overdueNagTime' as const,
      effective: ui.settings?.effectiveOverdueNagTime ?? '18:00',
      own: ui.settings?.overdueNagTime ?? null,
      fallback: ui.settings?.defaultOverdueNagTime ?? '18:00',
    },
  ]);

  async function save(key: 'dailySummaryTime' | 'overdueNagTime', value: string | null) {
    const patch: Partial<Settings> = { [key]: value === '' ? null : value };
    const settings = await act(() => api.saveSettings(patch));
    if (settings) ui.settings = settings;
  }
</script>

<Page title={t('Erinnerungszeiten')}>
  <div class="flex flex-col gap-3.5 pt-1">
    <p class="px-1 text-[14px] leading-[1.45] text-hint">
      {t('Die Uhrzeiten gelten für alle; das ändern Administratoren und wer die Berechtigung „App-Einstellungen“ hat.')}
    </p>
    {#each rows as r (r.id)}
      <section class="flex flex-col gap-2" aria-label={r.title}>
        <h3 class="px-1 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{r.title}</h3>
        <p class="px-1 text-[13px] leading-[1.45] text-hint">{r.text}</p>
        <div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3">
          <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for={r.id}>{t('Uhrzeit')}</label>
          <input
            id={r.id}
            type="time"
            class="block min-h-6 w-full bg-transparent p-0 text-[16px] font-semibold outline-none disabled:opacity-60"
            value={r.effective}
            disabled={!can('settings')}
            aria-label={r.label}
            onchange={(e) => void save(r.key, e.currentTarget.value)}
          />
        </div>
        {#if r.own !== null && can('settings')}
          <ListRow title={t('Zurücksetzen')} onclick={() => void save(r.key, null)}>
            {#snippet tile()}<Tile color="gray"><Icon name="undo" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{t('Wieder die Standard-Uhrzeit nehmen ({time})', { time: r.fallback })}{/snippet}
          </ListRow>
        {:else if r.own === null}
          <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Gerade gilt die Standard-Uhrzeit ({time}).', { time: r.fallback })}</p>
        {/if}
      </section>
    {/each}
  </div>
</Page>
