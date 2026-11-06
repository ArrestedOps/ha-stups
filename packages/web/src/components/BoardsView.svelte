<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { countByColumn, filterCards } from '../lib/filters';
  import { scrollStrip } from '../lib/scrollStrip';
  import { toggleId } from '../lib/schedule';
  import { openSheet, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import ColumnList from './ColumnList.svelte';
  import ColumnTabs from './ColumnTabs.svelte';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';
  import Chip from './ui/Chip.svelte';

  /**
   * Der Reiter Boards nach dem Mockup (Boards): Kopf mit Titel, Board-Leiste, Chips (Meine, Alle, Personen, Filter), Kategorien-Chips,
   * Spalten als Umschalter, Karten als Zeilen, „+". Suche, Stups-Filter und Kosten stehen hinter dem Filter-Knopf (Blatt „Filter").
   * Ab 1024 px stehen die Spalten nebeneinander.
   */
  const desktop = $derived(ui.desktop);
  const view = $derived(ui.view);
  const columns = $derived(view?.columns ?? []);
  const board = $derived(ui.boards.find((b) => b.id === ui.boardId));
  const counts = $derived(
    countByColumn(
      filterCards(view?.cards ?? [], ui.filter, ui.me?.id ?? null),
      columns.map((c) => c.id),
    ),
  );

  const f = $derived(ui.filter);
  const meId = $derived(ui.me?.id ?? null);
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== meId));
  const personActive = $derived(f.onlyMine || f.personIds.length > 0);
  // Filter-Knopf: Umriss, wenn hinter ihm etwas gewählt ist (Suche, Stups-Filter)
  const hiddenFilter = $derived(f.nudged || f.search.trim() !== '');
  const filterKey = $derived(`${f.categoryIds.join()}|${f.onlyMine}|${f.personIds.join()}`);

  function toggleCategory(id: string) {
    ui.filter.categoryIds = toggleId(ui.filter.categoryIds, id);
  }
</script>

{#snippet head()}
  <TopBar title="Boards" sub={t('Organisiere deine Aufgaben in Kanban-Boards.')} />

  <!-- Board-Leiste: ein Tipp öffnet „Board wechseln" (Desktop: die Seitenleiste wechselt das Board, der Name steht in der Kopfzeile) -->
  {#if !desktop}
    <button
      class="flex h-[52px] w-full min-w-0 items-center gap-2.5 rounded-row border border-line-chip bg-surface px-4 text-left text-[17px] font-semibold"
      onclick={() => openSheet({ type: 'boards' })}
      aria-label={t('Board wechseln')}
    >
      <span class="shrink-0 text-text-soft"><Icon name="layers" size={22} /></span>
      <span class="min-w-0 flex-1 truncate" data-testid="board-name">{board?.name ?? 'Stups'}</span>
      <span class="shrink-0 text-text-soft"><Icon name="chevron-down" size={20} stroke={2} /></span>
    </button>
  {/if}

  {#if view}
    <div class="flex flex-col gap-2">
      {#if !ui.isChild}
        <div class="flex items-center gap-2">
          <div class="no-scrollbar -ml-3 flex min-w-0 flex-1 gap-2 overflow-x-auto pl-3" role="group" aria-label={t('Personen')} use:scrollStrip={filterKey}>
            <Chip
              active={!personActive}
              pressed={!personActive}
              onclick={() => {
                ui.filter.onlyMine = false;
                ui.filter.personIds = [];
              }}><Icon name="user" size={20} />{t('Alle')}</Chip
            >
            {#if ui.me?.isPerson}
              <Chip photo active={f.onlyMine} pressed={f.onlyMine} onclick={() => (ui.filter.onlyMine = !ui.filter.onlyMine)}>
                <Avatar person={ui.me} size={32} />{t('Meine')}
              </Chip>
            {/if}
            {#each people as p (p.id)}
              <Chip photo active={f.personIds.includes(p.id)} pressed={f.personIds.includes(p.id)} onclick={() => (ui.filter.personIds = toggleId(ui.filter.personIds, p.id))}>
                <Avatar person={p} size={32} />{p.displayName}
              </Chip>
            {/each}
          </div>
          <Chip square label={t('Filter')} outline={hiddenFilter} onclick={() => openSheet({ type: 'filter' })}><Icon name="sliders" size={20} /></Chip>
        </div>
      {/if}
      {#if view.categories.length > 0}
        <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Kategorien')} use:scrollStrip={f.categoryIds.join()}>
          <Chip outline={f.categoryIds.length === 0} pressed={f.categoryIds.length === 0} onclick={() => (ui.filter.categoryIds = [])}>{t('Alle')}</Chip>
          {#each view.categories as c (c.id)}
            <Chip active={f.categoryIds.includes(c.id)} pressed={f.categoryIds.includes(c.id)} onclick={() => toggleCategory(c.id)}>{c.name}</Chip>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<main class="relative z-[1] mx-auto flex h-full flex-col {desktop ? '' : 'max-w-[720px]'}">
  {#if view}
    {#if desktop}
      <div class="flex shrink-0 flex-col gap-3">{@render head()}</div>
      <!-- Kanban über die ganze Breite: Spalten gleich breit (mindestens 264 px, danach scrollt die Fläche seitlich), Kopf mit Name, Zähler und „+“ -->
      <div class="mt-4 min-h-0 flex-1 overflow-x-auto pb-6" data-testid="kanban">
        <div class="grid h-full min-w-0 grid-flow-col auto-cols-[minmax(264px,1fr)] gap-4">
          {#each columns as col (col.id)}
            <section class="flex min-h-0 flex-col rounded-[20px] border border-line bg-surface/40" aria-label={col.name}>
              <div class="flex h-14 shrink-0 items-center gap-2 pr-2 pl-4">
                <h2 class="min-w-0 truncate text-[15px] font-bold">{col.name}</h2>
                <span class="inline-flex h-[22px] min-w-6 shrink-0 items-center justify-center rounded-full bg-count px-2 text-[12px] font-bold text-text-soft" data-testid="column-count">{counts[col.id] ?? 0}</span>
                <span class="flex-1"></span>
                {#if !ui.isChild && !col.isDone && !col.isPlanned}
                  <button
                    class="flex h-9 w-9 items-center justify-center rounded-[10px] bg-surface2 text-text-soft hover:text-fg"
                    aria-label={t('Neue Karte in „{name}“', { name: col.name })}
                    onclick={() => openSheet({ type: 'new', columnId: col.id, picked: true })}
                  >
                    <Icon name="plus" size={20} stroke={2} />
                  </button>
                {/if}
              </div>
              <div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3" data-testid="column-list-{col.id}"><ColumnList columnId={col.id} /></div>
            </section>
          {/each}
        </div>
      </div>
    {:else}
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-[calc(var(--safe-top)+8px)] pb-fab" data-testid="boards-scroll">
        <div class="flex flex-col gap-3.5">
          {@render head()}
          <ColumnTabs />
          <div data-testid="column-list">
            {#if ui.columnId}<ColumnList columnId={ui.columnId} />{/if}
          </div>
        </div>
      </div>
    {/if}
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pt-[calc(var(--safe-top)+8px)] pb-fab lg:px-0 lg:pt-0">
      <div class="flex flex-col gap-3.5">
        <TopBar title="Boards" sub={t('Organisiere deine Aufgaben in Kanban-Boards.')} />
        <div class="flex flex-col items-center justify-center gap-3 py-16 text-center text-fg2">
          {#if ui.isChild}
            <p>{t('Für dich ist noch nichts da.')}</p>
          {:else}
            <p>{t('Es gibt noch kein Board.')}</p>
            <button class="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent" onclick={() => openSheet({ type: 'boards' })}>{t('Board anlegen')}</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</main>
