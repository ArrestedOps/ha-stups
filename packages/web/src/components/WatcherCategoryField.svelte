<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { categoryKeyOf, categoryOptions } from '../lib/watcherList';
  import SelectField from './SelectField.svelte';

  /**
   * Kategorie eines Wächters wählen: eine vorhandene (oder die vorgeschlagene), „Ohne Kategorie" oder „Neue Kategorie …" mit einem Textfeld
   * für einen eigenen Namen (höchstens 40 Zeichen). Gleiche Namen ohne Beachtung der Groß-/Kleinschreibung legt der Server zusammen.
   * `options`: die Kategorien, die es schon gibt; die aktuelle Wahl steht immer dabei.
   */
  let {
    value,
    options,
    disabled = false,
    pill = false,
    onchange,
  }: { value: string; options: string[]; disabled?: boolean; onchange: (value: string) => void; /** Formular am Desktop: Auswahl als Pille „KATEGORIE …“, das Feld für einen neuen Namen steht daneben */ pill?: boolean } = $props();

  const NEW = '\u0000new';
  let custom = $state(false);
  let input = $state<HTMLInputElement>();
  const list = $derived(categoryOptions(options, custom ? '' : value));
  const selected = $derived(custom ? NEW : (list.find((o) => categoryKeyOf(o) === categoryKeyOf(value)) ?? ''));

  function pick(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    custom = v === NEW;
    onchange(custom ? '' : v);
    if (custom) queueMicrotask(() => input?.focus());
  }
</script>

<div class="flex min-w-0 gap-2 {pill ? 'flex-wrap items-center' : 'flex-col'}" data-testid="category-field">
  <SelectField
    variant={pill ? 'pill' : 'box'}
    caption={pill ? t('Kategorie') : undefined}
    label={t('Kategorie')}
    value={selected}
    {disabled}
    onchange={pick}
    class={pill ? '' : 'w-full justify-between'}
  >
    <option value="">{t('Ohne Kategorie')}</option>
    {#each list as o (o)}<option value={o}>{o}</option>{/each}
    <option value={NEW}>{t('Neue Kategorie …')}</option>
  </SelectField>
  {#if custom && !disabled}
    <input
      bind:this={input}
      class="min-h-11 rounded-xl border border-line bg-surface2 px-3 text-[16px] font-semibold placeholder:text-dim focus:border-brand-dot focus:outline-none {pill ? 'w-56 max-w-full' : 'w-full'}"
      maxlength="40"
      placeholder={t('Name der Kategorie')}
      aria-label={t('Name der neuen Kategorie')}
      data-testid="category-new"
      {value}
      oninput={(e) => onchange(e.currentTarget.value)}
    />
  {/if}
</div>
