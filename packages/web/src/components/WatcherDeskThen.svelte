<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { symbolName } from '../lib/symbols/library';
  import { categorySuggested } from '../lib/watcher-desk';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { dueChipOf, dueFields, nameSymbol, type DueChip } from '../lib/watcher-flow';
  import { withCategory } from '../lib/watchers';
  import CardTile from './CardTile.svelte';
  import DeskBlock from './DeskBlock.svelte';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';
  import SelectField from './SelectField.svelte';
  import SymbolSheet from './SymbolSheet.svelte';
  import WatcherCategoryField from './WatcherCategoryField.svelte';

  /**
   * „Dann“ im Formular am Desktop: der Titel der Aufgabe (mit Symbol-Kachel) und darunter die Auswahlfelder als Pillen: Board, Spalte, Fällig,
   * Priorität und Kategorie des Wächters (vorbelegt, mit „vorgeschlagen“, solange sie von der Vorlage oder der Entität stammt). Die Regeln
   * (Fälligkeit, Priorität, Symbol) sind dieselben wie im Assistenten; die Beschreibung steht unter „Mehr Einstellungen“.
   */
  let { ed }: { ed: WatcherEditor } = $props();

  const uid = $props.id();
  const f = $derived(ed.form);
  const auto = $derived(f.icon ? null : (nameSymbol(f.title) ?? nameSymbol(f.entityName)));
  const look = $derived({ icon: f.icon || auto, iconColor: f.iconColor || null });
  let symbolOpen = $state(false);
  let dueOpen = $state(false);

  const chip = $derived(dueChipOf(f));
  const DUE: { id: Exclude<DueChip, 'custom'>; label: string }[] = $derived([
    { id: 'none', label: t('ohne Termin') },
    { id: 'now', label: t('sofort') },
    { id: 'in30', label: t('in 30 Min.') },
    { id: 'in60', label: t('in 1 Std.') },
    { id: 'evening', label: t('heute Abend') },
  ]);
  const showCustom = $derived(chip === 'custom' || dueOpen);
  /** Der Wert der Fällig-Pille: einer der festen Termine oder „Anders …“ */
  const dueValue = $derived(showCustom ? 'custom' : chip);
  function setDue(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    if (v === 'custom') {
      dueOpen = true;
      // „Anders …“ ohne Termin: gleich eine eigene Frist anbieten, damit die Felder darunter etwas zeigen
      if (f.dueKind === 'none') Object.assign(f, { dueKind: 'in', dueMinutes: '45' });
    } else {
      dueOpen = false;
      Object.assign(f, dueFields(v as Exclude<DueChip, 'custom'>));
    }
  }

  const PRIORITY = $derived([
    { id: 'low', label: t('Niedrig') },
    { id: 'medium', label: t('Mittel') },
    { id: 'high', label: t('Hoch') },
  ]);
  // „Mittel“ ist die Vorgabe: ohne Angabe gilt sie, eine gespeicherte „medium“ bleibt erhalten
  const priority = $derived(f.priority === '' ? 'medium' : f.priority);
  function setPriority(e: Event & { currentTarget: HTMLSelectElement }) {
    const id = e.currentTarget.value;
    f.priority = id === 'medium' ? (f.priority === 'medium' ? 'medium' : '') : (id as 'low' | 'high');
  }
  const suggested = $derived(categorySuggested(f));
</script>

<DeskBlock n={2} title={t('Dann')} testid="desk-then">
  <!-- Titel der Aufgabe mit Symbol (Funken: automatisch erkannt) -->
  <div class="focus-ring-in flex items-center gap-3 rounded-row border border-line bg-bg px-3 py-2">
    <button
      type="button"
      class="relative block shrink-0 rounded-[14px]"
      aria-label={t('Symbol ändern, gerade: {name}', { name: symbolName(look.icon) })}
      data-testid="symbol-tile"
      onclick={() => (symbolOpen = true)}
    >
      <CardTile card={look} size="md" />
      {#if !f.icon}
        <span class="bg-accent-grad absolute -right-[5px] -bottom-[5px] flex h-[20px] w-[20px] items-center justify-center rounded-full border-2 border-bg !shadow-none" data-testid="symbol-spark"><Icon name="spark" size={11} fill /></span>
      {/if}
    </button>
    <label class="sr-only" for="{uid}-title">{t('Titel der Aufgabe')}</label>
    <input id="{uid}-title" class="min-h-10 min-w-0 flex-1 bg-transparent text-[17px] font-bold outline-none placeholder:text-dim" bind:value={f.title} maxlength="200" placeholder={t('Titel der Aufgabe, z. B. Waschmaschine ausräumen')} autocapitalize="sentences" data-testid="desk-title" />
  </div>

  <div class="flex flex-wrap items-start gap-2" data-testid="desk-pills">
    <SelectField variant="pill" caption={t('Board')} label="Board" bind:value={f.boardId} onchange={() => ed.pruneToBoard()}>
      {#each ed.boardOptions as o (o.id)}<option value={o.id} disabled={o.disabled} data-short={o.short}>{o.label}</option>{/each}
    </SelectField>
    <SelectField variant="pill" caption={t('Spalte')} label={t('Spalte')} bind:value={f.columnId}>
      {#each ed.view?.columns ?? [] as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </SelectField>
    <SelectField variant="pill" caption={t('Fällig')} label={t('Fällig')} value={dueValue} onchange={setDue}>
      {#each DUE as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
      <option value="custom">{t('Anders …')}</option>
    </SelectField>
    <SelectField variant="pill" caption={t('Priorität')} label={t('Priorität')} value={priority} onchange={setPriority}>
      {#each PRIORITY as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
    </SelectField>
    <WatcherCategoryField pill value={f.category} options={ed.categoryNames} onchange={(v) => (ed.form = withCategory(ed.form, v))} />
    {#if suggested}
      <span class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-count px-2.5 text-[12px] font-bold text-text-soft" data-testid="category-suggested">
        <Icon name="spark" size={12} fill />{t('vorgeschlagen')}
      </span>
    {/if}
  </div>

  {#if showCustom}
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-row border border-line bg-bg px-3.5 py-2.5" data-testid="due-custom">
      <SelectField bind:value={f.dueKind} label={t('Fälligkeit')} variant="box">
        <option value="none">{t('Ohne Termin')}</option>
        <option value="in">{t('In … Minuten')}</option>
        <option value="at">{t('Heute oder morgen um …')}</option>
      </SelectField>
      {#if f.dueKind === 'in'}
        <span class="flex items-center gap-2 text-[14px]">{t('Minuten')}<NumberField bind:value={f.dueMinutes} label={t('Minuten bis zur Fälligkeit')} unit={t('Min.')} /></span>
      {:else if f.dueKind === 'at'}
        <span class="flex items-center gap-2">
          <SelectField bind:value={f.dueDay} label={t('Tag')} variant="box">
            <option value="today">{t('heute')}</option>
            <option value="tomorrow">{t('morgen')}</option>
          </SelectField>
          <input type="time" class="h-11 rounded-xl border border-track bg-bg px-2 text-[15px] font-bold" bind:value={f.dueTime} aria-label={t('Uhrzeit')} />
        </span>
      {/if}
    </div>
  {/if}
</DeskBlock>

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
