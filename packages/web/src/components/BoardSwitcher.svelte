<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api } from '../lib/api';
  import { act, closeSheet, openSheet, selectBoard, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import SubmitPill from './SubmitPill.svelte';

  let name = $state('');
  let busy = $state(false);

  async function create(e: Event) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    const board = await act(() => api.createBoard(n));
    busy = false;
    if (board) {
      name = '';
      await selectBoard(board.id);
    }
  }

  const links = $derived([
    ['settings', t('Board-Einstellungen'), 'boardSettings'],
    ['archive', t('Archiv'), 'archive'],
    ['trash', t('Papierkorb'), 'trash'],
    ['gear', t('Einstellungen'), 'settings'],
  ] as const);
</script>

<Sheet title="Boards" onclose={closeSheet}>
  <Group>
    {#each ui.boards as b (b.id)}
      <button class="flex min-h-[52px] w-full items-center justify-between px-4 text-left" onclick={() => selectBoard(b.id)}>
        <span class="flex items-center gap-3 text-[17px] {b.id === ui.boardId ? 'font-semibold' : ''}">
          {#if b.id === ui.boardId}<Icon name="check" size={18} stroke={3} />{:else}<span class="w-[18px]"></span>{/if}
          {b.name}
        </span>
        <span class="text-[15px] text-fg2">{t('{n} offen', { n: b.openCards })}</span>
      </button>
    {/each}
    <form onsubmit={create} class="flex min-h-[52px] items-center gap-3 px-4">
      <Icon name="plus" size={18} />
      <input
        bind:value={name}
        placeholder={t('Neues Board')}
        maxlength="80"
        enterkeyhint="done"
        class="min-w-0 flex-1 bg-transparent py-3"
        aria-label={t('Name des neuen Boards')}
      />
      <SubmitPill show={!!name.trim()} {busy} />
    </form>
  </Group>

  <Group>
    {#each links as [icon, label, type] (type)}
      <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type })}>
        <Icon name={type === 'trash' ? 'trash' : icon} size={18} />{label}
      </button>
    {/each}
  </Group>
</Sheet>
