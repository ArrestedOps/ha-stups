<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { closeSheet, personById, toast, ui } from '../lib/store.svelte';
  import { bulkFields, commonValues, fieldLabel, formValues, MIXED, resetField, toBulkPatch, valueText, type BulkField } from '../lib/watcher-bulk';
  import { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { dueChipOf, dueFields, type DueChip } from '../lib/watcher-flow';
  import type { WatcherItem } from '../lib/watcher-types';
  import { fromWatcher, withCategory, type WatcherForm } from '../lib/watchers';
  import NudgeCard from './NudgeCard.svelte';
  import NumberField from './NumberField.svelte';
  import SelectField from './SelectField.svelte';
  import Sheet from './Sheet.svelte';
  import WatcherCategoryField from './WatcherCategoryField.svelte';
  import WatcherDeskWho from './WatcherDeskWho.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Mehrere Wächter auf einmal bearbeiten. Das Fenster zeigt nur Felder, die für alle Ausgewählten passen (Auslöser-Felder nur bei gleicher
   * Auslöser-Art und Einheit), je Zeile den gemeinsamen Wert oder „verschieden“. „Ändern“ klappt das Feld auf (dieselben Bausteine wie die
   * Einzelbearbeitung); sobald man darin etwas anfasst, zählt das Feld als geändert. „Für alle übernehmen“ schickt nur die geänderten Felder:
   * alles andere bleibt je Wächter, wie es ist. Entität, Name und Titel der Aufgabe sind nie dabei.
   */
  let { ids }: { ids: string[] } = $props();

  const ed = new WatcherEditor(null);
  let items = $state.raw<WatcherItem[]>([]);
  let loaded = $state(false);
  let busy = $state(false);
  /** Der Stand des Formulars beim Öffnen (zum Zurücksetzen eines Feldes) */
  let initial = $state.raw<WatcherForm | null>(null);
  let touched = $state<ReadonlySet<BulkField>>(new Set());
  let opened = $state<BulkField | null>(null);
  let dueOpen = $state(false);

  const fields = $derived(bulkFields(items));
  const common = $derived(commonValues(items));
  const current = $derived(formValues(ed.form));
  const f = $derived(ed.form);
  /** Einheit der Schwelle (nur bei gleicher Einheit gibt es das Feld) */
  const unit = $derived(items[0]?.entityUnit ?? '');
  const triggerFieldsMissing = $derived(items.length > 1 && !fields.includes('threshold') && !fields.includes('forMin') && !fields.includes('lead') && !fields.includes('forecastHours'));
  const ctx = $derived({ personName: (id: string) => personById(id)?.displayName ?? '?', boardName: (id: string) => ui.boards.find((b) => b.id === id)?.name ?? t('Board (nicht sichtbar)'), unit });

  onMount(() => {
    void (async () => {
      try {
        const res = await api.watchers();
        const found = ids.map((id) => res.items.find((w) => w.id === id)).filter((w): w is WatcherItem => !!w);
        if (found.length < ids.length) toast(found.length === 0 ? t('Diese Wächter gibt es nicht mehr.') : t('Einige Wächter gibt es nicht mehr.'), { tone: 'error' });
        if (found.length === 0) {
          ui.rev += 1;
          closeSheet();
          return;
        }
        items = found;
        const same = commonValues(found);
        const form = fromWatcher(found[0]!);
        // Wo die Ausgewählten verschieden sind, beginnt das Feld leer (ein Board ohne Wahl lässt „Wer?“ alle Personen anbieten)
        if (same.board === MIXED) Object.assign(form, { boardId: '', columnId: '' });
        if (same.category === MIXED) Object.assign(form, { category: '' });
        form.categorySource = 'user';
        ed.form = form;
        initial = structuredClone($state.snapshot(form));
        ed.loading = false;
        loaded = true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : t('Konnte den Wächter nicht laden'), { tone: 'error' });
        closeSheet();
      }
    })();
  });

  // Spalten und Kategorien des gewählten Boards
  $effect(() => {
    const boardId = ed.form.boardId;
    if (loaded) ed.loadView(boardId);
  });

  const touch = (field: BulkField) => {
    if (!touched.has(field)) touched = new Set([...touched, field]);
  };
  function untouch(field: BulkField) {
    touched = new Set([...touched].filter((x) => x !== field));
    if (initial) ed.form = resetField(ed.form, initial, field);
    if (field === 'due') dueOpen = false;
  }
  const shown = (field: BulkField) => valueText(field, touched.has(field) ? current[field] : common[field], ctx);

  // ----- Fälligkeit und Priorität: dieselben Auswahlen wie im Formular am Desktop -----
  const chip = $derived(dueChipOf(f));
  const DUE = $derived<{ id: Exclude<DueChip, 'custom'>; label: string }[]>([
    { id: 'none', label: t('ohne Termin') },
    { id: 'now', label: t('sofort') },
    { id: 'in30', label: t('in 30 Min.') },
    { id: 'in60', label: t('in 1 Std.') },
    { id: 'evening', label: t('heute Abend') },
  ]);
  const dueCustom = $derived(chip === 'custom' || dueOpen);
  function setDue(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    if (v === 'custom') {
      dueOpen = true;
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
  const priority = $derived(f.priority === '' ? 'medium' : f.priority);
  function setPriority(e: Event & { currentTarget: HTMLSelectElement }) {
    const id = e.currentTarget.value;
    f.priority = id === 'medium' ? '' : (id as 'low' | 'high');
  }

  async function apply() {
    if (touched.size === 0 || busy) return;
    busy = true;
    try {
      const res = await api.bulkUpdateWatchers(ids, toBulkPatch(ed.form, touched));
      ui.watchers = await api.watchers().catch(() => ui.watchers);
      ui.rev += 1;
      toast(t('{n} Wächter geändert', { n: res.items.length }));
      closeSheet();
    } catch (e) {
      // Ein Wächter ist inzwischen gelöscht: nichts wurde geändert, die Liste lädt neu und die Auswahl räumt sich auf
      if (e instanceof ApiError && e.status === 404) {
        ui.watchers = await api.watchers().catch(() => ui.watchers);
        ui.rev += 1;
        closeSheet();
      }
      toast(e instanceof ApiError ? e.message : t('Speichern fehlgeschlagen'), { tone: 'error' });
    }
    busy = false;
  }
</script>

{#snippet foot()}
  <CtaButton disabled={touched.size === 0 || busy} onclick={apply}>{busy ? t('Speichert …') : t('Für alle übernehmen')}</CtaButton>
{/snippet}

{#snippet editor(field: BulkField)}
  {#if field === 'active'}
    <label class="flex items-center gap-3 text-[15px]"><Toggle label={t('Aktiv')} checked={f.active} onchange={(v) => (f.active = v)} />{f.active ? t('aktiv') : t('pausiert')}</label>
  {:else if field === 'category'}
    <WatcherCategoryField value={f.category} options={ed.categoryNames} onchange={(v) => (ed.form = withCategory(ed.form, v))} />
  {:else if field === 'assign'}
    <WatcherDeskWho {ed} />
  {:else if field === 'board'}
    <div class="flex flex-wrap items-center gap-2">
      <SelectField variant="box" label={t('Board')} bind:value={f.boardId}>
        <option value="" disabled>{t('wählen …')}</option>
        {#each ed.boardOptions as o (o.id)}<option value={o.id} disabled={o.disabled} data-short={o.short}>{o.label}</option>{/each}
      </SelectField>
      <SelectField variant="box" label={t('Spalte')} bind:value={f.columnId}>
        {#each ed.view?.columns ?? [] as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </SelectField>
    </div>
    <p class="mt-2 text-[12.5px] leading-[1.45] text-hint">{t('Die Kategorien der Aufgaben gehören zum alten Board und werden dabei geleert.')}</p>
  {:else if field === 'due'}
    <div class="flex flex-wrap items-center gap-2">
      <SelectField variant="box" label={t('Fällig')} value={dueCustom ? 'custom' : chip} onchange={setDue}>
        {#each DUE as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
        <option value="custom">{t('Anders …')}</option>
      </SelectField>
      {#if dueCustom && f.dueKind === 'in'}
        <NumberField bind:value={f.dueMinutes} label={t('Minuten bis zur Fälligkeit')} unit={t('Min.')} />
      {:else if dueCustom && f.dueKind === 'at'}
        <SelectField variant="box" label={t('Tag')} bind:value={f.dueDay}>
          <option value="today">{t('heute')}</option>
          <option value="tomorrow">{t('morgen')}</option>
        </SelectField>
        <input type="time" class="h-11 rounded-xl border border-track bg-bg px-2 text-[15px] font-bold" bind:value={f.dueTime} aria-label={t('Uhrzeit')} />
      {/if}
    </div>
  {:else if field === 'priority'}
    <SelectField variant="box" label={t('Priorität')} value={priority} onchange={setPriority}>
      {#each PRIORITY as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
    </SelectField>
  {:else if field === 'nudge'}
    <NudgeCard {ed} />
  {:else if field === 'cooldown'}
    <NumberField bind:value={f.cooldownMin} label={t('Sperrzeit in Minuten')} unit={t('Min.')} placeholder="10" />
  {:else if field === 'dedupe'}
    <label class="flex items-center gap-3 text-[15px]"><Toggle label={t('Keine Doppelaufgaben')} checked={f.dedupe} onchange={(v) => (f.dedupe = v)} />{t('solange eine offen ist')}</label>
  {:else if field === 'fairness'}
    <label class="flex items-center gap-3 text-[15px]"><Toggle label={t('Zählt zur Fairness')} checked={f.countsForFairness ?? true} onchange={(v) => (f.countsForFairness = v)} />{t('Zählt das Board nicht mit, bleibt der Wert gespeichert, wirkt aber nicht.')}</label>
  {:else if field === 'threshold'}
    <NumberField bind:value={f.value} label={t('Schwelle')} {unit} decimal />
  {:else if field === 'forMin'}
    <NumberField bind:value={f.forMin} label={t('Mindestens so lange in Minuten')} unit={t('Min.')} />
  {:else if field === 'count'}
    <NumberField bind:value={f.count} label={t('Anzahl')} unit="×" placeholder="1" />
  {:else if field === 'lead'}
    <NumberField bind:value={f.leadHours} label={t('Vorlauf in Stunden')} unit={t('Std.')} />
  {:else if field === 'forecastHours'}
    <NumberField bind:value={f.forecastHours} label={t('Stunden im Voraus')} unit={t('Std.')} />
  {:else if field === 'doneValue'}
    <NumberField bind:value={f.doneValue} label={t('Erledigt sich von selbst ab')} {unit} decimal />
  {/if}
{/snippet}

<Sheet title={tn('{n} Wächter bearbeiten', '{n} Wächter bearbeiten', ids.length)} onclose={closeSheet} footer={loaded ? foot : undefined}>
  {#if !loaded}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <div class="flex flex-col gap-3 pt-1" data-testid="bulk-sheet">
      <p class="px-1 text-[13px] leading-[1.45] text-fg2">{t('Nur, was du hier änderst, wird für alle übernommen. Alles andere bleibt bei jedem Wächter, wie es ist.')}</p>
      <ul class="flex flex-col gap-2">
        {#each fields as field (field)}
          {@const on = touched.has(field)}
          {@const open = opened === field}
          <li class="rounded-row border bg-surface px-3.5 py-3 {on ? 'border-accent' : 'border-line'}" data-testid="bulk-field" data-field={field} data-touched={on ? '' : undefined}>
            <div class="flex items-center gap-2">
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{fieldLabel(field)}</span>
                <span class="min-w-0 truncate text-[16px] font-semibold {!on && common[field] === MIXED ? 'text-fg2 italic' : ''}" data-testid="bulk-value">{shown(field)}</span>
              </div>
              {#if on}
                <button type="button" class="flex h-11 items-center px-2 text-[14px] font-bold text-fg2" aria-label={t('{field} zurücksetzen', { field: fieldLabel(field) })} onclick={() => untouch(field)}>{t('Zurücksetzen')}</button>
              {/if}
              <button
                type="button"
                class="flex h-11 items-center rounded-row border border-line bg-surface2 px-3.5 text-[14px] font-bold"
                aria-expanded={open}
                aria-label={t('{field} ändern', { field: fieldLabel(field) })}
                onclick={() => (opened = open ? null : field)}
              >
                {t('Ändern')}
              </button>
            </div>
            {#if open}
              <!-- Was man hier anfasst (Tippen, Eingeben, Wählen), zählt als geändert -->
              <div class="mt-3" role="group" aria-label={fieldLabel(field)} onclickcapture={() => touch(field)} oninputcapture={() => touch(field)} onchangecapture={() => touch(field)}>
                {@render editor(field)}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if triggerFieldsMissing}
        <p class="px-1 text-[13px] leading-[1.45] text-fg2" data-testid="bulk-trigger-note">{t('Schwelle, Dauer und Anzahl gibt es nur, wenn alle Ausgewählten denselben Auslöser (und dieselbe Einheit) haben.')}</p>
      {/if}
    </div>
  {/if}
</Sheet>
