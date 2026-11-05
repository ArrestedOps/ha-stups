<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, type TrashItem } from '../lib/api';
  import { act, closeSheet, openSheet, toast } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Banner from './ui/Banner.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';

  let items = $state<TrashItem[] | null>(null);

  const LABEL = $derived({ board: t('Board'), column: t('Spalte'), category: t('Kategorie'), card: t('Karte') } as const);
  const TILE: Record<TrashItem['type'], { color: TileColor; icon: string }> = {
    card: { color: 'orange', icon: 'trash' },
    board: { color: 'blue', icon: 'kanban' },
    column: { color: 'teal', icon: 'columns' },
    category: { color: 'violet', icon: 'tag' },
  };
  /** Wie viele Tage der Eintrag noch zu holen ist (abgerundet auf ganze Tage, mindestens 0) */
  const daysLeft = (item: TrashItem) => Math.max(0, Math.floor((Date.parse(item.purgeAt) - Date.now()) / 86_400_000));

  const load = async () => (items = await api.trash().catch(() => []));
  onMount(load);

  async function restore(item: TrashItem) {
    const ok = await act(() => api.restore(item.type, item.id).then(() => true));
    if (ok) toast(t('{type} „{title}“ wiederhergestellt', { type: LABEL[item.type], title: item.title }));
    await load();
  }
</script>

<Sheet title={t('Papierkorb')} onclose={closeSheet}>
  {#snippet left()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={() => openSheet({ type: 'boardSettings' })}>{t('Zurück')}</button>
  {/snippet}
  <div class="flex flex-col gap-3.5 pt-1">
    {#if items === null}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else if items.length === 0}
      <p class="py-10 text-center text-fg2">{t('Der Papierkorb ist leer.')}</p>
    {:else}
      <Banner variant="warm" title={t('30 Tage Bedenkzeit')} sub={t('Danach löscht Stups die Karten endgültig.')}>
        {#snippet leading()}<Icon name="clock" size={28} stroke={1.7} />{/snippet}
      </Banner>
      <div class="flex flex-col gap-2">
        {#each items as item (item.type + item.id)}
          {@const left = daysLeft(item)}
          <ListRow title={item.title}>
            {#snippet tile()}<span class="opacity-75"><Tile color={TILE[item.type].color}><Icon name={TILE[item.type].icon} size={22} stroke={1.8} /></Tile></span>{/snippet}
            {#snippet meta()}
              <span class={left <= 3 ? 'text-danger' : ''}>{t('noch {n} Tage', { n: left })}</span><span class="text-sep">•</span>{LABEL[item.type]}
            {/snippet}
            {#snippet right()}
              <button class="bg-surface2 inline-flex h-[34px] w-9 shrink-0 items-center justify-center rounded-[12px] text-text-soft" aria-label={t('{title} wiederherstellen', { title: item.title })} onclick={() => restore(item)}>
                <Icon name="undo" size={16} stroke={2.2} />
              </button>
            {/snippet}
          </ListRow>
        {/each}
      </div>
      <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{tn('{n} Eintrag', '{n} Einträge', items.length)} · {t('Gelöschtes bleibt 30 Tage erhalten und wird danach endgültig entfernt.')}</p>
    {/if}
  </div>
</Sheet>
