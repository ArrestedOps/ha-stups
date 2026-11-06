<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { api, type TemplateInfo } from '../lib/api';
  import { act, closeSheet, openSheet, selectBoard, ui } from '../lib/store.svelte';
  import BoardTile from './BoardTile.svelte';
  import BoardVisibilityPicker from './BoardVisibilityPicker.svelte';
  import type { Visibility } from '../lib/boardAccess';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import Field from './ui/Field.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';

  let name = $state('');
  let busy = $state(false);
  // Wer das Board sieht und ob es zur Fairness zählt (Standard: alle, zählt mit). Ein Kind legt nur „Nur ich" an.
  let visibility = $state<Visibility>(ui.isChild ? 'private' : 'all');
  let memberIds = $state<string[]>([]);
  let counts = $state(true);
  // Vorlagen: „" = leeres Board
  let templates = $state<TemplateInfo[]>([]);
  let template = $state('');
  const chosen = $derived(templates.find((x) => x.id === template) ?? null);
  onMount(() => void api.templates().then((list) => (templates = list)).catch(() => undefined));

  /** Farbe und Symbol der Vorlagen-Kachel (eingebaute Vorlagen fest, eigene grau) */
  const TPL: Record<string, { color: TileColor; icon: string }> = {
    household: { color: 'teal', icon: 'home' },
    move: { color: 'red', icon: 'archive' },
    renovation: { color: 'purple', icon: 'settings' },
    packing: { color: 'blue', icon: 'checklist' },
    baby: { color: 'orange', icon: 'user' },
    ideas: { color: 'violet', icon: 'spark' },
  };
  const tpl = (id: string) => TPL[id] ?? { color: 'gray' as TileColor, icon: 'columns' };

  async function create(e?: Event) {
    e?.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    const board = await act(() =>
      api.createBoard(n, template || undefined, { visibility, countsForFairness: counts, ...(visibility === 'selected' ? { memberIds } : {}) }),
    );
    busy = false;
    if (board) {
      name = '';
      template = '';
      visibility = ui.isChild ? 'private' : 'all';
      memberIds = [];
      counts = true;
      await selectBoard(board.id);
    }
  }
</script>

<Sheet title="Boards" onclose={closeSheet}>
  {#snippet right()}
    {#if !ui.isChild}
      <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text" onclick={() => openSheet({ type: 'boardSettings' })}>{t('Bearbeiten')}</button>
    {/if}
  {/snippet}
  {#snippet footer()}
    <CtaButton disabled={!name.trim() || busy} onclick={() => create()}><Icon name="plus" size={22} stroke={2.2} />{t('Board anlegen')}</CtaButton>
  {/snippet}

  <div class="flex flex-col gap-3.5 pt-1">
    <div class="flex flex-col gap-2">
      {#each ui.boards as b (b.id)}
        {@const current = b.id === ui.boardId}
        <ListRow title={b.name} {current} onclick={() => selectBoard(b.id)} label={b.name}>
          {#snippet tile()}<BoardTile board={b} />{/snippet}
          {#snippet meta()}{t('{n} offen', { n: b.openCards })}{/snippet}
          {#snippet right()}{#if current}<span class="flex text-accent-text" aria-label={t('Geöffnet')}><Icon name="check" size={20} stroke={2.6} /></span>{/if}{/snippet}
        </ListRow>
      {/each}
      <ListRow title={t('Einstellungen')} onclick={() => openSheet({ type: 'settings' })}>
        {#snippet tile()}<Tile color="gray"><Icon name="gear" size={22} stroke={1.8} /></Tile>{/snippet}
        {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
      </ListRow>
    </div>

    <div>
      {#if !ui.isChild}
        <SectionHeader title={t('Neues Board')} />
        <p class="px-1 pt-1 pb-2 text-[12.5px] leading-[1.45] text-hint">{t('Starte leer oder mit einer Vorlage. Spalten und Kategorien sind danach frei änderbar.')}</p>
        <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('Vorlage für das neue Board')}>
          <button
            type="button"
            role="radio"
            aria-checked={template === ''}
            class="flex h-[84px] flex-col items-center justify-center gap-2 rounded-row border border-dashed text-[13px] font-semibold text-accent-text {template === '' ? 'border-accent bg-surface' : 'border-line bg-surface'}"
            onclick={() => (template = '')}
          >
            <Icon name="plus" size={24} stroke={1.8} />{t('Leer')}
          </button>
          {#each templates as x (x.id)}
            <button
              type="button"
              role="radio"
              aria-checked={template === x.id}
              class="flex h-[84px] flex-col items-center justify-center gap-2 rounded-row border bg-surface px-1 text-[13px] font-semibold {template === x.id ? 'border-accent' : 'border-line'}"
              onclick={() => (template = x.id)}
            >
              <Tile color={tpl(x.id).color} size="sm"><Icon name={tpl(x.id).icon} size={18} stroke={1.8} /></Tile>
              <span class="max-w-full truncate">{x.name}</span>
            </button>
          {/each}
        </div>
        {#if chosen}
          <p class="mt-2 px-1 text-[13px] text-fg2" data-testid="template-preview">
            {#if chosen.description}{chosen.description}<br />{/if}
            {tn('{n} Spalte', '{n} Spalten', chosen.columns)} · {tn('{n} Kategorie', '{n} Kategorien', chosen.categories)} · {tn('{n} Karte', '{n} Karten', chosen.cards)}
          </p>
        {/if}
      {:else}
        <SectionHeader title={t('Neues Board')} />
      {/if}
    </div>
    <form onsubmit={create}>
      <Field id="board-name" label={t('Name des neuen Boards')} bind:value={name} maxlength={80} enterkeyhint="done" placeholder={t('Neues Board')} />
    </form>
    <BoardVisibilityPicker
      {visibility}
      {memberIds}
      {counts}
      ownerId={ui.me?.id ?? null}
      onvisibility={(v) => (visibility = v)}
      onmembers={(ids) => (memberIds = ids)}
      oncounts={(on) => (counts = on)}
    />
  </div>
</Sheet>
