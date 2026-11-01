<script lang="ts">
  import { onMount } from 'svelte';
  import AgendaView from './components/AgendaView.svelte';
  import ArchiveSheet from './components/ArchiveSheet.svelte';
  import CalendarView from './components/CalendarView.svelte';
  import SlotSheet from './components/SlotSheet.svelte';
  import TabBar from './components/TabBar.svelte';
  import BoardSettings from './components/BoardSettings.svelte';
  import BoardSwitcher from './components/BoardSwitcher.svelte';
  import CardMenu from './components/CardMenu.svelte';
  import CardSheet from './components/CardSheet.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import ColumnList from './components/ColumnList.svelte';
  import ColumnTabs from './components/ColumnTabs.svelte';
  import Icon from './components/Icon.svelte';
  import Lightbox from './components/Lightbox.svelte';
  import NewCardSheet from './components/NewCardSheet.svelte';
  import NudgeSheet from './components/NudgeSheet.svelte';
  import NoAccess from './components/NoAccess.svelte';
  import PeopleSheet from './components/PeopleSheet.svelte';
  import SettingsSheet from './components/SettingsSheet.svelte';
  import Toasts from './components/Toasts.svelte';
  import TrashSheet from './components/TrashSheet.svelte';
  import WatcherSheet from './components/WatcherSheet.svelte';
  import WatchersView from './components/WatchersView.svelte';
  import { catClass } from './lib/colors';
  import { deviceTz, formatCost } from './lib/datetime';
  import { costTotals, countByColumn, dueStats, filterCards } from './lib/filters';
  import { currentTab, goToDashboard, init, openSheet, ui } from './lib/store.svelte';

  onMount(init);

  // Ab 1024 px: klassische Kanban-Ansicht mit allen Spalten nebeneinander
  onMount(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    ui.desktop = mq.matches;
    const on = (e: MediaQueryListEvent) => (ui.desktop = e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
  const desktop = $derived(ui.desktop);

  const tab = $derived(currentTab());
  const view = $derived(ui.view);
  const columns = $derived(view?.columns ?? []);
  const board = $derived(ui.boards.find((b) => b.id === ui.boardId));
  const stats = $derived(
    dueStats(
      view?.cards ?? [],
      ui.me?.id ?? null,
      new Set(columns.filter((c) => c.isDone).map((c) => c.id)),
      Date.now(),
      deviceTz(),
    ),
  );
  const counts = $derived(
    countByColumn(
      filterCards(view?.cards ?? [], ui.filter, ui.me?.id ?? null),
      columns.map((c) => c.id),
    ),
  );
  // Budget: nur sichtbar, wenn im Board überhaupt Kosten eingetragen sind (z. B. Renovierung)
  const costs = $derived(
    costTotals(view?.cards ?? [], new Set(columns.filter((c) => c.isDone).map((c) => c.id))),
  );
  const budget = $derived(
    costs.open || costs.done
      ? [costs.open ? `${formatCost(costs.open)} offen` : '', costs.done ? `${formatCost(costs.done)} erledigt` : ''].filter(Boolean).join(' · ')
      : '',
  );

  function toggleCategory(id: string) {
    ui.filter.categoryIds = ui.filter.categoryIds.includes(id)
      ? ui.filter.categoryIds.filter((x) => x !== id)
      : [...ui.filter.categoryIds, id];
  }

  const anyFilter = $derived(ui.filter.categoryIds.length > 0 || ui.filter.onlyMine || ui.filter.nudged);
  // Karten mit einem offenen Stups an mich: der Filter erscheint, sobald es welche gibt
  const nudgedCount = $derived((view?.cards ?? []).filter((c) => c.openNudges.some((n) => n.toId === ui.me?.id)).length);

  function focus(node: HTMLElement) {
    node.focus();
  }
</script>

{#if ui.fatal}
  <div class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
    <Icon name="wifi-off" size={32} />
    <p class="text-[17px] font-semibold">Stups konnte nicht geladen werden</p>
    <p class="text-fg2">{ui.fatal}</p>
    <button class="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent" onclick={() => location.reload()}>Neu laden</button>
  </div>
{:else if !ui.ready}
  <div class="flex h-full items-center justify-center text-fg2">Lädt …</div>
{:else if !ui.allowed}
  <NoAccess />
{:else}
  <div class="header-glow" aria-hidden="true"></div>
  {#if tab === 'boards'}
  <main class="relative z-[1] mx-auto flex h-full max-w-[1400px] flex-col px-4 pt-[max(8px,var(--safe-top))]">
    <header class="shrink-0">
      <div class="flex items-center justify-between">
        <button class="-ml-1.5 flex min-h-11 items-center text-[17px] text-accent-text" onclick={goToDashboard}>
          <Icon name="chevron-left" size={24} stroke={2.6} />Dashboard
        </button>
        {#if !ui.online}
          <span class="flex items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-[13px] text-fg2" role="status">
            <Icon name="wifi-off" size={14} />Offline
          </span>
        {/if}
      </div>

      <div class="flex items-center justify-between gap-3">
        <button class="flex min-h-11 min-w-0 items-center gap-1.5 text-left" onclick={() => openSheet({ type: 'boards' })} aria-label="Board wechseln">
          <h1 class="truncate text-[34px] leading-tight font-bold tracking-tight">{board?.name ?? 'Stups'}</h1>
          <span class="shrink-0 text-accent-text"><Icon name="chevron-down" size={22} stroke={2.6} /></span>
        </button>
        <button
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-surface text-fg2"
          aria-label="Suchen"
          aria-pressed={ui.searchOpen}
          onclick={() => {
            ui.searchOpen = !ui.searchOpen;
            if (!ui.searchOpen) ui.filter.search = '';
          }}
        >
          <Icon name="search" size={20} />
        </button>
      </div>
      <p class="flex flex-wrap items-center gap-2 text-[15px] text-fg2">
        {#if stats.overdue}<span class="rounded-full bg-danger-bg px-2.5 py-0.5 text-[13px] font-bold text-danger">{stats.overdue} überfällig</span>{/if}
        {#if stats.today}<span class="rounded-full bg-accent/20 px-2.5 py-0.5 text-[13px] font-bold text-accent-text">{stats.today} heute fällig</span>{/if}
        {#if !stats.overdue && !stats.today}Nichts Dringendes für dich{/if}
      </p>
      {#if budget}<p class="text-[13px] text-fg2" aria-label="Kosten im Board">Kosten: {budget}</p>{/if}
    </header>

    {#if view}
      {#if ui.searchOpen}
        <input
          use:focus
          type="search"
          bind:value={ui.filter.search}
          placeholder="Karten durchsuchen"
          class="mt-3 min-h-11 w-full rounded-xl border border-line bg-surface px-4"
          aria-label="Karten durchsuchen"
        />
      {/if}

      <div class="no-scrollbar -mx-4 mt-3.5 flex shrink-0 gap-2 overflow-x-auto px-4" role="group" aria-label="Filter">
        <button
          class="min-h-9 shrink-0 rounded-xl border px-3.5 text-[15px] {!anyFilter ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}"
          aria-pressed={!anyFilter}
          onclick={() => {
            ui.filter.categoryIds = [];
            ui.filter.onlyMine = false;
            ui.filter.nudged = false;
          }}
        >
          Alle
        </button>
        <button
          class="min-h-9 shrink-0 rounded-xl border px-3.5 text-[15px] {ui.filter.onlyMine ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}"
          aria-pressed={ui.filter.onlyMine}
          onclick={() => (ui.filter.onlyMine = !ui.filter.onlyMine)}
        >
          Nur meine
        </button>
        {#if nudgedCount > 0 || ui.filter.nudged}
          <button
            class="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-[15px] {ui.filter.nudged ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-accent/60 text-accent-text'}"
            aria-pressed={ui.filter.nudged}
            onclick={() => (ui.filter.nudged = !ui.filter.nudged)}
          >
            <Icon name="hand" size={16} />Gestupst {nudgedCount}
          </button>
        {/if}
        {#each view.categories as c (c.id)}
          <button
            class="{catClass(c.color)} min-h-9 shrink-0 !rounded-xl !px-3.5 !text-[15px] {ui.filter.categoryIds.includes(c.id) ? 'ring-2 ring-accent' : 'opacity-70'}"
            aria-pressed={ui.filter.categoryIds.includes(c.id)}
            onclick={() => toggleCategory(c.id)}
          >
            {c.name}
          </button>
        {/each}
      </div>

      {#if desktop}
        <div class="mt-4 flex min-h-0 flex-1 gap-4 overflow-x-auto pb-6">
          {#each columns as col (col.id)}
            <section class="flex w-[320px] shrink-0 flex-col" aria-label={col.name}>
              <div class="mb-3 flex items-center justify-between px-1">
                <h2 class="text-[15px] font-semibold text-fg2">{col.name} · {counts[col.id] ?? 0}</h2>
                <button class="flex h-9 w-9 items-center justify-center rounded-xl text-fg2 hover:bg-surface" aria-label="Neue Karte in {col.name}" onclick={() => openSheet({ type: 'new', columnId: col.id })}>
                  <Icon name="plus" size={18} />
                </button>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto pb-4"><ColumnList columnId={col.id} /></div>
            </section>
          {/each}
        </div>
      {:else}
        <div class="mt-4 shrink-0"><ColumnTabs /></div>
        <div class="-mr-4 mt-3.5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-tabbar">
          {#if ui.columnId}<ColumnList columnId={ui.columnId} />{/if}
        </div>
      {/if}
    {:else}
      <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-fg2">
        <p>Es gibt noch kein Board.</p>
        <button class="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent" onclick={() => openSheet({ type: 'boards' })}>Board anlegen</button>
      </div>
    {/if}
  </main>
  {:else if tab === 'agenda'}
    <AgendaView />
  {:else if tab === 'calendar'}
    <CalendarView />
  {:else}
    <WatchersView />
  {/if}

  {#if tab === 'boards' && view && ui.columnId && !desktop}
    <button
      class="fixed right-5 bottom-[calc(max(10px,var(--safe-bottom))+80px)] z-30 flex h-[60px] w-[60px] items-center justify-center rounded-[20px] bg-accent-grad"
      aria-label="Neue Karte"
      onclick={() => openSheet({ type: 'new', columnId: ui.columnId! })}
    >
      <Icon name="plus" size={26} stroke={2.8} />
    </button>
  {/if}

  <TabBar />

  {#if ui.sheet?.type === 'card'}
    {#key ui.sheet.id}<CardSheet id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'cardMenu'}
    {#key ui.sheet.id}<CardMenu id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'new'}
    <NewCardSheet columnId={ui.sheet.columnId} dueAt={ui.sheet.dueAt ?? null} />
  {:else if ui.sheet?.type === 'slot'}
    <SlotSheet at={ui.sheet.at} />
  {:else if ui.sheet?.type === 'boards'}
    <BoardSwitcher />
  {:else if ui.sheet?.type === 'boardSettings'}
    <BoardSettings />
  {:else if ui.sheet?.type === 'settings'}
    <SettingsSheet />
  {:else if ui.sheet?.type === 'people'}
    <PeopleSheet />
  {:else if ui.sheet?.type === 'watcher'}
    {#key ui.sheet.id ?? 'neu'}<WatcherSheet id={ui.sheet.id} template={ui.sheet.template} />{/key}
  {:else if ui.sheet?.type === 'nudge'}
    {#key ui.sheet.id}<NudgeSheet id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'trash'}
    <TrashSheet />
  {:else if ui.sheet?.type === 'archive'}
    <ArchiveSheet />
  {/if}

  <Lightbox />
  <ConfirmDialog />
  <Toasts />
{/if}
