<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { valueText } from '../lib/history';
    import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { conditionItems, durationChips, durationHint, durationLabel, nameSymbol, sliderRange } from '../lib/watcher-flow';
  import type { TriggerKind } from '../lib/watcher-types';
  import Chip from './ui/Chip.svelte';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';
  import EntityGraph from './EntityGraph.svelte';
  import EntityPicker from './EntityPicker.svelte';
  import EntityRow from './EntityRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Segmented from './ui/Segmented.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Wenn": woran Stups merkt, dass die Karte entstehen soll. Im Assistenten (Schritt 1) mit großem Verlauf der Entität; im Ablauf klappt
   * es in der Karte WENN auf (`graph` aus, der Verlauf steht schon in der Karte) und bietet dort „Entität ändern" an.
   */
  let { ed, graph = true, entityRow = true }: { ed: WatcherEditor; graph?: boolean; entityRow?: boolean } = $props();

  const f = $derived(ed.form);
  const numeric = $derived(f.kind === 'below' || f.kind === 'above');
  const icon = $derived(nameSymbol(f.entityName));
  const unit = $derived(f.entityUnit || null);
  const num = (s: string): number | null => {
    const n = Number(s.trim().replace(',', '.'));
    return s.trim() === '' || !Number.isFinite(n) ? null : n;
  };
  const threshold = $derived(numeric ? num(f.value) : null);

  // Der Bereich des Reglers ändert sich nicht, während man zieht: er richtet sich nach dem Wert beim Öffnen und bei einem neuen Wert im Feld
  // svelte-ignore state_referenced_locally
  let range = $state(sliderRange(threshold));
  let rangeFor = $state('');
  $effect(() => {
    if (rangeFor !== f.entityId) {
      rangeFor = f.entityId;
      range = sliderRange(threshold);
    }
  });
  const fit = () => (range = sliderRange(threshold));
  const setValue = (v: number) => (f.value = String(Math.round(v * 100) / 100).replace('.', ','));

  const KINDS = $derived(conditionItems());
  const minutes = $derived(Number(f.forMin.trim() === '' ? (f.kind === 'state' ? 0 : 3) : f.forMin.replace(',', '.')) || 0);
  const chips = $derived(durationChips(f.forMin, f.kind));
  const seenStates = $derived((ed.history?.states ?? []).filter((s) => s !== f.to.trim()));
  const current = $derived(valueText(ed.history?.current ?? ed.item?.entityState ?? null, ed.history?.kind === 'state' ? null : unit));
  const setKind = (id: string) => {
    f.kind = id as TriggerKind;
    if (id === 'state' && f.forMin.trim() === '3') f.forMin = '0';
  };
</script>

<div class="flex flex-col gap-3.5" data-testid="when-editor">
  {#if entityRow && ed.picking === 'trigger' && !ed.readOnly}
    <EntityPicker {ed} />
  {:else if !f.entityId && entityRow}
    <button type="button" class="flex min-h-row py-2 w-full items-center gap-3 rounded-row border border-line bg-surface pr-2.5 pl-3 text-left" onclick={() => ed.startPicking('trigger')}>
      <Tile color="purple"><Icon name="search" size={22} stroke={1.8} /></Tile>
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="wrap-anywhere text-[15px] font-bold tracking-tight">{t('Entität wählen')}</span>
        <span class="wrap-anywhere text-[13px] text-fg2">{t('Was soll Stups beobachten?')}</span>
      </span>
      <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>
    </button>
  {:else}
    {#if entityRow}
      <EntityRow name={f.entityName || f.entityId} id={f.entityName ? f.entityId : ''} testid="when-entity" onchange={ed.readOnly ? undefined : () => ed.startPicking('trigger')} />
    {/if}
    {#if graph && f.kind !== 'calendar_event' && f.kind !== 'forecast'}
      <div class="rounded-[20px] border border-line bg-surface px-3.5 pt-3.5 pb-2.5" data-testid="graph-card">
        <div class="flex items-center gap-3">
          <Tile color="purple">{#if icon}<SymbolIcon id={icon} size={24} />{:else}<Icon name="eye" size={24} />{/if}</Tile>
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="wrap-anywhere text-[15px] font-bold tracking-tight">{f.entityName || f.entityId}</span>
            <span class="wrap-anywhere text-[13px] text-fg2">{t('letzte 3 Stunden')}</span>
          </span>
          <span class="ml-auto shrink-0 text-right">
            <span class="block text-[24px] leading-none font-extrabold">{current}</span>
            <span class="block text-[12px] text-fg2">{t('jetzt')}</span>
          </span>
        </div>
        <EntityGraph history={ed.history} busy={ed.historyBusy} name={f.entityName || f.entityId} {unit} {threshold} thresholdState={f.kind === 'state' ? f.to.trim() : null} />
      </div>
    {/if}
    {#if f.kind === 'calendar_event'}
      <div class="flex min-h-row py-2 items-center gap-3 rounded-row border border-line bg-surface pr-3 pl-3.5">
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="wrap-anywhere text-[15px] font-bold">{t('Wie viele Stunden vorher?')}</span>
          <span class="wrap-anywhere text-[13px] text-fg2">{t('So früh vor dem Termin entsteht die Karte')}</span>
        </span>
        <NumberField bind:value={f.leadHours} label={t('Vorlauf in Stunden')} unit={t('Std.')} />
      </div>
    {:else if f.kind === 'forecast'}
      <div class="flex min-h-row py-2 items-center gap-3 rounded-row border border-line bg-surface pr-3 pl-3.5">
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="wrap-anywhere text-[15px] font-bold">{t('Regen in den nächsten …')}</span>
          <span class="wrap-anywhere text-[13px] text-fg2">{t('Stups schaut in die Vorhersage')}</span>
        </span>
        <NumberField bind:value={f.forecastHours} label={t('Stunden im Voraus')} unit={t('Std.')} />
      </div>
    {:else}
      <SectionHeader title={f.kind === 'state' ? t('Auslösen, wenn der Zustand …') : t('Auslösen, wenn der Wert …')} />
      <Segmented small items={KINDS} value={f.kind} label={t('Bedingung')} onchange={setKind} />
      {#if f.kind === 'state'}
        <div class="flex min-h-row py-2 items-center gap-3 rounded-row border border-line bg-surface pr-3 pl-3.5">
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="wrap-anywhere text-[15px] font-bold">{t('Zustand')}</span>
            <span class="wrap-anywhere text-[13px] text-fg2">{t('grüne Linie im Verlauf')}</span>
          </span>
          <input class="h-10 w-32 rounded-xl border border-track bg-bg px-2 text-center text-[15px] font-bold placeholder:text-dim" bind:value={f.to} placeholder={t('z. B. off')} aria-label={t('Zielzustand')} />
        </div>
        {#if seenStates.length > 0}
          <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Zustände im Verlauf')}>
            {#each seenStates as s (s)}<Chip small onclick={() => (f.to = s)}>{s}</Chip>{/each}
          </div>
        {/if}
      {:else}
        <div class="flex min-h-row py-2 items-center gap-3 rounded-row border border-line bg-surface pr-2.5 pl-3.5">
          <span class="flex min-w-0 flex-1 basis-0 flex-col gap-1">
            <span class="wrap-anywhere text-[15px] font-bold">{t('Schwelle')}</span>
            <span class="wrap-anywhere text-[13px] text-fg2">{t('grüne Linie im Verlauf')}</span>
          </span>
          <span class="flex min-w-0 flex-[1.4] basis-0 items-center gap-2.5">
            <input
              type="range"
              class="range-brand min-w-0 flex-1"
              style:--fill="{range.max === range.min ? 0 : Math.min(100, Math.max(0, (((threshold ?? 0) - range.min) / (range.max - range.min)) * 100))}%"
              min={range.min}
              max={range.max}
              step={range.step}
              value={threshold ?? 0}
              aria-label={unit ? t('Schwelle in {unit}', { unit }) : t('Schwelle')}
              oninput={(e) => setValue(Number(e.currentTarget.value))}
            />
            <span class="tok-pill flex h-10 min-w-16 shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-[16px] font-extrabold">
              <input
                class="bg-transparent text-center"
                style:width="{Math.max(1, f.value.length)}ch"
                inputmode="decimal"
                bind:value={f.value}
                placeholder={t('z. B. 5')}
                aria-label={t('Schwellwert')}
                onchange={fit}
              />{#if unit}<span>{unit}</span>{/if}
            </span>
          </span>
        </div>
      {/if}
      <SectionHeader title={f.kind === 'state' ? t('… so lange im Zustand') : t('… mindestens so lange')} />
      <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Wartezeit in Minuten')}>
        {#each chips as m (m)}
          <Chip small active={m === minutes} pressed={m === minutes} onclick={() => (f.forMin = String(m))}>{durationLabel(m)}</Chip>
        {/each}
      </div>
      {#if ed.history?.status === 'ok' && ed.history.points.length >= 2}
        <p class="px-1 text-[12.5px] leading-[1.45] text-hint" data-testid="duration-hint">{durationHint(minutes, ed.history.hours, ed.history.fired.length)}</p>
      {/if}
    {/if}
  {/if}
</div>
