<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { boardMeta } from '../lib/boardAdmin';
  import { closeSheet, openSheet, selectBoard, ui } from '../lib/store.svelte';
  import BoardTile from './BoardTile.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Boards": nur noch die Auswahl (Name, offene Karten, wer es sieht), darunter „Neues Board erstellen", „Board-Einstellungen" und, wenn es
   * welche gibt, „Archivierte Boards". Oben rechts „Reihenfolge ändern". Die allgemeinen Einstellungen stehen nicht mehr hier (Profil oben).
   */
  const archived = $derived(ui.archivedBoards.length);
</script>

<Sheet title="Boards" onclose={closeSheet}>
  {#snippet right()}
    {#if !ui.isChild && ui.boards.length > 1}
      <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text" aria-label={t('Reihenfolge ändern')} onclick={() => openSheet({ type: 'boardOrder' })}>{t('Reihenfolge')}</button>
    {/if}
  {/snippet}

  <div class="flex flex-col gap-2 pt-1">
    {#each ui.boards as b (b.id)}
      {@const current = b.id === ui.boardId}
      {@const info = boardMeta(b, ui.people)}
      <ListRow title={b.name} {current} onclick={() => selectBoard(b.id)} label={b.name}>
        {#snippet tile()}<BoardTile board={b} />{/snippet}
        {#snippet meta()}{info.open}{#if info.who}<span class="truncate" data-testid="board-who-{b.id}">· {info.who}</span>{/if}{/snippet}
        {#snippet right()}{#if current}<span class="flex text-accent-text" aria-label={t('Geöffnet')}><Icon name="check" size={20} stroke={2.6} /></span>{/if}{/snippet}
      </ListRow>
    {/each}

    <div class="mt-3 flex flex-col gap-2">
      <ListRow title={t('Neues Board erstellen')} onclick={() => openSheet({ type: 'newBoard' })}>
        {#snippet tile()}<Tile color="green"><Icon name="plus" size={22} stroke={2} /></Tile>{/snippet}
        {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
      </ListRow>
      {#if !ui.isChild}
        <ListRow title={t('Board-Einstellungen')} onclick={() => openSheet({ type: 'boardSettings' })}>
          {#snippet tile()}<Tile color="gray"><Icon name="gear" size={22} stroke={1.8} /></Tile>{/snippet}
          {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
        </ListRow>
        {#if archived > 0}
          <ListRow title={t('Archivierte Boards')} onclick={() => openSheet({ type: 'archivedBoards' })}>
            {#snippet tile()}<Tile color="gray"><Icon name="archive" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{tn('{n} Board', '{n} Boards', archived)} · {t('wiederherstellen')}{/snippet}
            {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
          </ListRow>
        {/if}
      {/if}
    </div>
  </div>
</Sheet>
