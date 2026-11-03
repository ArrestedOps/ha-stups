<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { openSheet, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';
  import WatchersList from './WatchersList.svelte';

  const data = $derived(ui.watchers);
  const admin = $derived(ui.isAdmin);
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col px-4 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0">
    <TopBar />
    <div class="flex items-center justify-between gap-2">
      <h1 class="font-display text-[34px] leading-tight font-bold tracking-tight">{t('Wächter')}</h1>
      <div class="flex items-center gap-2">
        {#if admin && data?.available}
          <button
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-surface text-accent-text"
            aria-label={t('Wächter hinzufügen')}
            onclick={() => openSheet({ type: 'watcher', id: null })}
          >
            <Icon name="plus" size={22} stroke={2.6} />
          </button>
        {/if}
      </div>
    </div>
    <p class="mb-3 text-[15px] text-fg2">{t('Karten, die von selbst aus Home Assistant entstehen')}</p>
  </header>

  <div class="-mr-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-tabbar">
    <WatchersList />
  </div>
</main>
