<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { isFuture } from '../lib/datetime';
  import { canNudge } from '../lib/nudge';
  import { cardTargets } from '../lib/swipe';
  import { api } from '../lib/api';
  import { act, closeSheet, moveCard, openSheet, removeCard, toast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import ListRow from './ui/ListRow.svelte';
  import CardTile from './CardTile.svelte';
  import Tile from './ui/Tile.svelte';

  let { id }: { id: string } = $props();

  const card = $derived(ui.view?.cards.find((c) => c.id === id));
  const columns = $derived(ui.view?.columns ?? []);
  const column = $derived(columns.find((c) => c.id === card?.columnId));
  const board = $derived(ui.boards.find((b) => b.id === card?.boardId));
  // „Geplant" nur für Aufgaben mit Termin nach heute; solche Aufgaben gehören nicht nach „Offen"
  const targets = $derived(
    cardTargets(columns, isFuture(card?.dueAt ?? null), columns.find((c) => !c.isDone && !c.isPlanned)?.id),
  );
</script>

<!-- Aktionsblatt wie im Mockup: Griff, Aufgabe, „Verschieben nach" als 2 × 2 Felder, dann Öffnen, Stupsen, Duplizieren, Löschen. „Erledigt" ist eines der Felder. -->
<Sheet title={t('Aufgaben-Menü')} onclose={closeSheet} bare fit>
  {#if card}
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-3 px-1 pt-1.5 pb-0.5">
        <CardTile {card} glyph={22} />
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate text-[17px] font-bold tracking-tight">{card.title}</span>
          <span class="flex items-center gap-1.5 truncate text-[13px] text-fg2"><span class="truncate">{board?.name ?? ''}</span><span class="text-sep" aria-hidden="true">•</span><span>{column?.name ?? ''}</span></span>
        </span>
      </div>

      <div class="flex h-[26px] items-center px-1"><h2 class="text-[15px] font-extrabold tracking-tight">{t('Verschieben nach')}</h2></div>
      <div class="grid grid-cols-2 gap-2" role="group" aria-label={t('Verschieben nach')}>
        {#each targets as col (col.id)}
          {@const current = col.id === card.columnId}
          <button
            class="flex h-[52px] items-center justify-center gap-1.5 rounded-[14px] border text-[14px] font-semibold {current ? 'move-current' : 'border-line bg-surface text-text-soft'}"
            aria-pressed={current}
            aria-current={current ? 'true' : undefined}
            onclick={async () => {
              if (current) return;
              await moveCard(card, col.id);
              closeSheet();
            }}
          >
            {#if current}<Icon name="check" size={16} stroke={2.4} />{/if}{col.name}
          </button>
        {/each}
      </div>

      <div class="flex flex-col gap-2">
        <ListRow title={t('Öffnen')} onclick={() => openSheet({ type: 'card', id: card.id })}>
          {#snippet tile()}<Tile color="gray" size="sm"><Icon name="external" size={18} stroke={2} /></Tile>{/snippet}
        </ListRow>
        {#if ui.me?.isPerson && canNudge(card, ui.me.id)}
          <ListRow title={t('Stupsen')} onclick={() => openSheet({ type: 'nudge', id: card.id })}>
            {#snippet tile()}<Tile color="orange" size="sm"><Icon name="hand" size={18} stroke={2} /></Tile>{/snippet}
          </ListRow>
        {/if}
        <ListRow
          title="Duplizieren"
          onclick={async () => {
            const copy = await act(() => api.duplicateCard(card.id));
            closeSheet();
            if (copy) toast(t('Aufgabe dupliziert'), { action: { label: t('Öffnen'), run: () => openSheet({ type: 'card', id: copy.id }) } });
          }}
        >
          {#snippet tile()}<Tile color="gray" size="sm"><Icon name="copy" size={18} stroke={2} /></Tile>{/snippet}
        </ListRow>
        <ListRow title={t('Löschen')} variant="danger" onclick={() => removeCard(card)}>
          {#snippet tile()}<Tile color="red" size="sm"><Icon name="trash" size={18} stroke={2} /></Tile>{/snippet}
          {#snippet right()}<span class="text-[14px] text-fg2">{t('30 Tage im Papierkorb')}</span>{/snippet}
        </ListRow>
      </div>
    </div>
  {/if}
</Sheet>
