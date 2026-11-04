<script lang="ts">
  import { t, tx } from '../lib/i18n/index.svelte';
  import { isFuture } from '../lib/datetime';
  import { cardIcon, tileColorOf } from '../lib/cardTile';
  import { canNudge } from '../lib/nudge';
  import { boardColorKey } from '../lib/schedule';
  import { cardTargets } from '../lib/swipe';
  import { api } from '../lib/api';
  import { act, closeSheet, completeCard, moveCard, openSheet, removeCard, toast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';

  let { id }: { id: string } = $props();

  const card = $derived(ui.view?.cards.find((c) => c.id === id));
  const columns = $derived(ui.view?.columns ?? []);
  const column = $derived(columns.find((c) => c.id === card?.columnId));
  const inDone = $derived(column?.isDone ?? false);
  const board = $derived(ui.boards.find((b) => b.id === card?.boardId));
  const tileColor = $derived(tileColorOf(boardColorKey(board?.color ?? null, ui.boards.findIndex((b) => b.id === card?.boardId))));
  // „Geplant" nur für Karten mit Termin nach heute; solche Karten gehören nicht nach „Offen"
  const targets = $derived(
    cardTargets(columns, isFuture(card?.dueAt ?? null), columns.find((c) => !c.isDone && !c.isPlanned)?.id),
  );
</script>

<Sheet title={t('Karten-Menü')} onclose={closeSheet}>
  {#if card}
    <div class="mt-1 flex items-center gap-3 px-1 pb-3">
      <Tile color={tileColor}><Icon name={cardIcon(card)} size={20} /></Tile>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="truncate text-[17px] font-bold">{card.title}</span>
        <span class="truncate text-[13px] text-fg2">{board?.name ?? ''} · {column?.name ?? ''}</span>
      </span>
    </div>

    <SectionHeader title={t('Verschieben nach')} />
    <div class="no-scrollbar -mx-4 mt-1 mb-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label={t('Verschieben nach')}>
      {#each targets as col (col.id)}
        <Chip
          active={col.id === card.columnId}
          pressed={col.id === card.columnId}
          onclick={async () => {
            if (col.id === card.columnId) return;
            await moveCard(card, col.id);
            closeSheet();
          }}
        >
          {#if col.id === card.columnId}<Icon name="check" size={16} stroke={3} />{/if}{col.name}
        </Chip>
      {/each}
    </div>

    <div class="flex flex-col gap-2">
      {#if !inDone}
        <ListRow
          title={tx('Aktion', 'Erledigt')}
          onclick={async () => {
            await completeCard(card);
            closeSheet();
          }}
        >
          {#snippet tile()}<Tile color="green" size="sm"><Icon name="check" size={18} /></Tile>{/snippet}
        </ListRow>
      {/if}
      {#if ui.me?.isPerson && canNudge(card, ui.me.id)}
        <ListRow title={t('Stupsen')} onclick={() => openSheet({ type: 'nudge', id: card.id })}>
          {#snippet tile()}<Tile color="orange" size="sm"><Icon name="hand" size={18} /></Tile>{/snippet}
        </ListRow>
      {/if}
      <ListRow
        title="Duplizieren"
        onclick={async () => {
          const copy = await act(() => api.duplicateCard(card.id));
          closeSheet();
          if (copy) toast(t('Karte dupliziert'), { action: { label: t('Öffnen'), run: () => openSheet({ type: 'card', id: copy.id }) } });
        }}
      >
        {#snippet tile()}<Tile color="gray" size="sm"><Icon name="copy" size={18} /></Tile>{/snippet}
      </ListRow>
      <ListRow title={t('Details öffnen')} onclick={() => openSheet({ type: 'card', id: card.id })}>
        {#snippet tile()}<Tile color="gray" size="sm"><Icon name="more" size={18} /></Tile>{/snippet}
      </ListRow>
      <ListRow title={t('Löschen')} variant="danger" onclick={() => removeCard(card)}>
        {#snippet tile()}<Tile color="red" size="sm"><Icon name="trash" size={18} /></Tile>{/snippet}
        {#snippet right()}<span class="text-[13px] text-fg2">{t('30 Tage im Papierkorb')}</span>{/snippet}
      </ListRow>
    </div>
  {/if}
</Sheet>
