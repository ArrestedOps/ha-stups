<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { t } from '../lib/i18n/index.svelte';
  import { api, type BoardSummary } from '../lib/api';
  import { moveItem } from '../lib/boardAdmin';
  import { act, closeSheet, openSheet, ui } from '../lib/store.svelte';
  import BoardTile from './BoardTile.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import ListRow from './ui/ListRow.svelte';

  /**
   * „Reihenfolge": die Boards ziehen (am Griff links) oder mit den Pfeilen verschieben, „Fertig" speichert. Die Reihenfolge gilt für alle
   * (nicht nur für dich). Abbrechen lässt alles, wie es war.
   */
  let items = $state<BoardSummary[]>([]);
  let moving = $state<string | null>(null);
  let dragDisabled = $state(true);
  let busy = $state(false);
  onMount(() => {
    items = [...ui.boards];
  });

  type Dnd = CustomEvent<DndEvent<BoardSummary>>;
  function consider(e: Dnd) {
    items = e.detail.items;
    moving = String(e.detail.info.id);
  }
  function finalize(e: Dnd) {
    items = e.detail.items;
    dragDisabled = true;
  }
  function shift(i: number, dir: -1 | 1) {
    moving = items[i]?.id ?? null;
    items = moveItem(items, i, dir);
  }

  const back = () => openSheet({ type: 'boards' });
  async function save() {
    if (busy) return;
    busy = true;
    const changed = items.map((b) => b.id).join() !== ui.boards.map((b) => b.id).join();
    if (changed) await act(() => api.reorderBoards(items.map((b) => b.id)));
    busy = false;
    back();
  }
</script>

<Sheet title={t('Reihenfolge')} onclose={closeSheet}>
  {#snippet left()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={back}>{t('Abbrechen')}</button>
  {/snippet}
  {#snippet right()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text disabled:opacity-50" disabled={busy} onclick={save}>{t('Fertig')}</button>
  {/snippet}

  <div
    class="flex flex-col gap-2 pt-1"
    data-testid="board-order"
    use:dndzone={{ items, type: 'board-order', dragDisabled, flipDurationMs: 150, delayTouchStart: 120, dropTargetStyle: {} }}
    onconsider={consider}
    onfinalize={finalize}
  >
    {#each items as b, i (b.id)}
      <div animate:flip={{ duration: 150 }} data-testid="order-row">
        <ListRow title={b.name} current={moving === b.id}>
          {#snippet tile()}
            <span
              class="-ml-1 flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-text-soft2"
              role="presentation"
              aria-hidden="true"
              data-testid="order-handle"
              onmousedown={() => (dragDisabled = false)}
              ontouchstart={() => (dragDisabled = false)}
            >
              <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor"><circle cx="4" cy="4" r="1.6" /><circle cx="10" cy="4" r="1.6" /><circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="4" cy="16" r="1.6" /><circle cx="10" cy="16" r="1.6" /></svg>
            </span>
            <BoardTile board={b} size="sm" />
          {/snippet}
          {#snippet meta()}{#if moving === b.id}{t('wird gerade verschoben')}{/if}{/snippet}
          {#snippet right()}
            <button type="button" class="flex h-11 w-9 items-center justify-center rounded-[10px] text-text-soft disabled:text-sep" aria-label={t('{name} nach oben', { name: b.name })} disabled={i === 0} onclick={() => shift(i, -1)}>
              <Icon name="arrow-up" size={18} stroke={2} />
            </button>
            <button type="button" class="flex h-11 w-9 items-center justify-center rounded-[10px] text-text-soft disabled:text-sep" aria-label={t('{name} nach unten', { name: b.name })} disabled={i === items.length - 1} onclick={() => shift(i, 1)}>
              <Icon name="arrow-down" size={18} stroke={2} />
            </button>
          {/snippet}
        </ListRow>
      </div>
    {/each}
  </div>
  <p class="px-1 pt-3 text-[12.5px] leading-[1.45] text-hint">{t('Die Reihenfolge gilt für alle in Stups, nicht nur für dich.')}</p>
</Sheet>
