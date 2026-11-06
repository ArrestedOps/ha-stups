<script lang="ts">
  import { FOUND_PREVIEW, foundIcon, groupSuggestions, showFoundSearch, visibleHits } from '../lib/foundGroups';
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import Icon from './Icon.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';

  /**
   * Die Treffer von „Gefunden“ nach Vorlage gruppiert: Kopf mit Symbol, Titel und Zähler; große Gruppen (> 5) zeigen die ersten fünf und
   * „Alle N anzeigen“. Ab 12 Treffern filtert ein Suchfeld nach Gerätename, Entität und Begründung (im Gerät, nichts geht an den Server).
   */
  let {
    suggestions,
    templates,
    onsetup,
    onhide,
  }: {
    suggestions: WatcherSuggestion[];
    templates: Pick<WatcherTemplate, 'id' | 'title'>[];
    onsetup: (s: WatcherSuggestion) => void;
    onhide: (s: WatcherSuggestion) => void;
  } = $props();

  let query = $state('');
  /** Aufgeklappte Gruppen (nach Vorlage); der Zustand überlebt Filtern und Nachladen nach dem Ausblenden */
  let expanded = $state<Record<string, boolean>>({});
  const filtering = $derived(query.trim() !== '');
  const groups = $derived(groupSuggestions(suggestions, templates, query));
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
  <section class="mt-3.5" data-testid="found-group" data-group={g.id} aria-label={g.title}>
    <SectionHeader title={g.title} count={g.items.length} icon={foundIcon(g.id)} iconTone="soft" />
    <div class="divide-y divide-line overflow-hidden rounded-row border border-line bg-surface">
      {#each rows as s (s.templateId + s.entityId)}
        <div class="flex items-center gap-3 px-4 py-3" data-testid="found-hit">
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] leading-snug font-semibold break-words">{s.reason}</span>
            <span class="block truncate text-[12.5px] text-fg2">{s.entityId}</span>
          </span>
          <span class="flex shrink-0 flex-col items-stretch gap-1">
            <button class="min-h-10 rounded-xl bg-house px-4 font-semibold text-bg" onclick={() => onsetup(s)}>{t('Einrichten')}</button>
            <button class="min-h-9 rounded-xl px-4 text-[14px] font-semibold text-fg2" aria-label={t('{name} ausblenden', { name: s.name })} data-testid="found-hide" onclick={() => onhide(s)}>{t('Ausblenden')}</button>
          </span>
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
