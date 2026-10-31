<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Card } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { act, closeSheet, toast, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Sheet from './Sheet.svelte';

  let items = $state<Card[] | null>(null);
  let search = $state('');

  const firstOpen = $derived((ui.view?.columns ?? []).find((c) => !c.isDone) ?? ui.view?.columns[0]);
  const shown = $derived(
    (items ?? []).filter((c) => !search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const load = async () => {
    if (ui.boardId) items = await api.archived(ui.boardId).catch(() => []);
  };
  onMount(load);

  async function restore(card: Card) {
    if (!firstOpen) return;
    const ok = await act(() => api.restoreArchived(card.id, firstOpen!.id));
    if (ok) toast(`„${card.title}“ ist zurück in „${firstOpen.name}“`);
    await load();
  }
</script>

<Sheet title="Archiv" onclose={closeSheet}>
  {#if items === null}
    <p class="py-10 text-center text-fg2">Lädt …</p>
  {:else if items.length === 0}
    <p class="py-10 text-center text-fg2">Noch nichts archiviert. Erledigte Karten landen hier nach der Archivfrist des Boards.</p>
  {:else}
    <input
      type="search"
      bind:value={search}
      placeholder="Im Archiv suchen"
      class="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-4"
      aria-label="Im Archiv suchen"
    />
    <Group>
      {#each shown as card (card.id)}
        <div class="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2">
          <div class="min-w-0">
            <div class="truncate text-[17px]">{card.title}</div>
            <div class="text-[13px] text-fg2">archiviert {card.archivedAt ? formatDue(card.archivedAt) : ''}</div>
          </div>
          <button class="min-h-10 shrink-0 rounded-xl bg-surface2 px-3 font-semibold text-accent-text" onclick={() => restore(card)}>Zurückholen</button>
        </div>
      {/each}
    </Group>
  {/if}
</Sheet>
