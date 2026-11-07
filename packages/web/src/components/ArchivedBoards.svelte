<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { api } from '../lib/api';
  import { boardMeta } from '../lib/boardAdmin';
  import { actResult, closeSheet, openSheet, toast, ui } from '../lib/store.svelte';
  import BoardTile from './BoardTile.svelte';
  import Sheet from './Sheet.svelte';

  /** „Archivierte Boards": jedes mit „Wiederherstellen" (das Board ist danach wieder in der Auswahl, seine Wächter laufen wieder) */
  let busy = $state<string | null>(null);

  async function restore(id: string, name: string) {
    if (busy) return;
    busy = id;
    const r = await actResult(() => api.unarchiveBoard(id));
    busy = null;
    if (r.ok) toast(t('„{name}“ ist wieder da', { name }));
    if (r.ok && ui.archivedBoards.length === 0) openSheet({ type: 'boards' });
  }
</script>

<Sheet title={t('Archivierte Boards')} onclose={closeSheet}>
  {#snippet left()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={() => openSheet({ type: 'boards' })}>{t('Zurück')}</button>
  {/snippet}
  <div class="flex flex-col gap-2 pt-1" data-testid="archived-boards">
    <p class="px-1 pb-1 text-[12.5px] leading-[1.45] text-hint">{t('Archivierte Boards stehen in keiner Liste. Aufgaben und Einstellungen bleiben erhalten.')}</p>
    {#each ui.archivedBoards as b (b.id)}
      {@const info = boardMeta(b, ui.people)}
      <div class="flex min-h-row items-center gap-3 rounded-row border border-line bg-surface py-2 pr-2.5 pl-3" data-testid="archived-{b.id}">
        <BoardTile board={b} />
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate text-[15px] font-bold tracking-tight">{b.name}</span>
          <span class="truncate text-[13px] text-fg2">{tn('{n} offene Karte', '{n} offene Karten', b.openCards)}{#if info.who} · {info.who}{/if}</span>
        </span>
        <button
          type="button"
          class="inline-flex h-10 shrink-0 items-center rounded-xl bg-surface2 px-3.5 text-[14px] font-bold text-accent-text disabled:opacity-50"
          disabled={busy !== null}
          aria-label={t('{name} wiederherstellen', { name: b.name })}
          onclick={() => restore(b.id, b.name)}>{t('Wiederherstellen')}</button
        >
      </div>
    {:else}
      <p class="px-1 py-6 text-center text-fg2">{t('Es gibt keine archivierten Boards.')}</p>
    {/each}
  </div>
</Sheet>
