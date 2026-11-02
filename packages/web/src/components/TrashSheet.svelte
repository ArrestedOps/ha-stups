<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, type TrashItem } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { act, closeSheet, toast } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Sheet from './Sheet.svelte';

  let items = $state<TrashItem[] | null>(null);

  const LABEL = $derived({ board: t('Board'), column: t('Spalte'), category: t('Kategorie'), card: t('Karte') } as const);

  const load = async () => (items = await api.trash().catch(() => []));
  onMount(load);

  async function restore(item: TrashItem) {
    const ok = await act(() => api.restore(item.type, item.id).then(() => true));
    if (ok) toast(`${LABEL[item.type]} „${item.title}“ wiederhergestellt`);
    await load();
  }
</script>

<Sheet title={t('Papierkorb')} onclose={closeSheet}>
  {#if items === null}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else if items.length === 0}
    <p class="py-10 text-center text-fg2">{t('Der Papierkorb ist leer.')}</p>
  {:else}
    <Group hint={t('Gelöschtes bleibt 30 Tage erhalten und wird danach endgültig entfernt.')}>
      {#each items as item (item.type + item.id)}
        <div class="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2">
          <div class="min-w-0">
            <div class="truncate text-[17px]">{item.title}</div>
            <div class="text-[13px] text-fg2">{t('{type} · gelöscht {deleted} · weg am {purge}', { type: LABEL[item.type], deleted: formatDue(item.deletedAt), purge: formatDue(item.purgeAt).split(' ').slice(0, 2).join(' ') })}</div>
          </div>
          <button class="min-h-10 shrink-0 rounded-xl bg-surface2 px-3 font-semibold text-accent-text" onclick={() => restore(item)}>{t('Zurückholen')}</button>
        </div>
      {/each}
    </Group>
  {/if}
</Sheet>
