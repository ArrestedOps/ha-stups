<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api, type Board, type BoardDeletePreview } from '../lib/api';
  import { actResult, toast } from '../lib/store.svelte';
  import BoardDialog from './BoardDialog.svelte';
  import Icon from './Icon.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Board archivieren?": das Board verschwindet aus Auswahl und Listen, Aufgaben und Einstellungen bleiben. Wächter auf dem Board pausieren
   * („Pausiert: Board archiviert") und laufen beim Wiederherstellen wieder; hier steht dazu nur der Hinweis, es gibt nichts zu wählen.
   */
  let { board, preview, ondone, onclose }: { board: Board; preview: BoardDeletePreview; ondone: () => void; onclose: () => void } = $props();
  let busy = $state(false);

  async function submit() {
    if (busy) return;
    busy = true;
    const r = await actResult(() => api.archiveBoard(board.id));
    busy = false;
    if (r.ok) {
      toast(t('„{name}“ archiviert', { name: board.name }));
      ondone();
    }
  }
</script>

<BoardDialog
  title={t('„{name}“ archivieren?', { name: board.name })}
  sub={t('Das Board verschwindet aus der Auswahl und den Listen. Aufgaben, Spalten und Einstellungen bleiben erhalten.')}
  testid="board-archive-dialog"
  {onclose}
>
  {#if preview.watchers.length > 0}
    <div class="flex flex-col gap-1.5" data-testid="archive-watchers">
      <p class="flex items-center gap-2 px-1 text-[12px] font-bold tracking-[0.1em] text-fg2 uppercase">
        {t('Wächter')}<span class="inline-flex h-[22px] items-center rounded-full bg-count px-2.5 tracking-normal text-text-soft">{preview.watchers.length}</span>
      </p>
      {#each preview.watchers as w (w.id)}
        <div class="flex min-h-[60px] items-center gap-3 rounded-row border border-line bg-bg py-2 pr-3 pl-3">
          <Tile color="purple" size="sm"><Icon name="shield" size={18} stroke={2} /></Tile>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-[15px] font-bold wrap-anywhere">{w.name}</span>
            <span class="text-[13px] text-fg2">{t('wird pausiert: Board archiviert')}</span>
          </span>
        </div>
      {/each}
      <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Beim Wiederherstellen des Boards laufen sie von selbst wieder.')}</p>
    </div>
  {/if}
  {#snippet footer()}
    <button class="border-line-chip min-h-[50px] rounded-[14px] border bg-surface2 px-2 text-[15px] font-bold" onclick={onclose}>{t('Abbrechen')}</button>
    <button class="bg-accent-grad glow-cta min-h-[50px] rounded-[14px] px-2 text-[15px] font-bold disabled:opacity-40" disabled={busy} data-testid="archive-confirm" onclick={submit}>{t('Archivieren')}</button>
  {/snippet}
</BoardDialog>
