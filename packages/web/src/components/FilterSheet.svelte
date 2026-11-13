<script lang="ts">
  import { agenda } from '../lib/agenda.svelte';
  import { formatCost } from '../lib/datetime';
  import { costTotals, filterCards } from '../lib/filters';
  import { t, tn } from '../lib/i18n/index.svelte';
  import {
    boardColorKey,
    DEFAULT_FILTER,
    filterSchedule,
    isFiltered,
    personCounts,
    toggleId,
    whenCounts,
    type SortKey,
    type WhenKey,
  } from '../lib/schedule';
  import { activeScheduleFilter, closeSheet, filterContext, setScheduleFilter, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Segmented from './ui/Segmented.svelte';
  import Tile from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Der Filter-Knopf von Aufgaben und Kalender und der von Boards; welcher es ist, entscheidet der Reiter dahinter.
   * Aufgaben und Kalender (ein gemeinsames Modell, `ScheduleFilter`) nach dem Mockup: Wer, Wann, Boards, Priorität, Außerdem (offener Stups,
   * nur von Wächtern, Erledigte) und Sortierung, unten der große Knopf mit der Trefferzahl. Die Zahlen an den Chips sind gegen die übrige
   * Auswahl gerechnet („so viele blieben, wenn ich genau dies wähle"), Nullen stehen nicht da. Ein Kind kennt weder „Wer" noch „nur von Wächtern".
   * Die Wahl gilt für Aufgaben und Kalender und wird auf diesem Gerät gemerkt. Boards: Suche, Stups-Filter, Kosten des Boards.
   */
  const sf = $derived(activeScheduleFilter());
  const fctx = $derived(filterContext());
  const meId = $derived(ui.me?.id ?? null);
  const houseIds = $derived(new Set(ui.isChild ? [] : (agenda.today?.house ?? []).map((c) => c.id)));
  // alles, was die Liste zeigen kann: offene Aufgaben mit und ohne Termin und das zuletzt Erledigte; „Vom Haus" steht eigens darüber und zählt hier nicht
  const pool = $derived(
    [...agenda.open, ...agenda.undated, ...agenda.recentDone].filter((c) => !houseIds.has(c.id) && (!ui.isChild || (!!meId && c.assigneeIds.includes(meId)))),
  );
  // ich zuerst, dann die übrigen Personen
  const people = $derived([...ui.people.filter((p) => p.isPerson)].sort((a, b) => Number(b.id === ui.me?.id) - Number(a.id === ui.me?.id)));
  const pc = $derived(personCounts(pool, sf, fctx));
  const wc = $derived(whenCounts(pool, sf, fctx));
  const hits = $derived(filterSchedule(pool, sf, fctx).length);
  /** eine Zahl nur, wenn es etwas zu zählen gibt */
  const n = (v: number | undefined): number | undefined => (v ? v : undefined);

  const WHEN: { id: WhenKey; label: () => string }[] = [
    { id: 'overdue', label: () => t('Überfällig') },
    { id: 'today', label: () => t('Heute') },
    { id: 'week', label: () => t('Diese Woche') },
    { id: 'later', label: () => t('Später') },
    { id: 'undated', label: () => t('Ohne Termin') },
  ];
  const PRIORITY = $derived([
    { id: 'all', label: t('Alle') },
    { id: 'high', label: t('Hoch') },
    { id: 'medium', label: t('Mittel') },
    { id: 'low', label: t('Niedrig') },
  ]);
  const SORT = $derived<{ id: SortKey; label: string }[]>([
    { id: 'due', label: t('Fälligkeit') },
    { id: 'priority', label: t('Priorität') },
    { id: 'newest', label: t('Neueste') },
  ]);

  // ---------- Boards: Suche, Stups-Filter, Kosten ----------
  const boardMode = $derived(ui.tab === 'boards');
  const f = $derived(ui.filter);
  const boardCards = $derived(ui.view?.cards ?? []);
  const boardHits = $derived(filterCards(boardCards, ui.filter, ui.me?.id ?? null).length);
  const costs = $derived(costTotals(boardCards, new Set((ui.view?.columns ?? []).filter((c) => c.isDone).map((c) => c.id))));
  const budget = $derived(
    [costs.open ? t('{amount} offen', { amount: formatCost(costs.open) }) : '', costs.done ? t('{amount} erledigt', { amount: formatCost(costs.done) }) : ''].filter(Boolean).join(' · '),
  );
  const boardFiltered = $derived(f.onlyMine || f.personIds.length > 0 || f.categoryIds.length > 0 || f.nudged || f.search.trim() !== '');
  const resetBoard = () => {
    ui.filter.onlyMine = false;
    ui.filter.personIds = [];
    ui.filter.categoryIds = [];
    ui.filter.nudged = false;
    ui.filter.search = '';
  };
  const reset = () => (boardMode ? resetBoard() : setScheduleFilter({ ...DEFAULT_FILTER }));
  const filtered = $derived(boardMode ? boardFiltered : isFiltered(ui.sf));
</script>

{#snippet footerCta()}
  <CtaButton onclick={closeSheet}>{boardMode ? tn('{n} Aufgabe anzeigen', '{n} Aufgaben anzeigen', boardHits) : tn('{n} Aufgabe anzeigen', '{n} Aufgaben anzeigen', hits)}</CtaButton>
{/snippet}

<Sheet footer={footerCta} title={t('Filter')} onclose={closeSheet}>
  {#snippet right()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text disabled:opacity-40" disabled={!filtered} onclick={reset}>{t('Zurücksetzen')}</button>
  {/snippet}

  <div class="flex flex-col gap-3.5 pt-1" data-testid="filter-sheet">
    {#if boardMode}
      <section aria-label={t('Suchen')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('Suchen')} />
        <label class="flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3 focus-within:border-accent">
          <span class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Aufgaben durchsuchen')}</span>
          <input type="search" bind:value={ui.filter.search} placeholder={t('Titel oder Beschreibung')} class="min-h-6 w-full bg-transparent text-[16px] font-semibold outline-none" aria-label={t('Aufgaben durchsuchen')} />
        </label>
      </section>

      <section aria-label={t('Außerdem')} class="flex flex-col gap-2">
        <SectionHeader title={t('Außerdem')} />
        <ListRow title={t('Nur mit offenem Stups')}>
          {#snippet tile()}<Tile color="orange"><Icon name="hand" size={22} /></Tile>{/snippet}
          {#snippet right()}<Toggle checked={f.nudged} label={t('Nur mit offenem Stups')} onchange={(on) => (ui.filter.nudged = on)} />{/snippet}
        </ListRow>
        {#if budget}
          <ListRow title={t('Kosten im Board')}>
            {#snippet tile()}<Tile color="gray"><Icon name="euro" size={22} /></Tile>{/snippet}
            {#snippet meta()}{budget}{/snippet}
          </ListRow>
        {/if}
      </section>
    {:else}
      {#if !ui.isChild}
        <section aria-label={t('Wer')} class="flex flex-col gap-3.5">
          <SectionHeader title={t('Wer')} />
          <div class="flex flex-wrap gap-2" role="group" aria-label={t('Personen')}>
            {#each people as p (p.id)}
              {@const on = sf.personIds.includes(p.id)}
              <Chip photo active={on} pressed={on} count={n(pc.byPerson[p.id])} onclick={() => setScheduleFilter({ personIds: toggleId(sf.personIds, p.id) })}>
                <Avatar person={p} size={32} ring={on ? 0 : 1.5} />{p.id === ui.me?.id ? t('Ich') : p.displayName}
              </Chip>
            {/each}
            <Chip active={sf.unassigned} pressed={sf.unassigned} count={n(pc.unassigned)} onclick={() => setScheduleFilter({ unassigned: !sf.unassigned })}>{t('Niemand')}</Chip>
          </div>
        </section>
      {/if}

      <section aria-label={t('Wann')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('Wann')} />
        <div class="flex flex-wrap gap-2" role="group" aria-label={t('Wann')}>
          {#each WHEN as w (w.id)}
            {@const on = sf.when.includes(w.id)}
            <Chip active={on} pressed={on} count={n(wc[w.id])} onclick={() => setScheduleFilter({ when: toggleId(sf.when, w.id) })}>{w.label()}</Chip>
          {/each}
        </div>
      </section>

      {#if ui.boards.length > 1}
        <section aria-label="Boards" class="flex flex-col gap-3.5">
          <SectionHeader title="Boards" />
          <div class="flex flex-wrap gap-2" role="group" aria-label="Boards">
            {#each ui.boards as b, i (b.id)}
              {@const on = sf.boardIds.includes(b.id)}
              <Chip active={on} pressed={on} onclick={() => setScheduleFilter({ boardIds: toggleId(sf.boardIds, b.id) })}>
                <i class="h-[9px] w-[9px] rounded-full" style:background={on ? 'currentColor' : `var(--c-${boardColorKey(b.color, i)}-fg)`}></i>{b.name}
              </Chip>
            {/each}
          </div>
        </section>
      {/if}

      <section aria-label={t('Priorität')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('Priorität')} />
        <Segmented small items={PRIORITY} value={sf.priority ?? 'all'} label={t('Priorität')} onchange={(id) => setScheduleFilter({ priority: id === 'all' ? null : (id as 'high' | 'medium' | 'low') })} />
      </section>

      <section aria-label={t('Außerdem')} class="flex flex-col gap-2">
        <SectionHeader title={t('Außerdem')} />
        {#if !ui.isChild}
          <ListRow title={t('Nur mit offenem Stups')}>
            {#snippet tile()}<Tile color="orange"><Icon name="hand" size={22} /></Tile>{/snippet}
            {#snippet right()}<Toggle checked={sf.nudged} label={t('Nur mit offenem Stups')} onchange={(on) => setScheduleFilter({ nudged: on })} />{/snippet}
          </ListRow>
          <ListRow title={t('Nur von Wächtern')}>
            {#snippet tile()}<Tile color="purple"><Icon name="shield" size={22} /></Tile>{/snippet}
            {#snippet right()}<Toggle checked={sf.watcherOnly} label={t('Nur von Wächtern')} onchange={(on) => setScheduleFilter({ watcherOnly: on })} />{/snippet}
          </ListRow>
        {/if}
        <ListRow title={t('Erledigte anzeigen')}>
          {#snippet tile()}<Tile color="green"><Icon name="done" size={22} /></Tile>{/snippet}
          {#snippet meta()}{t('der letzten 7 Tage')}{/snippet}
          {#snippet right()}<Toggle checked={sf.showDone} label={t('Erledigte anzeigen')} onchange={(on) => setScheduleFilter({ showDone: on })} />{/snippet}
        </ListRow>
      </section>

      <section aria-label={t('Sortieren nach')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('Sortieren nach')} />
        <Segmented small items={SORT} value={sf.sort} label={t('Sortierung')} onchange={(id) => setScheduleFilter({ sort: id as SortKey })} />
      </section>
    {/if}
  </div>
</Sheet>
