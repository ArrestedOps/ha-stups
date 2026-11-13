<script lang="ts">
  import { api, ApiError, type HaEntity } from '../lib/api';
  import { valueText } from '../lib/history';
  import { t } from '../lib/i18n/index.svelte';
  import { createLatest } from '../lib/latest';
  import { deskConditionItems, suggestionChips } from '../lib/watcher-desk';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import type { TriggerKind, WatcherSuggestion } from '../lib/watcher-types';
  import DeskBlock from './DeskBlock.svelte';
  import DeskField from './DeskField.svelte';
  import FoundHits from './FoundHits.svelte';
  import Icon from './Icon.svelte';
  import Chip from './ui/Chip.svelte';
  import Segmented from './ui/Segmented.svelte';

  /**
   * „Wenn“ im Formular am Desktop: das Suchfeld für die Entität (Name, rechts klein die Kennung), darunter die Vorschläge aus „Gefunden“
   * (die ersten drei als Chips, „+N“ klappt die ganze Liste nach Vorlage auf) und eine Zeile mit der Bedingung. Die Zeile richtet sich nach der
   * Art (Wert, Zustand, Kalender, Vorhersage); die Rechnerei kommt aus dem Editor und `watcher-flow.ts`, wie im Assistenten.
   */
  let { ed, suggestions, onhide }: { ed: WatcherEditor; suggestions: WatcherSuggestion[]; onhide: (s: WatcherSuggestion) => void } = $props();

  const uid = $props.id();
  const f = $derived(ed.form);
  const open = $derived(ed.picking === 'trigger');
  const unit = $derived(f.entityUnit || null);
  const KINDS = $derived(deskConditionItems());
  const plan = $derived(suggestionChips(suggestions));
  const seenStates = $derived((ed.history?.states ?? []).filter((s) => s !== f.to.trim()));
  const setKind = (id: string) => {
    f.kind = id as TriggerKind;
    if (id === 'state' && f.forMin.trim() === '3') f.forMin = '0';
  };

  let input = $state<HTMLInputElement>();
  let wrap = $state<HTMLElement>();
  let foundOpen = $state(false);
  export function focus(): void {
    input?.focus();
  }

  // ---------- Suche in den Entitäten (wie im Assistenten, nur Administratoren) ----------
  const latest = createLatest();
  let results = $state<HaEntity[]>([]);
  let error = $state('');
  let active = $state(-1);

  $effect(() => {
    if (!ed.picking) return;
    const q = ed.query;
    const domain = ed.searchDomain;
    const timer = setTimeout(async () => {
      try {
        // Die alte Suche wird abgebrochen; eine späte Antwort überschreibt nie die der aktuellen Eingabe
        const res = await latest.run((signal) => api.haEntities(q, domain || undefined, signal));
        if (!res.current) return;
        results = res.value;
        error = '';
        active = -1;
      } catch (e) {
        error = e instanceof ApiError ? e.message : t('Home Assistant antwortet nicht');
        results = [];
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      latest.next(); // eine noch laufende Suche gehört zur alten Eingabe
    };
  });

  function type(e: Event & { currentTarget: HTMLInputElement }) {
    const v = e.currentTarget.value;
    if (open) ed.query = v;
    else ed.startPicking('trigger', v);
  }

  function pick(e: HaEntity) {
    ed.pick(e);
    active = -1;
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) ed.startPicking('trigger', '');
      else if (results.length) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      pick(results[active]!);
    } else if (e.key === 'Escape' && open) {
      // erst die Liste schließen; ein weiteres Escape klappt das Formular zu
      e.preventDefault();
      e.stopPropagation();
      ed.picking = null;
    }
  }

  const leave = (e: FocusEvent) => {
    if (!wrap?.contains(e.relatedTarget as Node | null)) ed.picking = null;
  };
</script>

<DeskBlock n={1} title={t('Wenn')} testid="desk-when">
  <!-- Entität: ein Suchfeld mit Liste (Kombinationsfeld) -->
  <div class="relative" bind:this={wrap} onfocusout={leave}>
    <label class="focus-ring-in flex h-12 items-center gap-2.5 rounded-row border border-line bg-bg px-3.5">
      <span class="flex shrink-0 text-text-soft2"><Icon name="search" size={18} stroke={2} /></span>
      <input
        bind:this={input}
        class="min-w-0 flex-1 bg-transparent text-[16px] font-semibold outline-none placeholder:text-dim"
        role="combobox"
        aria-expanded={open}
        aria-controls="{uid}-list"
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${uid}-o${active}` : undefined}
        aria-label={t('Entität suchen')}
        autocomplete="off"
        placeholder={f.entityName || t('Entität suchen, z. B. waschmaschine')}
        value={open ? ed.query : f.entityName}
        oninput={type}
        onclick={() => !open && ed.startPicking('trigger', '')}
        onkeydown={key}
        data-testid="desk-entity"
      />
      {#if f.entityId && !open}
        <span class="max-w-[45%] shrink-0 truncate text-[13px] text-fg2" title={f.entityId} data-testid="desk-entity-id">{f.entityId}</span>
      {/if}
    </label>
    {#if open}
      <ul id="{uid}-list" role="listbox" aria-label={t('Entität suchen')} class="absolute top-[calc(100%+6px)] right-0 left-0 z-20 flex max-h-72 flex-col gap-1 overflow-y-auto rounded-row bg-surface2 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]" data-testid="desk-entity-list">
        {#each results as e, i (e.entityId)}
          <!-- Tastatur: Pfeile und Enter im Suchfeld (Kombinationsfeld), die Zeilen selbst nehmen keinen Fokus -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id="{uid}-o{i}"
            role="option"
            aria-selected={i === active}
            class="flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] px-3 py-1.5 hover:bg-surface {i === active ? 'bg-surface' : ''}"
            onmousedown={(ev) => ev.preventDefault()}
            onclick={() => pick(e)}
          >
            <span class="min-w-0 flex-1">
              <span class="block wrap-anywhere text-[15px] font-bold">{e.name}</span>
              <span class="block wrap-anywhere text-[12px] text-fg2">{e.entityId}</span>
            </span>
            <span class="shrink-0 text-[13px] text-fg2">{valueText(e.state, e.unit)}</span>
          </li>
        {:else}
          <li class="px-3 py-2 text-[14px] text-fg2" role="presentation">{error || t('Nichts gefunden.')}</li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- Vorschläge aus „Gefunden“: die ersten drei, der Rest hinter „+N“ -->
  {#if suggestions.length > 0}
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label={t('Vorschläge')} data-testid="desk-chips">
      {#each plan.chips as c (c.suggestion.templateId + c.suggestion.entityId)}
        <Chip small active={f.entityId === c.suggestion.entityId} pressed={f.entityId === c.suggestion.entityId} onclick={() => ed.applySuggestion(c.suggestion)}>
          <span class="max-w-[15rem] truncate" title={c.suggestion.reason}>{c.label}</span>
        </Chip>
      {/each}
      {#if plan.more > 0}
        <button
          type="button"
          class="inline-flex h-[34px] shrink-0 items-center rounded-full border border-dashed border-track px-3 text-[13px] font-semibold text-text-soft hover:bg-surface2"
          aria-expanded={foundOpen}
          aria-controls="{uid}-found"
          aria-label={t('Alle {n} Vorschläge anzeigen', { n: suggestions.length })}
          data-testid="desk-more"
          onclick={() => (foundOpen = !foundOpen)}
        >
          +{plan.more}
        </button>
      {/if}
    </div>
    {#if foundOpen}
      <div id="{uid}-found" class="max-h-[420px] overflow-y-auto rounded-row border border-line bg-bg px-3 pb-3" data-testid="desk-found">
        <FoundHits
          {suggestions}
          templates={ed.templates}
          onsetup={(s) => {
            ed.applySuggestion(s);
            foundOpen = false;
          }}
          {onhide}
        />
      </div>
    {/if}
  {/if}

  <!-- Bedingung: eine Zeile, die sich nach der Art richtet -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="desk-condition">
    {#if f.kind === 'calendar_event'}
      <span class="text-[14px] text-fg2">{t('Wie viele Stunden vorher?')}</span>
      <DeskField bind:value={f.leadHours} label={t('Vorlauf in Stunden')} unit={t('Std.')} width="w-24" inputmode="numeric" />
      <span class="text-[13px] text-fg2">{t('So früh vor dem Termin entsteht die Aufgabe')}</span>
    {:else if f.kind === 'forecast'}
      <span class="text-[14px] text-fg2">{t('Regen in den nächsten …')}</span>
      <DeskField bind:value={f.forecastHours} label={t('Stunden im Voraus')} unit={t('Std.')} width="w-24" inputmode="numeric" />
      <span class="text-[13px] text-fg2">{t('Stups schaut in die Vorhersage')}</span>
    {:else}
      <span class="text-[14px] text-fg2">{f.kind === 'state' ? t('Zustand') : t('Wert')}</span>
      <div class="w-[17rem] max-w-full"><Segmented small items={KINDS} value={f.kind} label={t('Bedingung')} onchange={setKind} /></div>
      {#if f.kind === 'state'}
        <DeskField bind:value={f.to} label={t('Zielzustand')} placeholder={t('z. B. off')} inputmode="text" width="w-36" />
      {:else}
        <DeskField bind:value={f.value} label={t('Schwellwert')} unit={unit ?? undefined} placeholder={t('z. B. 5')} width="w-24" />
      {/if}
      <span class="text-[14px] text-fg2">{t('länger als')}</span>
      <DeskField bind:value={f.forMin} label={t('Wartezeit in Minuten')} unit={t('Min.')} placeholder={f.kind === 'state' ? '0' : '3'} width="w-24" inputmode="numeric" />
    {/if}
  </div>
  {#if f.kind === 'state' && seenStates.length > 0}
    <div class="flex flex-wrap gap-2" role="group" aria-label={t('Zustände im Verlauf')}>
      {#each seenStates as s (s)}<Chip small onclick={() => (f.to = s)}>{s}</Chip>{/each}
    </div>
  {/if}
</DeskBlock>
