<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte';
  import { can, openSheet, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import WatchersList from '../WatchersList.svelte';
  import Page from './Page.svelte';
</script>

<!-- Verwalten: die Liste der Wächter mit An/Aus und Bearbeiten (den Zustand zeigt der Reiter Zuhause) -->
<Page title={t('Wächter')}>
  <p class="mt-3 px-1 text-[15px] text-fg2">{t('Karten, die von selbst aus Home Assistant entstehen')}</p>
  {#if can('watchers') && ui.watchers?.available}
    <button class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line text-[16px] font-semibold text-accent-text" onclick={() => openSheet({ type: 'watcher', id: null, from: 'settings' })}>
      <Icon name="plus" size={18} stroke={2.6} />{t('Wächter hinzufügen')}
    </button>
  {/if}
  {#if can('watchers') && ui.watchers?.available}
    <button class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-house font-semibold text-bg" onclick={() => openSheet({ type: 'found' })}>
      <Icon name="eye" size={18} />{t('Wächter aus Vorlagen')}
    </button>
  {/if}
  <div class="mt-3 pb-4"><WatchersList /></div>
</Page>
