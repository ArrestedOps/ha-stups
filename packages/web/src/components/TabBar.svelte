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

<!-- schwebende Leiste mit Abstand zum Rand: überdeckt nichts, die Listen lassen unten Platz (pb-tabbar) -->
<nav class="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(10px,var(--safe-bottom))]" aria-label={t('Ansicht')}>
  <div class="card-shadow pointer-events-auto mx-auto flex max-w-[440px] rounded-[26px] border border-line bg-surface p-1.5">
    {#each tabs as tb (tb.id)}
      <button
        class="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[12px] font-semibold transition-colors {active === tb.id ? 'bg-surface2 text-accent-text' : 'text-fg2'}"
        aria-current={active === tb.id ? 'page' : undefined}
        onclick={() => selectTab(tb.id)}
      >
        <Icon name={tb.icon} size={22} />{tb.label}
      </button>
    {/each}
  </div>
</nav>
