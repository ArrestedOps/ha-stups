<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { visibleTabs, type Tab } from '../lib/tabs';
  import { feat, selectTab, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  const all: Record<Tab, { label: string; icon: string }> = $derived({
    tasks: { label: t('Aufgaben'), icon: 'checklist' },
    boards: { label: 'Boards', icon: 'layers' },
    watchers: { label: t('Wächter'), icon: 'shield' },
  });
  // Ohne Home Assistant (eigene Anmeldung) gibt es keine Wächter, ein Kind sieht sie nicht: dann sind es zwei Reiter
  const tabs = $derived(visibleTabs({ watchers: feat.watchers, isChild: ui.isChild }).map((id) => ({ id, ...all[id] })));
  const active = $derived(ui.tab);
</script>

<!-- Leiste am unteren Rand über die ganze Breite, 88 px hoch (8 oben, 30 unten für den Home-Balken); die Listen lassen unten Platz (pb-tabbar, pb-fab) -->
<nav class="fixed inset-x-0 bottom-0 z-30 bg-bg px-3 pt-2 pb-[max(30px,var(--safe-bottom))]" aria-label={t('Ansicht')}>
  <div class="mx-auto grid max-w-[440px]" style:grid-template-columns="repeat({tabs.length}, minmax(0, 1fr))">
    {#each tabs as tb (tb.id)}
      <button
        class="flex h-[50px] flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors {active === tb.id ? 'text-accent-text' : 'text-text-soft2'}"
        aria-current={active === tb.id ? 'page' : undefined}
        onclick={() => selectTab(tb.id)}
      >
        <Icon name={tb.icon} size={26} stroke={1.7} />{tb.label}
      </button>
    {/each}
  </div>
</nav>
