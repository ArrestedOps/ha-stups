<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api } from '../lib/api';
  import { columnForNew } from '../lib/calendar';
  import { formatDue, isFuture } from '../lib/datetime';
  import { boardColorKey, toggleId } from '../lib/schedule';
  import { act, closeSheet, openCardAnywhere, revealNewCard, selectBoard, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Sheet from './Sheet.svelte';
  import Chip from './ui/Chip.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';

  /** Zeitpunkt, auf den im Kalender getippt wurde (ISO) */
  let { at }: { at: string } = $props();

  const people = $derived(ui.people.filter((p) => p.isPerson));
  // Vorbelegung aus dem Filter: genau ein Board bzw. genau eine Person gewählt → die nehmen wir
  let boardId = $state(
    // svelte-ignore state_referenced_locally
    ui.sf.boardIds.length === 1 ? ui.sf.boardIds[0]! : (ui.boardId ?? ui.boards[0]?.id ?? ''),
  );
  let assigneeIds = $state<string[]>(
    // svelte-ignore state_referenced_locally
    ui.sf.personIds.length > 0 ? [...ui.sf.personIds] : ui.me?.isPerson ? [ui.me.id] : [],
  );
  let title = $state('');
  let busy = $state(false);

  const focus = (node: HTMLElement) => node.focus();

  async function columnFor(id: string): Promise<string | undefined> {
    const view = id === ui.boardId && ui.view ? ui.view : await api.board(id);
    return columnForNew(view.columns, isFuture(at));
  }

  async function create(e?: Event) {
    e?.preventDefault();
    if (!title.trim() || !boardId || busy) return;
    busy = true;
    const columnId = await columnFor(boardId);
    const card = columnId
      ? await act(() => api.createCard(boardId, { title: title.trim(), columnId, dueAt: at, assigneeIds }))
      : undefined;
    busy = false;
    if (!card) return;
    revealNewCard(card);
    closeSheet();
    toast(t('Karte angelegt'), { action: { label: t('Öffnen'), run: () => void openCardAnywhere({ id: card.id, boardId }) } });
  }

  /** Alle Felder: das volle Formular im gewählten Board, Termin vorbelegt */
  async function more() {
    if (!boardId) return;
    await selectBoard(boardId);
    const columnId = columnForNew(ui.view?.columns ?? [], isFuture(at));
    if (columnId) ui.sheet = { type: 'new', columnId, dueAt: at };
  }
</script>

{#snippet createButton()}
  <button class="min-h-11 px-3 text-[17px] font-semibold text-accent-text disabled:opacity-40" disabled={!title.trim() || busy} onclick={() => create()}>
    {busy ? t('Lege an …') : t('Anlegen')}
  </button>
{/snippet}

<Sheet title={t('Neue Karte')} onclose={closeSheet} right={createButton}>
  <form onsubmit={create} class="flex flex-col gap-3.5 pt-1 pb-2">
    <div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3">
      <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="slot-title">{t('Titel')}</label>
      <p class="text-[15px] font-semibold text-accent-text" data-testid="slot-time">{formatDue(at)}</p>
      <input
        id="slot-title"
        use:focus
        bind:value={title}
        maxlength="200"
        placeholder={t('Titel, z. B. Elektriker')}
        enterkeyhint="done"
        class="block min-h-6 w-full bg-transparent p-0 text-[18px] font-bold outline-none placeholder:text-dim"
      />
    </div>

    {#if ui.boards.length > 1}
      <div class="flex flex-col gap-2">
        <SectionHeader title="Board" />
        <div class="flex flex-wrap gap-2" role="group" aria-label="Board">
          {#each ui.boards as b, i (b.id)}
            <Chip active={boardId === b.id} pressed={boardId === b.id} onclick={() => (boardId = b.id)}>
              <i class="h-[9px] w-[9px] rounded-full" style:background={boardId === b.id ? 'currentColor' : `var(--c-${boardColorKey(b.color, i)}-fg)`}></i>{b.name}
            </Chip>
          {/each}
        </div>
      </div>
    {/if}

    <div class="flex flex-col gap-2">
      <SectionHeader title={t('Zuständig')} />
      <div class="flex flex-wrap gap-2" role="group" aria-label={t('Zuständig')}>
        {#each people as p (p.id)}
          {@const on = assigneeIds.includes(p.id)}
          <Chip active={on} pressed={on} photo onclick={() => (assigneeIds = toggleId(assigneeIds, p.id))}>
            <Avatar person={p} size={28} ring={on ? 0 : 1.5} />{p.displayName}
          </Chip>
        {/each}
      </div>
    </div>

    <button type="button" class="flex h-11 w-full items-center justify-center rounded-row border border-line bg-surface text-[16px] font-semibold text-accent-text" onclick={more}>
      {t('Alle Felder …')}
    </button>
  </form>
</Sheet>
