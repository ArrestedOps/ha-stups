<script lang="ts">
  import { cardTitleWithEntity } from '../lib/cardTitle';
  import { t } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';
    import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { dueChipOf, dueFields, dueText, nameSymbol, type DueChip } from '../lib/watcher-flow';
  import CardTile from './CardTile.svelte';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';
  import SelectField from './SelectField.svelte';
  import SymbolSheet from './SymbolSheet.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Segmented from './ui/Segmented.svelte';
  import Tile from './ui/Tile.svelte';
  import { symbolName } from '../lib/symbols/library';

  /**
   * „Dann": welche Aufgabe entstehen soll. Im Assistenten (Schritt 2) mit der Vorschau „So erscheint sie"; im Ablauf klappt es in der Aufgabe DANN KARTE
   * auf (`preview` aus: die Vorschau steht schon in der Aufgabe).
   */
  let { ed, preview = true }: { ed: WatcherEditor; preview?: boolean } = $props();

  const f = $derived(ed.form);
  const board = $derived(ui.boards.find((b) => b.id === f.boardId));
  const column = $derived(ed.view?.columns.find((c) => c.id === f.columnId));
  const auto = $derived(f.icon ? null : (nameSymbol(f.title) ?? nameSymbol(f.entityName)));
  /** Der Titel der Aufgabe, wie sie entsteht: mit dem Namen der Entität (siehe cardTitle.ts) */
  const shownTitle = $derived(cardTitleWithEntity(f.title, f.kind, f.entityName || f.entityId) || '…');
  const look = $derived({ icon: f.icon || auto, iconColor: f.iconColor || null });
  let symbolOpen = $state(false);
  let dueOpen = $state(false);

  const chip = $derived(dueChipOf(f));
  const DUE: { id: Exclude<DueChip, 'custom'>; label: string }[] = $derived([
    { id: 'now', label: t('sofort') },
    { id: 'in30', label: t('in 30 Min.') },
    { id: 'in60', label: t('in 1 Std.') },
    { id: 'evening', label: t('heute Abend') },
    { id: 'none', label: t('ohne Termin') },
  ]);
  const setDue = (id: Exclude<DueChip, 'custom'>) => {
    Object.assign(f, dueFields(id));
    dueOpen = false;
  };
  const showCustom = $derived(chip === 'custom' || dueOpen);

  const PRIORITY = $derived([
    { id: 'low', label: t('Niedrig') },
    { id: 'medium', label: t('Mittel') },
    { id: 'high', label: t('Hoch') },
  ]);
  // „Mittel" ist die Vorgabe: ohne Angabe gilt sie, eine gespeicherte „medium" bleibt erhalten
  const priority = $derived(f.priority === '' ? 'medium' : f.priority);
  const setPriority = (id: string) => (f.priority = id === 'medium' ? (f.priority === 'medium' ? 'medium' : '') : (id as 'low' | 'high'));
  const toggle = (id: string) => (f.categoryIds = f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id]);
</script>

<div class="flex flex-col gap-3.5" data-testid="then-editor">
  <!-- Titel der Aufgabe mit Symbol (Funken: automatisch erkannt) -->
  <div class="focus-ring-in flex items-center gap-3 rounded-row border border-line bg-surface px-3.5 py-3">
    <button
      type="button"
      class="relative block shrink-0 rounded-[14px]"
      aria-label={t('Symbol ändern, gerade: {name}', { name: symbolName(look.icon) })}
      data-testid="symbol-tile"
      onclick={() => (symbolOpen = true)}
    >
      <CardTile card={look} size="lg" />
      {#if !f.icon}
        <span class="bg-accent-grad absolute -right-[5px] -bottom-[5px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface !shadow-none" data-testid="symbol-spark"><Icon name="spark" size={12} fill /></span>
      {/if}
    </button>
    <span class="flex min-w-0 flex-1 flex-col gap-1.5">
      <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="watcher-card-title">{t('Titel der Aufgabe')}</label>
      <input id="watcher-card-title" class="min-h-6 w-full bg-transparent text-[18px] font-bold placeholder:text-dim" bind:value={f.title} maxlength="200" placeholder={t('z. B. Waschmaschine ausräumen')} autocapitalize="sentences" />
    </span>
  </div>

  <!-- Board und Spalte: die Zeile zeigt die Wahl, darüber liegt das Auswahlfeld des Handys -->
  <div class="flex flex-col gap-2">
    <div class="relative flex min-h-row py-2 items-center gap-3 rounded-row border border-line bg-surface pr-2.5 pl-3 focus-within:ring-2 focus-within:ring-accent">
      <Tile color="orange"><Icon name="layers" size={22} stroke={1.8} /></Tile>
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="wrap-anywhere text-[15px] font-bold tracking-tight">{board?.name ?? t('Board wählen')}</span>
        <span class="wrap-anywhere text-[13px] text-fg2">{t('Board')}</span>
      </span>
      <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>
      <select class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" bind:value={f.boardId} aria-label="Board" onchange={() => ed.pruneToBoard()}>
        {#each ed.boardOptions as o (o.id)}<option value={o.id} disabled={o.disabled} data-short={o.short}>{o.label}</option>{/each}
      </select>
    </div>
    <div class="relative flex min-h-row py-2 items-center gap-3 rounded-row border border-line bg-surface pr-2.5 pl-3 focus-within:ring-2 focus-within:ring-accent">
      <Tile color="gray"><Icon name="columns" size={22} stroke={1.8} /></Tile>
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="wrap-anywhere text-[15px] font-bold tracking-tight">{column?.name ?? t('Spalte wählen')}</span>
        <span class="wrap-anywhere text-[13px] text-fg2">{t('Spalte')}</span>
      </span>
      <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>
      <select class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" bind:value={f.columnId} aria-label={t('Spalte')}>
        {#each ed.view?.columns ?? [] as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
  </div>

  <SectionHeader title={t('Fällig')} />
  <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Fälligkeit')}>
    {#each DUE as d (d.id)}
      <Chip small active={chip === d.id} pressed={chip === d.id} onclick={() => setDue(d.id)}>{d.label}</Chip>
    {/each}
    <Chip small active={showCustom} pressed={showCustom} onclick={() => (dueOpen = !dueOpen)}>{t('Anders …')}</Chip>
  </div>
  {#if showCustom}
    <div class="flex flex-col gap-2 rounded-row border border-line bg-surface px-3.5 py-3" data-testid="due-custom">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[15px] font-bold">{t('Fälligkeit')}</span>
        <SelectField bind:value={f.dueKind} label={t('Fälligkeit')}>
          <option value="none">{t('Ohne Termin')}</option>
          <option value="in">{t('In … Minuten')}</option>
          <option value="at">{t('Heute oder morgen um …')}</option>
        </SelectField>
      </div>
      {#if f.dueKind === 'in'}
        <div class="flex items-center justify-between gap-3">
          <span class="text-[15px]">{t('Minuten')}</span>
          <NumberField bind:value={f.dueMinutes} label={t('Minuten bis zur Fälligkeit')} unit={t('Min.')} />
        </div>
      {:else if f.dueKind === 'at'}
        <div class="flex items-center justify-between gap-3">
          <span class="text-[15px]">{t('Tag und Uhrzeit')}</span>
          <span class="flex items-center gap-2">
            <SelectField bind:value={f.dueDay} label={t('Tag')}>
              <option value="today">{t('heute')}</option>
              <option value="tomorrow">{t('morgen')}</option>
            </SelectField>
            <input type="time" class="h-10 rounded-xl border border-track bg-bg px-2 text-[15px] font-bold" bind:value={f.dueTime} aria-label={t('Uhrzeit')} />
          </span>
        </div>
      {/if}
    </div>
  {/if}

  <SectionHeader title={t('Priorität')} />
  <Segmented small items={PRIORITY} value={priority} label={t('Priorität')} onchange={setPriority} />

  {#if ed.view?.categories.length}
    <SectionHeader title={t('Kategorien')} />
    <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Kategorien')}>
      {#each ed.view.categories as c (c.id)}
        <Chip small active={f.categoryIds.includes(c.id)} pressed={f.categoryIds.includes(c.id)} onclick={() => toggle(c.id)}>{c.name}</Chip>
      {/each}
    </div>
  {/if}

  <SectionHeader title={t('Beschreibung')} />
  <label class="focus-ring-in flex rounded-row border border-line bg-surface px-3.5 py-3">
    <textarea class="min-h-[44px] w-full resize-none bg-transparent text-[15px] leading-[1.45] font-medium placeholder:text-dim" rows="2" bind:value={f.description} placeholder={t('Beschreibung (optional)')} aria-label={t('Beschreibung')}></textarea>
  </label>

  {#if preview}
    <SectionHeader title={t('So erscheint sie')} />
    <div class="rounded-[18px] border border-dashed border-track bg-surface-inset p-2.5" data-testid="card-preview">
      <ListRow wrap variant="task" title={shownTitle} check={{ done: false, label: t('Vorschau'), onchange: () => {}, disabled: true }}>
        {#snippet tile()}<CardTile card={look} />{/snippet}
        {#snippet meta()}<span class="shrink-0">{dueText(f)}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span><span class="wrap-anywhere">{board?.name ?? ''}</span>{/snippet}
        {#snippet right()}<span class="flex text-fg2"><Icon name="shield" size={18} stroke={1.8} /></span>{/snippet}
      </ListRow>
    </div>
  {/if}
</div>

{#if symbolOpen}
  <SymbolSheet
    title={f.title}
    icon={look.icon}
    color={f.iconColor || null}
    source={f.icon ? 'manual' : 'auto'}
    onpick={(v) => {
      f.icon = v.icon;
      f.iconColor = v.color ?? '';
      symbolOpen = false;
    }}
    onclose={() => (symbolOpen = false)}
  />
{/if}
