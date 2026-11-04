<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { catClass } from '../lib/colors';
  import { deviceTz, formatCost } from '../lib/datetime';
  import { costTotals, countByColumn, dueStats, filterCards } from '../lib/filters';
  import { scrollStrip } from '../lib/scrollStrip';
  import { openSheet, ui } from '../lib/store.svelte';
  import ColumnList from './ColumnList.svelte';
  import ColumnTabs from './ColumnTabs.svelte';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';
  import Chip from './ui/Chip.svelte';

  const desktop = $derived(ui.desktop);
  const view = $derived(ui.view);
  const columns = $derived(view?.columns ?? []);
  const board = $derived(ui.boards.find((b) => b.id === ui.boardId));
  const stats = $derived(
    dueStats(view?.cards ?? [], ui.me?.id ?? null, new Set(columns.filter((c) => c.isDone).map((c) => c.id)), Date.now(), deviceTz()),
  );
  const counts = $derived(
    countByColumn(
      filterCards(view?.cards ?? [], ui.filter, ui.me?.id ?? null),
      columns.map((c) => c.id),
    ),
  );
  // Budget: nur sichtbar, wenn im Board überhaupt Kosten eingetragen sind (z. B. Renovierung)
  const costs = $derived(costTotals(view?.cards ?? [], new Set(columns.filter((c) => c.isDone).map((c) => c.id))));
  const budget = $derived(
    costs.open || costs.done
      ? [costs.open ? t('{amount} offen', { amount: formatCost(costs.open) }) : '', costs.done ? t('{amount} erledigt', { amount: formatCost(costs.done) }) : ''].filter(Boolean).join(' · ')
      : '',
  );

  function toggleCategory(id: string) {
    ui.filter.categoryIds = ui.filter.categoryIds.includes(id) ? ui.filter.categoryIds.filter((x) => x !== id) : [...ui.filter.categoryIds, id];
  }

  const anyFilter = $derived(ui.filter.categoryIds.length > 0 || ui.filter.onlyMine || ui.filter.nudged);
  const filterKey = $derived(`${ui.filter.categoryIds.join()}|${ui.filter.onlyMine}|${ui.filter.nudged}`);
  // Karten mit einem offenen Stups an mich: der Filter erscheint, sobald es welche gibt
  const nudgedCount = $derived((view?.cards ?? []).filter((c) => c.openNudges.some((n) => n.toId === ui.me?.id)).length);

  function focus(node: HTMLElement) {
    node.focus();
  }
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[1400px] flex-col px-3 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0">
    <TopBar />

    <!-- Board-Auswahl-Leiste: der Name ist die Überschrift, ein Tipp öffnet die Boards -->
    <div class="mt-1 flex gap-2">
      <button
        class="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-row border border-line bg-surface px-4 text-left"
        onclick={() => openSheet({ type: 'boards' })}
        aria-label={t('Board wechseln')}
      >
        <span class="shrink-0 text-accent-text"><Icon name="columns" size={20} /></span>
        <h1 class="min-w-0 flex-1 truncate text-[17px] font-semibold">{board?.name ?? 'Stups'}</h1>
        <span class="shrink-0 text-fg2"><Icon name="chevron-down" size={20} stroke={2.6} /></span>
      </button>
      <button
        class="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-row border border-line {ui.searchOpen ? 'bg-accent-grad' : 'bg-surface text-fg2'}"
        aria-label={t('Suchen')}
        aria-pressed={ui.searchOpen}
        onclick={() => {
          ui.searchOpen = !ui.searchOpen;
          if (!ui.searchOpen) ui.filter.search = '';
        }}
      >
        <Icon name="search" size={20} />
      </button>
    </div>
    <p class="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-fg2">
      {#if stats.overdue}<span class="rounded-full bg-danger-bg px-2.5 py-0.5 text-[13px] font-bold text-danger">{t('{n} überfällig', { n: stats.overdue })}</span>{/if}
      {#if stats.today}<span class="rounded-full bg-accent/20 px-2.5 py-0.5 text-[13px] font-bold text-accent-text">{t('{n} heute fällig', { n: stats.today })}</span>{/if}
      {#if !stats.overdue && !stats.today}{t('Nichts Dringendes für dich')}{/if}
    </p>
    {#if budget}<p class="text-[13px] text-fg2" aria-label={t('Kosten im Board')}>{t('Kosten: {amount}', { amount: budget })}</p>{/if}
  </header>

  {#if view}
    {#if ui.searchOpen}
      <input
        use:focus
        type="search"
        bind:value={ui.filter.search}
        placeholder={t('Karten durchsuchen')}
        class="mt-3 min-h-11 w-full rounded-row border border-line bg-surface px-4"
        aria-label={t('Karten durchsuchen')}
      />
    {/if}

    <div class="no-scrollbar -mx-3 mt-3 flex shrink-0 gap-2 overflow-x-auto px-3" role="group" aria-label="Filter" use:scrollStrip={filterKey}>
      <Chip
        active={!anyFilter}
        pressed={!anyFilter}
        onclick={() => {
          ui.filter.categoryIds = [];
          ui.filter.onlyMine = false;
          ui.filter.nudged = false;
        }}>{t('Alle')}</Chip
      >
      <Chip active={ui.filter.onlyMine} pressed={ui.filter.onlyMine} onclick={() => (ui.filter.onlyMine = !ui.filter.onlyMine)}>{t('Nur meine')}</Chip>
      {#if nudgedCount > 0 || ui.filter.nudged}
        <Chip active={ui.filter.nudged} outline={!ui.filter.nudged} pressed={ui.filter.nudged} onclick={() => (ui.filter.nudged = !ui.filter.nudged)}>
          <Icon name="hand" size={16} />{t('Gestupst {n}', { n: nudgedCount })}
        </Chip>
      {/if}
      {#each view.categories as c (c.id)}
        <button
          class="{catClass(c.color)} h-10 shrink-0 !rounded-full !px-4 !text-[15px] {ui.filter.categoryIds.includes(c.id) ? 'ring-2 ring-accent' : 'opacity-70'}"
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
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto pb-4"><ColumnList columnId={col.id} /></div>
          </section>
        {/each}
      </div>
    {:else}
      <div class="mt-3 shrink-0"><ColumnTabs /></div>
      <div class="-mr-3 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-3 pb-fab" data-testid="column-list">
        {#if ui.columnId}<ColumnList columnId={ui.columnId} />{/if}
      </div>
    {/if}
  {:else}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-fg2">
      {#if ui.isChild}
        <p>{t('Für dich ist noch nichts da.')}</p>
      {:else}
        <p>{t('Es gibt noch kein Board.')}</p>
        <button class="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent" onclick={() => openSheet({ type: 'boards' })}>{t('Board anlegen')}</button>
      {/if}
    </div>
  {/if}
</main>
