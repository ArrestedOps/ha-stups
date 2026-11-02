<script lang="ts">
  import { t, tx } from '../lib/i18n/index.svelte';
  import { names } from '../lib/i18n/names';
  import SelectField from './SelectField.svelte';
  import type { CarryField } from '../lib/api';
  import { CARRY_OPTIONS, toggleCarry } from '../lib/carry';
  import {
    describeRecurrence,
    editorFromRule,
    ruleFromEditor,
    type Recurrence,
    type RecurrenceEditor,
  } from '../lib/recurrence';

  let {
    value,
    dueAt,
    carryOver,
    onchange,
    oncarry,
  }: {
    value: Recurrence | null;
    dueAt: string | null;
    /** Felder, die die nächste Karte übernimmt */
    carryOver: CarryField[];
    onchange: (rule: Recurrence | null) => void;
    oncarry: (fields: CarryField[]) => void;
  } = $props();

  // Der Editor wird feldweise geändert (tiefe Reaktivität), deshalb $state statt writable $derived
  // eslint-disable-next-line svelte/prefer-writable-derived
  let editor = $state<RecurrenceEditor>(editorFromRule(null));
  $effect(() => {
    editor = editorFromRule(value);
  });

  const DAYS = $derived([1, 2, 3, 4, 5, 6, 0].map((d) => names().weekdaysShort[d]!));
  const MODES = $derived([
    ['none', t('Nie')],
    ['daily', t('Täglich')],
    ['weekly', t('Wöchentlich')],
    ['monthly', t('Monatlich')],
    ['yearly', t('Jährlich')],
    ['after', t('Nach Erledigung')],
  ] as const);

  function commit() {
    if (!dueAt) return;
    onchange(ruleFromEditor(editor, dueAt));
  }

  function set<K extends keyof RecurrenceEditor>(key: K, v: RecurrenceEditor[K]) {
    editor[key] = v;
    commit();
  }

  function toggleDay(d: number) {
    editor.weekdays = editor.weekdays.includes(d) ? editor.weekdays.filter((x) => x !== d) : [...editor.weekdays, d];
    commit();
  }

  const preview = $derived(dueAt && editor.mode !== 'none' ? describeRecurrence(ruleFromEditor(editor, dueAt)!) : '');
  const everyUnit = $derived(
    {
      daily: t('Tage'),
      weekly: t('Wochen'),
      monthly: t('Monate'),
      yearly: t('Jahre'),
      after: '',
      none: '',
    }[editor.mode],
  );
</script>

{#if !dueAt}
  <p class="text-[15px] text-fg2">{t('Für eine Wiederholung zuerst eine Fälligkeit setzen.')}</p>
{:else}
  <div class="flex flex-col gap-3">
    <SelectField variant="box" value={editor.mode} onchange={(e) => set('mode', e.currentTarget.value as RecurrenceEditor['mode'])} label={t('Wiederholung')}>
      {#each MODES as [mode, label] (mode)}<option value={mode}>{label}</option>{/each}
    </SelectField>

    {#if editor.mode !== 'none'}
      <div class="flex items-center gap-2 text-[15px]">
        <span>{editor.mode === 'after' ? tx('Wiederholung', 'Nach') : tx('Wiederholung', 'Alle')}</span>
        <input
          type="number"
          min="1"
          max="999"
          inputmode="numeric"
          class="min-h-11 w-20 rounded-xl border border-line bg-surface2 px-3 text-center"
          value={editor.every}
          onchange={(e) => set('every', Number(e.currentTarget.value))}
          aria-label={t('Abstand')}
        />
        {#if editor.mode === 'after'}
          <SelectField variant="box" value={editor.unit} onchange={(e) => set('unit', e.currentTarget.value as RecurrenceEditor['unit'])} label={t('Einheit')}>
            <option value="days">{t('Tage')}</option>
            <option value="weeks">{t('Wochen')}</option>
            <option value="months">{t('Monate')}</option>
          </SelectField>
        {:else}
          <span>{everyUnit}</span>
        {/if}
      </div>
    {/if}

    {#if editor.mode === 'weekly'}
      <div class="flex gap-1.5" role="group" aria-label={t('Wochentage')}>
        {#each DAYS as day, i (day)}
          <button
            type="button"
            aria-pressed={editor.weekdays.includes(i + 1)}
            class="min-h-10 flex-1 rounded-xl border text-[14px] {editor.weekdays.includes(i + 1)
              ? 'border-accent bg-surface2 font-semibold'
              : 'border-line text-fg2'}"
            onclick={() => toggleDay(i + 1)}
          >
            {day}
          </button>
        {/each}
      </div>
    {/if}

    {#if editor.mode === 'monthly'}
      <label class="flex items-center gap-2 text-[15px]">
        <span>{t('am')}</span>
        <SelectField variant="box" value={editor.monthDay} onchange={(e) => set('monthDay', Number(e.currentTarget.value))} label={t('Tag im Monat')}>
          <option value={0}>{t('Tag des Termins')}</option>
          {#each Array.from({ length: 31 }, (_, i) => i + 1) as d (d)}<option value={d}>{d}.</option>{/each}
          <option value={-1}>{t('letzten Tag')}</option>
        </SelectField>
      </label>
    {/if}

    {#if preview}
      <p class="text-[13px] text-fg2">
        {editor.mode === 'after'
          ? t('Der nächste Termin ist {rule}, gerechnet ab dem Erledigen.', { rule: preview })
          : t('Der Rhythmus bleibt fest: {rule}, auch wenn später erledigt wird.', { rule: preview })}
      </p>
    {/if}

    {#if editor.mode !== 'none'}
      <fieldset class="rounded-xl border border-line px-3 py-2" aria-label={t('Für die nächste Karte übernehmen')}>
        <legend class="px-1 text-[13px] font-semibold text-fg2">{t('Für die nächste Karte übernehmen')}</legend>
        {#each CARRY_OPTIONS as o (o.field)}
          <label class="flex min-h-10 items-center justify-between gap-3 text-[15px]">
            <span>{o.label}{#if o.hint}<span class="text-fg2"> · {o.hint}</span>{/if}</span>
            <input
              type="checkbox"
              class="h-5 w-5 accent-[var(--accent)]"
              checked={carryOver.includes(o.field)}
              aria-label={t('{label} in die nächste Karte übernehmen', { label: o.label })}
              onchange={(e) => oncarry(toggleCarry(carryOver, o.field, e.currentTarget.checked))}
            />
          </label>
        {/each}
        <p class="mt-1 mb-1 text-[13px] text-fg2">
          {t('Titel, Zuständige, Kategorien, Priorität und Erinnerungen kommen immer mit. Beim Erledigen bleibt die jetzige Karte mit allem in „Erledigt“, die nächste wird neu angelegt.')}
        </p>
      </fieldset>
    {/if}
  </div>
{/if}
