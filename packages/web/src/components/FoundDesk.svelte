<script lang="ts">
  import { onMount } from 'svelte';
  import { FoundModel } from '../lib/found-model.svelte';
  import { foundIcon, groupSuggestions, hitId, pickableInGroup, variantName } from '../lib/foundGroups';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';
  import type { WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import Icon from './Icon.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import SelectField from './SelectField.svelte';
  import SelectBox from './ui/SelectBox.svelte';

  /**
   * „Gefunden“ am Desktop: eine Seite im Reiter Wächter statt des Handy-Fensters. Links die Arten (Vorlagen) mit Zähler, rechts die Geräte der
   * geöffneten Art; die Suche geht über alle Arten. Die Kästchen sind immer da (kein Auswahlmodus), eine Zeile antippen wählt sie.
   * Was nicht zur Auswahl passt (anderer Auslöser), bleibt sichtbar: gedimmt, mit Schloss und Grund, und „Stattdessen wählen“ tauscht die Auswahl.
   * Ganz unten in der Leiste stehen „Auch ohne Gerät“, „Alle Vorlagen“ und „Ausgeblendet“. Daten und Auswahl gehören dem `FoundModel`.
   */
  let {
    onsetup,
    onsetupmany,
    ontemplate,
    oncount,
  }: {
    onsetup: (s: WatcherSuggestion) => void;
    onsetupmany: (hits: WatcherSuggestion[]) => void;
    ontemplate: (tpl: WatcherTemplate) => void;
    /** Meldet die Zahl der Treffer an den Reiter (nach dem Laden und nach jeder Änderung) */
    oncount?: (n: number) => void;
  } = $props();

  const m = new FoundModel();
  let query = $state('');
  /** Die geöffnete Art (Kennung der Vorlage) oder `_recurring`, `_templates`, `_hidden` */
  let open = $state('');
  let boardId = $state(ui.boardId ?? ui.boards[0]?.id ?? '');
  const filtering = $derived(query.trim() !== '');
  const all = $derived(groupSuggestions(m.suggestions ?? [], m.device));
  const shown = $derived(groupSuggestions(m.suggestions ?? [], m.device, query));
  const current = $derived(all.find((g) => g.id === open));
  /** Die Gruppen im Hauptbereich: mit Suche alle Treffer, sonst die geöffnete Art */
  const panel = $derived(filtering ? shown : current ? [current] : []);
  const special = $derived(open.startsWith('_') && !filtering);
  const hasBlocked = $derived(m.selectedHits.length > 0 && (m.suggestions ?? []).some((s) => m.blocked(s)));
  const pickedIn = (id: string) => m.selectedHits.filter((s) => s.templateId === id).length;
  const hint = (id: string) => m.device.find((x) => x.id === id)?.hint ?? '';

  onMount(() => void m.load());
  // Nach dem Laden die erste Art öffnen; verschwindet die offene (alles eingerichtet), die nächste
  $effect(() => {
    if (m.suggestions === null) return;
    oncount?.(m.suggestions.length);
    if (open.startsWith('_')) return;
    if (!all.some((g) => g.id === open)) open = all[0]?.id ?? (m.recurring.length > 0 ? '_recurring' : '_templates');
  });

  /** Gibt es in dieser Art nichts, das zur Auswahl passt? Dann steht in der Leiste ein Schloss */
  const dimmed = (items: WatcherSuggestion[]) => m.selectedHits.length > 0 && pickableInGroup(items, m.selectedHits).length === 0;
  /** Gruppen innerhalb einer Art nach Fassung (Leistung oder Programmstatus): nur wenn es mehr als eine gibt */
  function byVariant(items: WatcherSuggestion[]): { variant: WatcherSuggestion['variant']; items: WatcherSuggestion[] }[] {
    const map = new Map<WatcherSuggestion['variant'], WatcherSuggestion[]>();
    for (const s of items) map.set(s.variant, [...(map.get(s.variant) ?? []), s]);
    return [...map].map(([variant, list]) => ({ variant, items: list }));
  }
  const bulkActions = $derived([
    { id: 'setup', label: m.selectedHits.length === 1 ? t('Einrichten') : tn('{n} gemeinsam einrichten', '{n} gemeinsam einrichten', m.selectedHits.length), run: () => (m.selectedHits.length === 1 ? onsetup(m.selectedHits[0]!) : onsetupmany(m.selectedHits)) },
    { id: 'hide', label: t('Ausblenden'), run: () => void m.hideSelected() },
  ]);
</script>

{#snippet row(s: WatcherSuggestion)}
  {@const on = m.isOn(s)}
  {@const why = m.blocked(s)}
  <!-- Die Zeile antippen wählt sie (Zeigergerät); mit der Tastatur geht es über das Kästchen -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="group flex min-h-[60px] items-center gap-2 border-t border-line px-3 py-1.5 {on ? 'bg-accent/10' : why ? '' : 'cursor-pointer hover:bg-surface2'}"
    data-testid="found-hit"
    data-selected={on ? '' : undefined}
    data-blocked={why ? '' : undefined}
    onclick={(e) => {
      if (!why && !(e.target as HTMLElement).closest('button,label,input')) m.pick(s);
    }}
  >
    <SelectBox checked={on} disabled={!!why} label={t('{name} auswählen', { name: s.name })} onchange={() => m.pick(s)} />
    <span class="min-w-0 flex-1 {why ? 'opacity-60' : ''}">
      <span class="block text-[14.5px] leading-snug font-semibold break-words">{s.reason}</span>
      {#if why}
        <span class="flex items-center gap-1 text-[12.5px] text-fg2" data-testid="found-why"><Icon name="lock" size={12} stroke={2.2} />{why}</span>
      {:else}
        <span class="block truncate text-[12.5px] text-fg2">{s.entityId}</span>
      {/if}
    </span>
    {#if why}
      <button type="button" class="h-9 shrink-0 rounded-[10px] bg-surface2 px-3 text-[13px] font-bold" data-testid="found-replace" aria-label={t('{name} stattdessen wählen', { name: s.name })} onclick={() => m.replaceWith(s)}>{t('Stattdessen wählen')}</button>
    {:else}
      <span class="flex shrink-0 items-center gap-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" class="h-9 rounded-[10px] bg-surface2 px-3 text-[13px] font-bold hover:bg-track" onclick={() => onsetup(s)}>{t('Einrichten')}</button>
        <button type="button" class="h-9 rounded-[10px] px-2.5 text-[13px] font-semibold text-fg2 hover:bg-surface2" aria-label={t('{name} ausblenden', { name: s.name })} data-testid="found-hide" onclick={() => m.hide(s)}>{t('Ausblenden')}</button>
      </span>
    {/if}
  </div>
{/snippet}

{#snippet railItem(id: string, icon: string, title: string, count: number, dim = false)}
  <button
    type="button"
    class="flex min-h-[46px] w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[14.5px] font-semibold hover:bg-surface2 {open === id && !filtering ? 'bg-accent/10 text-accent-text' : ''} {dim ? 'opacity-55' : ''}"
    data-testid="found-kind"
    data-kind={id}
    aria-current={open === id && !filtering ? 'true' : undefined}
    onclick={() => {
      open = id;
      query = '';
    }}
  >
    <span class="flex shrink-0"><Icon name={icon} size={19} stroke={2} /></span>
    <span class="min-w-0 flex-1">{title}</span>
    {#if dim}<span class="flex shrink-0 text-fg2"><Icon name="lock" size={13} stroke={2.2} /></span>{/if}
    {#if pickedIn(id) > 0}
      <span class="rounded-full bg-accent px-2 text-[12px] font-extrabold text-on-accent">{pickedIn(id)}</span>
    {:else}
      <span class="rounded-full bg-surface2 px-2 text-[12px] font-bold text-fg2">{count}</span>
    {/if}
  </button>
{/snippet}

{#if m.suggestions === null}
  <p class="py-10 text-center text-fg2">{t('Stups sieht in Home Assistant nach …')}</p>
{:else if m.error}
  <p class="rounded-2xl bg-danger-bg px-4 py-3 text-[15px] text-danger" data-testid="found-error">{m.error}</p>
{:else}
  <div class="flex flex-col gap-3.5" data-testid="found-desk">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p class="min-w-0 flex-1 text-[14px] text-fg2">{t('Stups hat in Home Assistant Geräte gefunden, zu denen ein Wächter passt.')}</p>
      {#if (m.suggestions?.length ?? 0) > 0}
        <label class="focus-ring-in flex h-10 w-full max-w-[300px] items-center gap-2 rounded-[10px] bg-surface2 pr-1.5 pl-3 text-fg2 sm:w-[300px]">
          <Icon name="search" size={17} stroke={2} />
          <input class="h-9 min-w-0 flex-1 bg-transparent p-0 text-[14.5px] font-medium text-fg outline-none placeholder:text-dim" type="search" data-testid="found-search" aria-label={t('Gefundene Geräte durchsuchen')} placeholder={t('Name, Entität oder Grund')} bind:value={query} />
          {#if filtering}
            <button type="button" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-track text-text-soft" aria-label={t('Suche leeren')} onclick={() => (query = '')}><Icon name="x" size={13} stroke={2.6} /></button>
          {/if}
        </label>
      {/if}
    </div>

    <div class="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
      <nav class="flex flex-col gap-0.5 rounded-row border border-line bg-surface p-2" aria-label={t('Arten')}>
        {#if all.length > 0}
          <h2 class="px-2.5 pt-1.5 pb-1 text-[11px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Arten')} · {all.length}</h2>
          {#each all as g (g.id)}
            {@render railItem(g.id, foundIcon(g.id), g.title, (filtering ? shown.find((x) => x.id === g.id)?.items.length : g.items.length) ?? 0, dimmed(g.items))}
          {/each}
        {/if}
        <h2 class="px-2.5 pt-3 pb-1 text-[11px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Mehr')}</h2>
        {#if m.recurring.length > 0}{@render railItem('_recurring', 'repeat', t('Auch ohne Gerät'), m.recurring.length)}{/if}
        {@render railItem('_templates', 'layers', t('Alle Vorlagen'), m.device.length)}
        {#if m.hidden.length > 0}{@render railItem('_hidden', 'eye', t('Ausgeblendet'), m.hidden.length)}{/if}
      </nav>

      <section class="min-w-0 rounded-row border border-line bg-surface" aria-label={t('Geräte')}>
        {#if special && open === '_recurring'}
          <header class="border-b border-line px-4 py-3.5">
            <h2 class="text-[18px] font-extrabold tracking-tight">{t('Auch ohne Gerät')}</h2>
            <p class="mt-0.5 text-[13px] text-fg2">{t('Kein Gerät nötig: eine Aufgabe, die sich in diesem Rhythmus von selbst wiederholt. Sie wird auf dem gewählten Board angelegt.')}</p>
          </header>
          {#if ui.boards.length > 1}
            <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
              <span class="text-[14.5px]">{t('Auf Board')}</span>
              <SelectField bind:value={boardId} label={t('Board')}>
                {#each ui.boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
              </SelectField>
            </div>
          {/if}
          {#each m.recurring as tpl (tpl.id)}
            <div class="flex min-h-[60px] items-center gap-3 border-t border-line px-4 py-2 first:border-t-0">
              <span class="min-w-0 flex-1"><span class="block truncate text-[14.5px] font-semibold">{tpl.title}</span><span class="block text-[12.5px] text-fg2">{tpl.hint}</span></span>
              <button type="button" class="h-9 shrink-0 rounded-[10px] bg-surface2 px-4 text-[13px] font-bold hover:bg-track disabled:opacity-40" disabled={m.busy !== null || !boardId} onclick={() => m.createRecurring(tpl, boardId)}>{t('Anlegen')}</button>
            </div>
          {/each}
        {:else if special && open === '_templates'}
          <header class="border-b border-line px-4 py-3.5">
            <h2 class="text-[18px] font-extrabold tracking-tight">{t('Alle Vorlagen')}</h2>
            <p class="mt-0.5 text-[13px] text-fg2">{t('Füllt die Schritte vor, alles bleibt änderbar. Danach noch die Entität wählen.')}</p>
          </header>
          {#each m.device as tpl (tpl.id)}
            <button type="button" class="flex min-h-[60px] w-full items-center gap-3 border-t border-line px-4 py-2 text-left first:border-t-0 hover:bg-surface2" onclick={() => ontemplate(tpl)}>
              <span class="min-w-0 flex-1"><span class="block truncate text-[14.5px] font-semibold">{tpl.title}</span><span class="block text-[12.5px] text-fg2">{tpl.hint}</span></span>
              <Icon name="chevron-right" size={18} />
            </button>
          {/each}
        {:else if special && open === '_hidden'}
          <header class="border-b border-line px-4 py-3.5">
            <h2 class="text-[18px] font-extrabold tracking-tight">{t('Ausgeblendet')}</h2>
            <p class="mt-0.5 text-[13px] text-fg2">{t('Diese Treffer schlägt Stups nicht mehr vor. Mit „Wieder anzeigen“ kommen sie zurück.')}</p>
          </header>
          {#each m.hidden as s (s.templateId + s.entityId)}
            <div class="flex min-h-[60px] items-center gap-3 border-t border-line px-4 py-2 first:border-t-0" data-testid="found-hidden">
              <span class="min-w-0 flex-1"><span class="block truncate text-[14.5px] font-semibold">{m.titleOf(s.templateId)}</span><span class="block text-[12.5px] text-fg2">{s.name}</span></span>
              <button type="button" class="h-9 shrink-0 rounded-[10px] bg-surface2 px-4 text-[13px] font-bold hover:bg-track" aria-label={t('{name} wieder anzeigen', { name: s.name })} onclick={() => m.unhide(s)}>{t('Wieder anzeigen')}</button>
            </div>
          {/each}
        {:else if panel.length === 0}
          <p class="px-4 py-8 text-center text-[15px] text-fg2" role="status" data-testid="found-none">
            {filtering ? t('Nichts gefunden für „{query}“.', { query: query.trim() }) : t('Stups hat nichts gefunden, das zu einer Vorlage passt. Unten gibt es alle Vorlagen zum Einrichten von Hand.')}
          </p>
        {:else}
          {#each panel as g (g.id)}
            {@const pick = pickableInGroup(g.items, m.selectedHits)}
            {@const allOn = pick.length > 0 && pick.every((s) => m.selection.has(hitId(s)))}
            <div data-testid="found-group" data-group={g.id} role="group" aria-label={g.title}>
              <header class="flex items-center gap-3 px-4 py-3.5 {g === panel[0] ? '' : 'border-t border-line'}">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-accent/10 text-accent-text"><Icon name={foundIcon(g.id)} size={21} stroke={2} /></span>
                <span class="min-w-0 flex-1">
                  <h2 class="text-[17px] font-extrabold tracking-tight">{g.title}<span class="ml-2 text-[13px] font-bold text-fg2">{g.items.length}</span></h2>
                  {#if hint(g.id)}<p class="text-[13px] text-fg2">{hint(g.id)}</p>{/if}
                </span>
                {#if dimmed(g.items)}
                  <span class="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-fg2" data-testid="found-dim"><Icon name="lock" size={14} stroke={2.2} />{t('Passt nicht zur Auswahl')}</span>
                {:else}
                  <button type="button" class="h-9 shrink-0 rounded-[10px] px-3 text-[14px] font-bold text-accent-text hover:bg-surface2 disabled:opacity-40" disabled={pick.length === 0} data-testid="select-all" onclick={() => m.pickGroup(pick)}>
                    {allOn ? t('Auswahl aufheben') : tn('Alle {n} wählen', 'Alle {n} wählen', pick.length)}
                  </button>
                {/if}
              </header>
              {#if byVariant(g.items).length > 1}
                {#each byVariant(g.items) as v (v.variant)}
                  <h3 class="border-t border-line bg-surface2/60 px-4 py-1.5 text-[12px] font-bold tracking-[0.04em] text-fg2 uppercase">{variantName(v.variant)}</h3>
                  {#each v.items as s (s.templateId + s.entityId)}{@render row(s)}{/each}
                {/each}
              {:else}
                {#each g.items as s (s.templateId + s.entityId)}{@render row(s)}{/each}
              {/if}
            </div>
          {/each}
          {#if hasBlocked}
            <p class="flex flex-wrap items-center gap-x-2 border-t border-line px-4 py-3 text-[13px] text-fg2" data-testid="found-lock-hint">
              <span>{t('Nur Treffer einer Art lassen sich zusammen einrichten. Graue Treffer haben einen anderen Auslöser.')}</span>
              <button type="button" class="font-bold text-accent-text" onclick={m.clear}>{t('Auswahl ändern')}</button>
            </p>
          {/if}
          {#if m.selectedHits.length > 0}
            <SelectionBar inline count={m.selectedHits.length} actions={bulkActions} ondone={m.clear} doneLabel={t('Auswahl aufheben')} />
          {/if}
        {/if}
      </section>
    </div>
  </div>
{/if}
