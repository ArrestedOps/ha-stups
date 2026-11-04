<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { visibleTabs, type Tab } from '../lib/tabs';
  import { feat, selectTab, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  const all: Record<Tab, { label: string; icon: string }> = $derived({
    today: { label: t('Heute'), icon: 'list' },
    boards: { label: 'Boards', icon: 'columns' },
    calendar: { label: t('Kalender'), icon: 'calendar' },
    home: { label: t('Zuhause'), icon: 'home' },
  });
  // Ohne Home Assistant (eigene Anmeldung) gibt es keine Wächter, ein Kind sieht sie nicht: dann sind es drei Reiter
  const tabs = $derived(visibleTabs({ watchers: feat.watchers, isChild: ui.isChild }).map((id) => ({ id, ...all[id] })));
  const active = $derived(ui.tab);
</script>

<!-- Leiste am unteren Rand über die ganze Breite: die Listen lassen unten Platz (pb-tabbar) -->
<nav class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg px-3 pt-2 pb-[max(10px,var(--safe-bottom))]" aria-label={t('Ansicht')}>
  <div class="mx-auto grid max-w-[440px]" style:grid-template-columns="repeat({tabs.length}, minmax(0, 1fr))">
    {#each tabs as tb (tb.id)}
      <button
        class="flex min-h-[52px] flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors {active === tb.id ? 'font-bold text-accent-text' : 'text-fg2'}"
        aria-current={active === tb.id ? 'page' : undefined}
        onclick={() => selectTab(tb.id)}
      >
        <Icon name={tb.icon} size={22} />{tb.label}
      </button>
    {/each}
  </div>
</nav>
