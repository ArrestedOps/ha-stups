<script lang="ts">
  import { isFuture } from '../lib/datetime';
  import { canNudge } from '../lib/nudge';
  import { cardTargets } from '../lib/swipe';
  import { api } from '../lib/api';
  import { act, closeSheet, completeCard, moveCard, openSheet, removeCard, toast, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { id }: { id: string } = $props();

  const card = $derived(ui.view?.cards.find((c) => c.id === id));
  const columns = $derived(ui.view?.columns ?? []);
  const inDone = $derived(columns.find((c) => c.id === card?.columnId)?.isDone ?? false);
  // „Geplant" nur für Karten mit Termin nach heute; solche Karten gehören nicht nach „Offen"
  const targets = $derived(
    cardTargets(columns, isFuture(card?.dueAt ?? null), columns.find((c) => !c.isDone && !c.isPlanned)?.id),
  );
</script>

<Sheet title={card?.title ?? ''} onclose={closeSheet}>
  {#if card}
    <Group title="Verschieben nach">
      {#each targets as col (col.id)}
        <button
          class="flex min-h-[52px] w-full items-center justify-between px-4 text-left text-[17px] disabled:opacity-50"
          disabled={col.id === card.columnId}
          onclick={async () => {
            await moveCard(card, col.id);
            closeSheet();
          }}
        >
          <span>{col.name}</span>
          {#if col.id === card.columnId}<Icon name="check" size={18} stroke={3} />{/if}
        </button>
      {/each}
    </Group>

    <Group>
      {#if !inDone}
        <button
          class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]"
          onclick={async () => {
            await completeCard(card);
            closeSheet();
          }}
        >
          <Icon name="check" size={18} />Erledigt
        </button>
      {/if}
      {#if ui.me?.isPerson && canNudge(card, ui.me.id)}
        <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type: 'nudge', id: card.id })}>
          <Icon name="hand" size={18} />Stupsen
        </button>
      {/if}
      <button
        class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]"
        onclick={async () => {
          const copy = await act(() => api.duplicateCard(card.id));
          closeSheet();
          if (copy) toast('Karte dupliziert', { action: { label: 'Öffnen', run: () => openSheet({ type: 'card', id: copy.id }) } });
        }}
      >
        <Icon name="copy" size={18} />Duplizieren
      </button>
      <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type: 'card', id: card.id })}>
        <Icon name="more" size={18} />Details öffnen
      </button>
      <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px] text-danger" onclick={() => removeCard(card)}>
        <Icon name="trash" size={18} />Löschen
      </button>
    </Group>
  {/if}
</Sheet>
