<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { api, type BoardDeletePreview, type Board, type WatcherChoice } from '../lib/api';
  import { cardsHead, lockText, moveTargets } from '../lib/boardAdmin';
  import { describeRecurrence } from '../lib/recurrence';
  import { actResult, toast, ui } from '../lib/store.svelte';
  import BoardDialog from './BoardDialog.svelte';
  import BoardTile from './BoardTile.svelte';
  import Icon from './Icon.svelte';
  import Segmented from './ui/Segmented.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Board löschen?": nennt, was betroffen ist (Aufgaben mit Zahl, wiederkehrende Aufgaben mit Regel, Wächter, persönliche Erinnerungen), und lässt
   * für jeden Wächter einzeln wählen: Pausieren (Standard), Umziehen in ein anderes Board (nicht in ein privates) oder Löschen. Der Server führt
   * alles in einer Transaktion aus und prüft die Wahl.
   */
  let { board, preview, ondone, onclose }: { board: Board; preview: BoardDeletePreview; ondone: () => void; onclose: () => void } = $props();

  type Pick = { action: 'pause' | 'move' | 'delete'; boardId: string };
  const targets = $derived(moveTargets(ui.boards, board.id));
  // svelte-ignore state_referenced_locally
  let picks = $state<Record<string, Pick>>(Object.fromEntries(preview.watchers.map((w) => [w.id, { action: 'pause', boardId: moveTargets(ui.boards, board.id)[0]?.id ?? '' }])));
  let busy = $state(false);
  const locked = $derived(lockText(preview));

  const items = $derived([
    { id: 'pause', label: t('Pausieren') },
    ...(targets.length > 0 ? [{ id: 'move', label: t('Umziehen') }] : []),
    { id: 'delete', label: t('Löschen') },
  ]);
  const targetOf = (id: string) => ui.boards.find((b) => b.id === picks[id]?.boardId);

  async function submit() {
    if (busy || locked) return;
    busy = true;
    const watchers: Record<string, WatcherChoice> = {};
    for (const w of preview.watchers) {
      const p = picks[w.id]!;
      watchers[w.id] = p.action === 'move' ? { action: 'move', boardId: p.boardId } : { action: p.action };
    }
    const r = await actResult(() => api.deleteBoardWith(board.id, watchers));
    busy = false;
    if (r.ok) {
      toast(t('„{name}“ gelöscht', { name: board.name }));
      ondone();
    }
  }
</script>

<BoardDialog title={t('„{name}“ löschen?', { name: board.name })} sub={t('Das ist davon betroffen:')} testid="board-delete-dialog" {onclose} wideOnDesktop>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <p class="flex items-center gap-2 px-1 text-[12px] font-bold tracking-[0.1em] text-fg2 uppercase">
        {t('Aufgaben')}<span class="inline-flex h-[22px] items-center rounded-full bg-count px-2.5 tracking-normal text-text-soft normal-case" data-testid="delete-cards">{cardsHead(preview.cards)}</span>
      </p>
      <p class="px-1 text-[14px] leading-[1.45] text-fg2">{t('Landen 30 Tage im Papierkorb und lassen sich dort wiederherstellen.')}</p>
    </div>

    {#if preview.recurring.length > 0}
      <div class="flex flex-col gap-1.5" data-testid="delete-recurring">
        <p class="flex items-center gap-2 px-1 text-[12px] font-bold tracking-[0.1em] text-fg2 uppercase">
          {t('Wiederkehrende Aufgaben')}<span class="inline-flex h-[22px] items-center rounded-full bg-count px-2.5 tracking-normal text-text-soft">{preview.recurring.length}</span>
        </p>
        {#each preview.recurring as c (c.id)}
          <div class="flex min-h-[60px] items-center gap-3 rounded-row border border-line bg-bg py-2 pr-3 pl-3">
            <Tile color="orange" size="sm"><Icon name="repeat" size={18} stroke={2} /></Tile>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-[15px] font-bold wrap-anywhere">{c.title}</span>
              <span class="text-[13px] text-fg2">{describeRecurrence(c.recurrence)}</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}

    {#if preview.watchers.length > 0}
      <div class="flex flex-col gap-1.5" data-testid="delete-watchers">
        <p class="flex items-center gap-2 px-1 text-[12px] font-bold tracking-[0.1em] text-fg2 uppercase">
          {t('Wächter')}<span class="inline-flex h-[22px] items-center rounded-full bg-count px-2.5 tracking-normal text-text-soft">{preview.watchers.length}</span>
        </p>
        {#each preview.watchers as w (w.id)}
          {@const p = picks[w.id]!}
          <div class="flex flex-col gap-2 rounded-row border bg-bg px-3 py-2.5 {p.action === 'move' ? 'border-line' : 'row-problem'}" data-testid="delete-watcher-{w.id}">
            <span class="text-[15px] font-bold wrap-anywhere">{w.name}</span>
            <Segmented small kind="choice" label={t('Was geschieht mit „{name}“?', { name: w.name })} value={p.action} {items} onchange={(id) => (picks[w.id]!.action = id as Pick['action'])} />
            {#if p.action === 'move'}
              <div class="relative flex min-h-[56px] items-center gap-3 rounded-row border border-line bg-surface py-1.5 pr-2.5 pl-2.5 focus-within:ring-2 focus-within:ring-accent">
                {#if targetOf(w.id)}<BoardTile board={targetOf(w.id)!} size="sm" />{/if}
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-[15px] font-bold">{targetOf(w.id)?.name ?? t('Board wählen')}</span>
                  <span class="text-[12.5px] text-fg2">{t('neues Ziel-Board')}</span>
                </span>
                <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-down" size={18} stroke={2} /></span>
                <select class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" bind:value={picks[w.id]!.boardId} aria-label={t('Ziel-Board für „{name}“', { name: w.name })}>
                  {#each targets as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
                </select>
              </div>
              <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Zuständige müssen dort Mitglieder sein, sonst „keine Aufgaben, braucht neue Zuständige“.')}</p>
            {:else if p.action === 'pause'}
              <p class="px-1 text-[12.5px] text-hint">{t('wird pausiert: Board fehlt')}</p>
            {:else}
              <p class="px-1 text-[12.5px] text-hint">{t('wird gelöscht')}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if preview.reminders > 0}
      <p class="px-1 text-[14px] leading-[1.45] text-fg2" data-testid="delete-reminders">{tn('{n} persönliche Erinnerung an Aufgaben dieses Boards entfällt mit den Aufgaben.', '{n} persönliche Erinnerungen an Aufgaben dieses Boards entfallen mit den Aufgaben.', preview.reminders)}</p>
    {/if}
    {#if locked}<p class="px-1 text-[14px] font-semibold text-danger" data-testid="delete-lock">{locked}</p>{/if}
  </div>

  {#snippet footer()}
    <button class="border-line-chip min-h-[50px] rounded-[14px] border bg-surface2 px-2 text-[15px] font-bold" onclick={onclose}>{t('Abbrechen')}</button>
    <button class="bg-danger-grad min-h-[50px] rounded-[14px] px-2 text-[15px] font-bold disabled:opacity-40" disabled={busy || !!locked} data-testid="delete-confirm" onclick={submit}>{t('Board löschen')}</button>
  {/snippet}
</BoardDialog>
