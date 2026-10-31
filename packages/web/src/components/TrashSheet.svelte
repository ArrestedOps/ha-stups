<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type TrashItem } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { act, closeSheet, toast } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Sheet from './Sheet.svelte';

  let items = $state<TrashItem[] | null>(null);

  const LABEL = { board: 'Board', column: 'Spalte', category: 'Kategorie', card: 'Karte' } as const;

  const load = async () => (items = await api.trash().catch(() => []));
  onMount(load);

  async function restore(item: TrashItem) {
    const ok = await act(() => api.restore(item.type, item.id).then(() => true));
    if (ok) toast(`${LABEL[item.type]} „${item.title}“ wiederhergestellt`);
    await load();
  }
</script>

<Sheet title="Papierkorb" onclose={closeSheet}>
  {#if items === null}
    <p class="py-10 text-center text-fg2">Lädt …</p>
  {:else if items.length === 0}
    <p class="py-10 text-center text-fg2">Der Papierkorb ist leer.</p>
  {:else}
    <Group hint="Gelöschtes bleibt 30 Tage erhalten und wird danach endgültig entfernt.">
      {#each items as item (item.type + item.id)}
        <div class="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2">
          <div class="min-w-0">
            <div class="truncate text-[17px]">{item.title}</div>
            <div class="text-[13px] text-fg2">{LABEL[item.type]} · gelöscht {formatDue(item.deletedAt)} · weg am {formatDue(item.purgeAt).split(' ').slice(0, 2).join(' ')}</div>
          </div>
          <button class="min-h-10 shrink-0 rounded-xl bg-surface2 px-3 font-semibold text-accent-text" onclick={() => restore(item)}>Zurückholen</button>
        </div>
      {/each}
    </Group>
  {/if}
</Sheet>
