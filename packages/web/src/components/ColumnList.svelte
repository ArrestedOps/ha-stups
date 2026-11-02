<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { flip } from 'svelte/animate';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import type { Card } from '../lib/api';
  import { filterCards } from '../lib/filters';
  import { moveCard, setDragging, ui } from '../lib/store.svelte';
  import CardItem from './CardItem.svelte';

  let { columnId }: { columnId: string } = $props();

  const isPlanned = $derived(ui.view?.columns.find((c) => c.id === columnId)?.isPlanned ?? false);

  const visible = $derived.by(() => {
    const list = filterCards(
      (ui.view?.cards ?? []).filter((c) => c.columnId === columnId),
      ui.filter,
      ui.me?.id ?? null,
    );
    // „Geplant" ist nach Termin sortiert: was zuerst dran ist, steht oben
    return isPlanned ? [...list].sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')) : list;
  });

  // Lokale Kopie, die während des Ziehens von der Bibliothek verändert wird
  let items = $state<Card[]>([]);
  $effect(() => {
    if (!ui.dragging) items = visible;
  });

  type CardDnd = CustomEvent<DndEvent<Card>>;

  function consider(e: CardDnd) {
    ui.dragging = true;
    items = e.detail.items;
  }

  function finalize(e: CardDnd) {
    items = e.detail.items;
    const id = String(e.detail.info.id);
    const index = items.findIndex((c) => c.id === id);
    const card = ui.view?.cards.find((c) => c.id === id);
    // Nur die Liste reagiert, in der die Karte gelandet ist
    if (index < 0 || !card) {
      setDragging(false);
      return;
    }
    const before = visible.map((c) => c.id);
    const afterId = index > 0 ? items[index - 1]!.id : null;
    const unchanged = card.columnId === columnId && before.join() === items.map((c) => c.id).join();
    if (unchanged) {
      setDragging(false);
      return;
    }
    ui.dragging = false; // das Nachladen übernimmt moveCard
    void moveCard(card, columnId, afterId);
  }
</script>

<div
  class="flex min-h-28 flex-col gap-3"
  use:dndzone={{
    items,
    type: 'card',
    // Am Handy wird gewischt, gezogen wird nur mit der Maus (große Bildschirme)
    dragDisabled: !ui.desktop,
    flipDurationMs: 150,
    delayTouchStart: 250,
    dropTargetStyle: { outline: '2px dashed var(--accent)', 'outline-offset': '4px', 'border-radius': '20px' },
  }}
  onconsider={consider}
  onfinalize={finalize}
>
  {#each items as card (card.id)}
    <div animate:flip={{ duration: 150 }}>
      <CardItem {card} />
    </div>
  {/each}
</div>

{#if items.length === 0 && !ui.dragging}
  <p class="pointer-events-none -mt-24 pb-10 text-center text-[15px] text-fg2">
    {ui.filter.categoryIds.length || ui.filter.onlyMine || ui.filter.nudged || ui.filter.search ? t('Keine Karten passen zum Filter') : t('Noch keine Karten')}
  </p>
{/if}
