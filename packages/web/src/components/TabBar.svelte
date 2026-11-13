<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { columnForNew } from '../lib/calendar';
  import { visibleTabs } from '../lib/tabs';
  import { feat, goTasks, openSheet, selectTab, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  type Slot = { id: 'tasks' | 'boards' | 'calendar' | 'watchers'; label: string; icon: string };
  const ALL: Record<Slot['id'], Slot> = $derived({
    tasks: { id: 'tasks', label: t('Aufgaben'), icon: 'checklist' },
    boards: { id: 'boards', label: 'Boards', icon: 'layers' },
    calendar: { id: 'calendar', label: t('Kalender'), icon: 'calendar' },
    watchers: { id: 'watchers', label: t('Wächter'), icon: 'shield' },
  });
  // Ohne Home Assistant (eigene Anmeldung) gibt es keine Wächter, ein Kind sieht sie nicht
  const shown = $derived(visibleTabs({ watchers: feat.watchers, isChild: ui.isChild }));
  const left = $derived<Slot[]>([ALL.tasks, ...(shown.includes('boards') ? [ALL.boards] : [])]);
  const right = $derived<Slot[]>([ALL.calendar, ...(shown.includes('watchers') ? [ALL.watchers] : [])]);
  const active = $derived<Slot['id']>(ui.tab === 'tasks' ? (ui.tasksCalendar ? 'calendar' : 'tasks') : ui.tab);

  // Der Plus-Knopf legt immer in der ersten offenen Spalte an (mit Termin nach heute in „Geplant“), egal welche Spalte gerade zu sehen ist
  const newColumn = $derived(columnForNew(ui.view?.columns ?? [], false));
  const canCreate = $derived(!!ui.view && !!newColumn && !ui.isChild);

  function pick(id: Slot['id']) {
    if (id === 'tasks') goTasks('list');
    else if (id === 'calendar') goTasks('calendar');
    else selectTab(id);
  }

  // Die Kugel unter dem gewählten Reiter gleitet zum neuen Platz
  let bar = $state<HTMLElement>();
  let bubble = $state({ x: 0, w: 0, ready: false });
  function place() {
    const el = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!bar || !el) return void (bubble = { x: 0, w: 0, ready: false });
    bubble = { x: el.offsetLeft, w: el.offsetWidth, ready: true };
  }
  $effect(() => {
    void active;
    void left.length;
    void right.length;
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  });
</script>

<!-- Schwebende Leiste: Aufgaben, Boards, Plus, Kalender, Wächter. Die Listen lassen unten Platz (pb-tabbar) -->
<nav class="tabbar fixed inset-x-0 z-30 flex justify-center px-3" style:bottom="calc(var(--pad-bottom) - 12px)" aria-label={t('Ansicht')}>
  <div bind:this={bar} class="tabbar-bar relative flex w-full max-w-[420px] items-center rounded-[32px] p-[6px]">
    {#if bubble.ready}
      <span class="tabbar-bubble absolute top-[6px] bottom-[6px] left-0 rounded-[26px]" style:width="{bubble.w}px" style:transform="translateX({bubble.x}px)" aria-hidden="true"></span>
    {/if}
    {#each left as tb (tb.id)}
      {@render slot(tb)}
    {/each}
    {#if canCreate}
      <button class="tabbar-plus relative z-[1] mx-1 flex h-9 w-[58px] shrink-0 items-center justify-center rounded-full" aria-label={t('Neue Karte')} onclick={() => openSheet({ type: 'new', columnId: newColumn! })}>
        <Icon name="plus" size={22} stroke={2.9} />
      </button>
    {/if}
    {#each right as tb (tb.id)}
      {@render slot(tb)}
    {/each}
  </div>
</nav>

{#snippet slot(tb: Slot)}
  <button
    class="relative z-[1] flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors {active === tb.id ? 'text-accent-text' : 'text-fg2'}"
    aria-current={active === tb.id ? 'page' : undefined}
    onclick={() => pick(tb.id)}
  >
    <Icon name={tb.icon} size={24} stroke={1.8} />{tb.label}
  </button>
{/snippet}
