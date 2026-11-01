<script lang="ts">
  import { currentTab, selectTab, ui, type Tab } from '../lib/store.svelte';
  import { watcherTabVisible } from '../lib/watchers';
  import Icon from './Icon.svelte';

  const all: { id: Tab; label: string; icon: string }[] = [
    { id: 'boards', label: 'Boards', icon: 'columns' },
    { id: 'agenda', label: 'Agenda', icon: 'list' },
    { id: 'calendar', label: 'Kalender', icon: 'calendar' },
    { id: 'watchers', label: 'Wächter', icon: 'eye' },
  ];
  // „Wächter" erscheint für Administratoren immer, für alle anderen nur, wenn es Wächter gibt
  const tabs = $derived(all.filter((t) => t.id !== 'watchers' || watcherTabVisible(ui.isAdmin, ui.watchers)));
  const active = $derived(currentTab());
</script>

<!-- schwebende Leiste mit Abstand zum Rand: überdeckt nichts, die Listen lassen unten Platz (pb-tabbar) -->
<nav class="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(10px,var(--safe-bottom))]" aria-label="Ansicht">
  <div class="card-shadow pointer-events-auto mx-auto flex max-w-[440px] rounded-[26px] border border-line bg-surface p-1.5">
    {#each tabs as t (t.id)}
      <button
        class="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[12px] font-semibold transition-colors {active === t.id ? 'bg-surface2 text-accent-text' : 'text-fg2'}"
        aria-current={active === t.id ? 'page' : undefined}
        onclick={() => selectTab(t.id)}
      >
        <Icon name={t.icon} size={22} />{t.label}
      </button>
    {/each}
  </div>
</nav>
