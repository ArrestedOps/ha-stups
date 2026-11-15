<script lang="ts">
  import { FOUND_PREVIEW, foundIcon, groupSuggestions, hitId, pickableInGroup, showFoundSearch, visibleHits } from '../lib/foundGroups';
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import Icon from './Icon.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import SelectBox from './ui/SelectBox.svelte';

  /**
   * Die Treffer von „Gefunden“ nach Vorlage gruppiert: Kopf mit Symbol, Titel und Zähler; große Gruppen (> 5) zeigen die ersten fünf und
   * „Alle N anzeigen“. Ab 12 Treffern filtert ein Suchfeld nach Gerätename, Entität und Begründung (im Gerät, nichts geht an den Server).
   * Mit `selectable` stehen an jedem Treffer Kästchen (kein Auswahlmodus); Treffer, die nicht zur Auswahl passen, bleiben sichtbar:
   * gedimmt, mit Schloss und dem Grund, und „Stattdessen wählen“ tauscht die Auswahl.
   */
  let {
    suggestions,
    templates,
    onsetup,
    onhide,
    selectable = false,
    selected = [],
    blockedReason = () => null,
    onpick,
    onpickgroup,
    onreplace,
  }: {
    suggestions: WatcherSuggestion[];
    templates: Pick<WatcherTemplate, 'id' | 'title'>[];
    onsetup: (s: WatcherSuggestion) => void;
    onhide: (s: WatcherSuggestion) => void;
    /** Kästchen an den Treffern und „Alle auswählen“ in den Gruppenköpfen; gewählt wird nur innerhalb einer Vorlage und Fassung */
    selectable?: boolean;
    selected?: WatcherSuggestion[];
    /** Warum ein Treffer zur Auswahl nicht passt (null: er passt) */
    blockedReason?: (s: WatcherSuggestion) => string | null;
    onpick?: (s: WatcherSuggestion) => void;
    onpickgroup?: (items: WatcherSuggestion[]) => void;
    onreplace?: (s: WatcherSuggestion) => void;
  } = $props();

  let query = $state('');
  /** Aufgeklappte Gruppen (nach Vorlage); der Zustand überlebt Filtern und Nachladen nach dem Ausblenden */
  let expanded = $state<Record<string, boolean>>({});
  const filtering = $derived(query.trim() !== '');
  const groups = $derived(groupSuggestions(suggestions, templates, query));
  const chosen = $derived(new Set(selected.map(hitId)));
  const select = $derived(selectable && onpick !== undefined);
</script>

{#if showFoundSearch(suggestions.length)}
  <!-- bleibt beim Blättern durch lange Listen oben stehen -->
  <div class="sticky top-0 z-10 bg-bg pt-3 pb-1">
  <label class="focus-ring-in flex h-12 items-center gap-2.5 rounded-row border border-line bg-surface pr-1.5 pl-3.5 text-fg2">
    <Icon name="search" size={20} stroke={2} />
    <input
      class="h-11 min-w-0 flex-1 bg-transparent p-0 text-[16px] font-medium text-fg outline-none placeholder:text-dim"
      type="search"
      data-testid="found-search"
      aria-label={t('Gefundene Geräte durchsuchen')}
      placeholder={t('Name, Entität oder Grund')}
      bind:value={query}
    />
    {#if filtering}
      <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-text-soft" aria-label={t('Suche leeren')} onclick={() => (query = '')}>
        <Icon name="x" size={14} stroke={2.6} />
      </button>
    {/if}
  </label>
  </div>
{/if}

{#each groups as g (g.id)}
  {@const rows = visibleHits(g, !!expanded[g.id], filtering)}
  {@const pick = pickableInGroup(g.items, selected)}
  {@const allOn = pick.length > 0 && pick.every((s) => chosen.has(hitId(s)))}
  {@const dim = select && selected.length > 0 && pick.length === 0}
  <section class="mt-3.5" data-testid="found-group" data-group={g.id} aria-label={g.title}>
    <SectionHeader title={g.title} count={g.items.length} icon={foundIcon(g.id)} iconTone="soft">
      {#if select}
        {#if dim}
          <span class="flex h-11 shrink-0 items-center gap-1 px-2 text-[13px] font-semibold text-fg2" data-testid="found-dim"><Icon name="lock" size={14} stroke={2.2} />{t('Passt nicht zur Auswahl')}</span>
        {:else}
          <button type="button" class="flex h-11 shrink-0 items-center px-2 text-[14px] font-bold text-accent-text disabled:opacity-40" disabled={pick.length === 0} data-testid="select-all" onclick={() => onpickgroup?.(pick)}>
            {allOn ? t('Auswahl aufheben') : t('Alle auswählen')}
          </button>
        {/if}
      {/if}
    </SectionHeader>
    <div class="divide-y divide-line overflow-hidden rounded-row border border-line bg-surface">
      {#each rows as s (s.templateId + s.entityId)}
        {@const on = chosen.has(hitId(s))}
        {@const why = select ? blockedReason(s) : null}
        <!-- Die Zeile antippen wählt sie (Zeigergerät); mit der Tastatur geht es über das Kästchen -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flex items-center gap-3 px-4 py-3 {on ? 'bg-accent/10' : ''} {select && !why ? 'cursor-pointer' : ''}"
          data-testid="found-hit"
          data-selected={on ? '' : undefined}
          data-blocked={why ? '' : undefined}
          onclick={(e) => {
            if (select && !why && !(e.target as HTMLElement).closest('button,label,input')) onpick?.(s);
          }}
        >
          {#if select}
            <span class="-ml-2 shrink-0"><SelectBox checked={on} disabled={!!why} label={t('{name} auswählen', { name: s.name })} onchange={() => onpick?.(s)} /></span>
          {/if}
          <span class="min-w-0 flex-1 {why ? 'opacity-60' : ''}">
            <span class="block text-[15px] leading-snug font-semibold break-words">{s.reason}</span>
            {#if why}
              <span class="flex items-center gap-1 text-[12.5px] text-fg2" data-testid="found-why"><Icon name="lock" size={12} stroke={2.2} />{why}</span>
            {:else}
              <span class="block truncate text-[12.5px] text-fg2">{s.entityId}</span>
            {/if}
          </span>
          {#if why}
            <button class="min-h-10 shrink-0 rounded-xl px-2 text-right text-[13px] leading-tight font-bold text-accent-text" data-testid="found-replace" aria-label={t('{name} stattdessen wählen', { name: s.name })} onclick={() => onreplace?.(s)}>{t('Stattdessen wählen')}</button>
          {:else}
            <span class="flex shrink-0 flex-col items-stretch gap-1">
              <button class="min-h-10 rounded-xl bg-house px-4 font-semibold text-bg" onclick={() => onsetup(s)}>{t('Einrichten')}</button>
              <button class="min-h-9 rounded-xl px-4 text-[14px] font-semibold text-fg2" aria-label={t('{name} ausblenden', { name: s.name })} data-testid="found-hide" onclick={() => onhide(s)}>{t('Ausblenden')}</button>
            </span>
          {/if}
        </div>
      {/each}
      {#if !filtering && g.items.length > FOUND_PREVIEW}
        <button
          class="flex min-h-12 w-full items-center justify-between px-4 text-[15px] font-semibold text-accent-text"
          aria-expanded={!!expanded[g.id]}
          data-testid="found-more"
          onclick={() => (expanded[g.id] = !expanded[g.id])}
        >
          {expanded[g.id] ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: g.items.length })}<Icon name={expanded[g.id] ? 'chevron-up' : 'chevron-down'} size={18} />
        </button>
      {/if}
    </div>
  </section>
{/each}

{#if filtering && groups.length === 0}
  <p class="px-1 py-6 text-center text-[15px] text-fg2" role="status" data-testid="found-none">{t('Nichts gefunden für „{query}“.', { query: query.trim() })}</p>
{/if}
