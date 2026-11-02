<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { countByColumn, filterCards } from '../lib/filters';
  import { scrollStrip } from '../lib/scrollStrip';
  import { selectColumn, ui } from '../lib/store.svelte';

  const columns = $derived(ui.view?.columns ?? []);
  const counts = $derived(
    countByColumn(
      filterCards(ui.view?.cards ?? [], ui.filter, ui.me?.id ?? null),
      columns.map((c) => c.id),
    ),
  );
</script>

<div
  class="no-scrollbar flex gap-0.5 overflow-x-auto rounded-[14px] border border-line bg-surface p-[3px]"
  role="tablist"
  aria-label={t('Spalten')}
  use:scrollStrip={ui.columnId}
>
  {#each columns as col (col.id)}
    <button
      role="tab"
      aria-selected={col.id === ui.columnId}
      class="min-h-[38px] shrink-0 flex-1 rounded-[11px] px-3 text-[14px] whitespace-nowrap {col.id === ui.columnId
        ? 'bg-accent-grad font-semibold'
        : 'text-fg2'}"
      onclick={() => selectColumn(col.id)}
    >
      {col.name} · {counts[col.id] ?? 0}
    </button>
  {/each}
</div>
