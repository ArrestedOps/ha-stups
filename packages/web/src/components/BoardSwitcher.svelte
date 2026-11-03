<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { api, type TemplateInfo } from '../lib/api';
  import { act, closeSheet, openSheet, selectBoard, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import SubmitPill from './SubmitPill.svelte';

  let name = $state('');
  let busy = $state(false);
  // Vorlagen: „" = leeres Board
  let templates = $state<TemplateInfo[]>([]);
  let template = $state('');
  const chosen = $derived(templates.find((x) => x.id === template) ?? null);
  const builtin = $derived(templates.filter((x) => x.builtin));
  const own = $derived(templates.filter((x) => !x.builtin));
  onMount(() => void api.templates().then((list) => (templates = list)).catch(() => undefined));

  async function create(e: Event) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    const board = await act(() => api.createBoard(n, template || undefined));
    busy = false;
    if (board) {
      name = '';
      template = '';
      await selectBoard(board.id);
    }
  }

  const links = $derived(
    (ui.isChild
      ? [['gear', t('Einstellungen'), 'settings']]
      : [
          ['settings', t('Board-Einstellungen'), 'boardSettings'],
          ['archive', t('Archiv'), 'archive'],
          ['trash', t('Papierkorb'), 'trash'],
          ['gear', t('Einstellungen'), 'settings'],
        ]) as readonly (readonly [string, string, 'boardSettings' | 'archive' | 'trash' | 'settings'])[],
  );
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
    {#if !ui.isChild}
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
    {#if templates.length > 0}
      <div class="px-4 py-2">
        <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
          <span>{t('Vorlage')}</span>
          <select class="min-h-11 max-w-[65%] rounded-xl bg-surface2 px-3" bind:value={template} aria-label={t('Vorlage für das neue Board')}>
            <option value="">{t('Leeres Board')}</option>
            <optgroup label={t('Eingebaute Vorlagen')}>
              {#each builtin as tpl (tpl.id)}<option value={tpl.id}>{tpl.name}</option>{/each}
            </optgroup>
            {#if own.length > 0}
              <optgroup label={t('Eigene Vorlagen')}>
                {#each own as tpl (tpl.id)}<option value={tpl.id}>{tpl.name}</option>{/each}
              </optgroup>
            {/if}
          </select>
        </label>
        {#if chosen}
          <p class="mt-1 text-[13px] text-fg2" data-testid="template-preview">
            {#if chosen.description}{chosen.description}<br />{/if}
            {tn('{n} Spalte', '{n} Spalten', chosen.columns)} · {tn('{n} Kategorie', '{n} Kategorien', chosen.categories)} · {tn('{n} Karte', '{n} Karten', chosen.cards)}
          </p>
        {/if}
      </div>
    {/if}
    {/if}
  </Group>

  <Group>
    {#each links as [icon, label, type] (type)}
      <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type })}>
        <Icon name={type === 'trash' ? 'trash' : icon} size={18} />{label}
      </button>
    {/each}
  </Group>
</Sheet>
