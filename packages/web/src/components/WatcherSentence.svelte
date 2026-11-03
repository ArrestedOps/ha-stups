<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { AssignMode } from '../lib/watcher-types';
  import { sentenceParts, type SentencePart, type WatcherForm } from '../lib/watchers';
  import Icon from './Icon.svelte';
  import SelectField from './SelectField.svelte';

  /**
   * Der Wächter als ein Satz mit antippbaren Feldern: „Wenn [Entität] länger als [3 Min.] unter [5 W] liegt, bekommt [wer zu Hause ist,
   * reihum] die Karte [Titel]." Ein Tipp auf ein Feld öffnet darunter die passende Auswahl (eine nach der anderen).
   */
  let {
    form = $bindable(),
    personName,
    onpick,
  }: {
    form: WatcherForm;
    personName: (id: string) => string;
    /** „Entität wählen" antippen: die Suche öffnet der Aufrufer */
    onpick: () => void;
  } = $props();

  type Field = NonNullable<SentencePart['field']>;
  let editing = $state<Field | null>(null);
  const parts = $derived(sentenceParts(form, personName));

  const inputClass = 'min-h-11 rounded-xl bg-surface2 px-3 text-[16px]';
  const MODES: [AssignMode, string][] = $derived([
    ['rotation_present', t('Abwechselnd unter den Anwesenden')],
    ['first_home', t('Wer zuerst nach Hause kommt')],
    ['all_present', t('Alle Anwesenden')],
    ['rotation', t('Abwechselnd (egal, wer da ist)')],
    ['fixed', t('Feste Person(en)')],
    ['none', t('Niemand (Karte bleibt offen)')],
  ]);
  /** Welche Art der Zuweisung wieder gilt, wenn „Erst vorschlagen" ausgeschaltet wird */
  let lastMode: AssignMode = 'rotation_present';

  function tap(field: Field) {
    if (field === 'entity') {
      editing = null;
      onpick();
      return;
    }
    editing = editing === field ? null : field;
  }
  function setSuggest(on: boolean) {
    if (on) {
      if (form.assignMode !== 'suggest') lastMode = form.assignMode;
      form.assignMode = 'suggest';
    } else if (form.assignMode === 'suggest') {
      form.assignMode = lastMode;
    }
  }
</script>

<section class="mt-3 rounded-2xl bg-surface2 px-4 py-4" data-testid="watcher-sentence">
  <p class="text-[18px] leading-[2.1] font-medium">
    {#each parts as p, i (i)}
      {#if p.field}
        <button
          type="button"
          class="mx-0.5 inline-flex min-h-9 items-center rounded-lg border px-2.5 align-baseline text-[16px] font-semibold {editing === p.field ? 'border-accent bg-surface text-accent-text' : 'border-line bg-surface text-accent-text'}"
          aria-expanded={p.field === 'entity' ? undefined : editing === p.field}
          data-field={p.field}
          onclick={() => tap(p.field!)}
        >
          {p.text}
        </button>
      {:else}{p.text}{/if}
    {/each}
  </p>

  {#if editing}
    <div class="mt-3 space-y-3 border-t border-line pt-3" data-testid="sentence-editor">
      {#if editing === 'duration'}
        <label class="flex items-center justify-between gap-3 text-[16px]">
          <span>{t('Für mindestens (Minuten)')}</span>
          <input class="{inputClass} w-24 text-right" inputmode="numeric" bind:value={form.forMin} placeholder={form.kind === 'state' ? '0' : '3'} aria-label={t('Wartezeit in Minuten')} />
        </label>
      {:else if editing === 'threshold'}
        <label class="flex items-center justify-between gap-3 text-[16px]">
          <span>{t('Bedingung')}</span>
          <SelectField bind:value={form.kind} label={t('Bedingung')}>
            <option value="below">{t('Wert fällt unter …')}</option>
            <option value="above">{t('Wert steigt über …')}</option>
            <option value="state">{t('Zustand wechselt zu …')}</option>
          </SelectField>
        </label>
        {#if form.kind === 'state'}
          <label class="flex items-center justify-between gap-3 text-[16px]">
            <span>{t('Zustand')}</span>
            <input class="{inputClass} w-40 text-right" bind:value={form.to} placeholder={t('z. B. off')} aria-label={t('Zielzustand')} />
          </label>
        {:else}
          <label class="flex items-center justify-between gap-3 text-[16px]">
            <span>{t('Wert')}{form.entityUnit ? ` (${form.entityUnit})` : ''}</span>
            <input class="{inputClass} w-28 text-right" inputmode="decimal" bind:value={form.value} placeholder={t('z. B. 5')} aria-label={t('Schwellwert')} />
          </label>
        {/if}
      {:else if editing === 'lead'}
        <label class="flex items-center justify-between gap-3 text-[16px]">
          <span>{t('Wie viele Stunden vorher?')}</span>
          <input class="{inputClass} w-24 text-right" inputmode="numeric" bind:value={form.leadHours} aria-label={t('Vorlauf in Stunden')} />
        </label>
      {:else if editing === 'hours'}
        <label class="flex items-center justify-between gap-3 text-[16px]">
          <span>{t('Regen in den nächsten … Stunden')}</span>
          <input class="{inputClass} w-24 text-right" inputmode="numeric" bind:value={form.forecastHours} aria-label={t('Stunden im Voraus')} />
        </label>
      {:else if editing === 'title'}
        <input class="{inputClass} w-full" bind:value={form.title} maxlength="200" placeholder={t('Titel der Karte')} aria-label={t('Titel der Karte')} />
      {:else if editing === 'who'}
        <label class="flex items-center justify-between gap-3 text-[16px]">
          <span>{t('Erst vorschlagen')}</span>
          <input type="checkbox" class="h-6 w-6 accent-[var(--accent)]" checked={form.assignMode === 'suggest'} aria-label={t('Erst vorschlagen')} onchange={(e) => setSuggest(e.currentTarget.checked)} />
        </label>
        <p class="text-[13px] text-fg2">{t('Alle, die zu Hause sind, bekommen die Frage „Wer übernimmt?". Wer zuerst tippt, bekommt die Karte; nach 30 Minuten ohne Antwort greift der Rückfall.')}</p>
        {#if form.assignMode !== 'suggest'}
          <div class="flex flex-col" role="radiogroup" aria-label={t('Zuweisung')}>
            {#each MODES as [mode, label] (mode)}
              <button
                type="button"
                role="radio"
                aria-checked={form.assignMode === mode}
                class="flex min-h-[44px] items-center gap-3 text-left text-[16px] {form.assignMode === mode ? 'font-semibold' : 'text-fg2'}"
                onclick={() => (form.assignMode = mode)}
              >
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 {form.assignMode === mode ? 'border-accent' : 'border-line'}">
                  {#if form.assignMode === mode}<i class="h-2.5 w-2.5 rounded-full bg-accent"></i>{/if}
                </span>
                {label}
              </button>
            {/each}
          </div>
        {/if}
        <p class="text-[13px] text-fg2">{t('Wer genau infrage kommt, steht unter „Mehr Regeln".')}</p>
      {/if}
      <button type="button" class="flex min-h-9 items-center gap-1 text-[15px] font-semibold text-accent-text" onclick={() => (editing = null)}>
        <Icon name="check" size={16} stroke={2.8} />{t('Fertig')}
      </button>
    </div>
  {/if}
</section>
