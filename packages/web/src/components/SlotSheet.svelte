<script lang="ts">
  import { api } from '../lib/api';
  import { columnForNew } from '../lib/calendar';
  import { formatDue, isFuture } from '../lib/datetime';
  import { boardColorKey, toggleId } from '../lib/schedule';
  import { act, closeSheet, openCardAnywhere, selectBoard, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Sheet from './Sheet.svelte';

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
    closeSheet();
    toast('Karte angelegt', { action: { label: 'Öffnen', run: () => void openCardAnywhere({ id: card.id, boardId }) } });
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
    {busy ? 'Lege an …' : 'Anlegen'}
  </button>
{/snippet}

<Sheet title="Neue Karte" onclose={closeSheet} right={createButton}>
  <form onsubmit={create} class="pt-1 pb-2">
    <p class="px-1 text-[15px] font-semibold text-accent-text" data-testid="slot-time">{formatDue(at)}</p>
    <input
      use:focus
      bind:value={title}
      maxlength="200"
      placeholder="Titel, z. B. Elektriker"
      enterkeyhint="done"
      class="mt-1 block w-full bg-transparent px-1 py-2 focus-visible:outline-none text-[26px] leading-tight font-bold tracking-tight"
      aria-label="Titel"
    />

    {#if ui.boards.length > 1}
      <h3 class="mt-4 mb-2 px-1 text-[13px] font-semibold text-fg2 uppercase">Board</h3>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Board">
        {#each ui.boards as b, i (b.id)}
          <button
            type="button"
            class="flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[15px] {boardId === b.id ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}"
            aria-pressed={boardId === b.id}
            onclick={() => (boardId = b.id)}
          >
            <i class="h-[9px] w-[9px] rounded-full" style:background="var(--c-{boardColorKey(b.color, i)}-fg)"></i>{b.name}
          </button>
        {/each}
      </div>
    {/if}

    <h3 class="mt-4 mb-2 px-1 text-[13px] font-semibold text-fg2 uppercase">Zuständig</h3>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Zuständig">
      {#each people as p (p.id)}
        {@const on = assigneeIds.includes(p.id)}
        <button
          type="button"
          class="flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[15px] {on ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}"
          aria-pressed={on}
          onclick={() => (assigneeIds = toggleId(assigneeIds, p.id))}
        >
          <Avatar person={p} size={20} />{p.displayName}
        </button>
      {/each}
    </div>

    <button type="button" class="mt-5 min-h-11 w-full rounded-xl border border-line text-[16px] text-accent-text" onclick={more}>
      Alle Felder …
    </button>
  </form>
</Sheet>
