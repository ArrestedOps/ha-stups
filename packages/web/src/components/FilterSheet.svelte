<script lang="ts">
  import { agenda } from '../lib/agenda.svelte';
  import { formatCost } from '../lib/datetime';
  import { costTotals, filterCards } from '../lib/filters';
  import { t, tn } from '../lib/i18n/index.svelte';
  import {
    boardColorKey,
    boardCounts,
    DEFAULT_FILTER,
    filterSchedule,
    isFiltered,
    personCounts,
    toggleId,
  } from '../lib/schedule';
  import { closeSheet, setScheduleFilter, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Der Filter-Knopf von Aufgaben und Kalender (Wer, Boards, Erledigte) und der von Boards (Suche, Stups, Kosten des Boards); welcher es ist,
   * entscheidet der Reiter dahinter. Filter für Aufgaben und Kalender im Stil der Mockups (Chips mit Zählern, Zeilen mit Schalter, großer Knopf mit der Trefferzahl).
   * Bis Phase 6a (ein gemeinsames Filtermodell mit „Wann", Priorität, Sortierung) steht hier, was es heute gibt: Wer (auch „Niemand"),
   * Boards und „Erledigte anzeigen". Die Wahl gilt für diesen Reiter und wird auf diesem Gerät gemerkt.
   */
  const sf = $derived(ui.sf);
  const cards = $derived([...agenda.open, ...agenda.recentDone]);
  // ich zuerst, dann die übrigen Personen (ein Kind sieht nur sich selbst und kennt kein „Wer")
  const people = $derived([...ui.people.filter((p) => p.isPerson)].sort((a, b) => Number(b.id === ui.me?.id) - Number(a.id === ui.me?.id)));
  const pc = $derived(personCounts(cards, sf));
  const bc = $derived(boardCounts(cards, sf));
  const hits = $derived(filterSchedule(cards, sf).filter((c) => (sf.showDone ? true : !c.completedAt)).length);

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
  const filtered = $derived(boardMode ? boardFiltered : isFiltered(sf));
</script>

{#snippet footerCta()}
  <CtaButton onclick={closeSheet}>{boardMode ? tn('{n} Karte anzeigen', '{n} Karten anzeigen', boardHits) : tn('{n} Aufgabe anzeigen', '{n} Aufgaben anzeigen', hits)}</CtaButton>
{/snippet}

<Sheet footer={footerCta} title={t('Filter')} onclose={closeSheet}>
  {#snippet right()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text disabled:opacity-40" disabled={!filtered} onclick={reset}>{t('Zurücksetzen')}</button>
  {/snippet}

  <div class="flex flex-col gap-3.5" data-testid="filter-sheet">
    {#if boardMode}
      <section aria-label={t('Suchen')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('Suchen')} />
        <label class="flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3 focus-within:border-accent">
          <span class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Karten durchsuchen')}</span>
          <input type="search" bind:value={ui.filter.search} placeholder={t('Titel oder Beschreibung')} class="min-h-6 w-full bg-transparent text-[16px] font-semibold outline-none" aria-label={t('Karten durchsuchen')} />
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
    {:else if !ui.isChild}
      <section aria-label={t('Wer')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('Wer')} />
        <div class="flex flex-wrap gap-2" role="group" aria-label={t('Personen')}>
          {#each people as p (p.id)}
            {@const on = sf.personIds.includes(p.id)}
            <Chip photo active={on} pressed={on} count={pc.byPerson[p.id] ?? 0} onclick={() => setScheduleFilter({ personIds: toggleId(sf.personIds, p.id) })}>
              <Avatar person={p} size={32} ring={on ? 0 : 1.5} />{p.id === ui.me?.id ? t('Ich') : p.displayName}
            </Chip>
          {/each}
          <Chip active={sf.unassigned} pressed={sf.unassigned} count={pc.unassigned} onclick={() => setScheduleFilter({ unassigned: !sf.unassigned })}>{t('Niemand')}</Chip>
        </div>
      </section>

      {#if ui.boards.length > 1}
        <section aria-label="Boards" class="flex flex-col gap-3.5">
          <SectionHeader title="Boards" />
          <div class="flex flex-wrap gap-2" role="group" aria-label="Boards">
            {#each ui.boards as b, i (b.id)}
              {@const on = sf.boardIds.includes(b.id)}
              <Chip active={on} pressed={on} count={bc[b.id] ?? 0} onclick={() => setScheduleFilter({ boardIds: toggleId(sf.boardIds, b.id) })}>
                <i class="h-[9px] w-[9px] rounded-full" style:background={on ? 'currentColor' : `var(--c-${boardColorKey(b.color, i)}-fg)`}></i>{b.name}
              </Chip>
            {/each}
          </div>
        </section>
      {/if}
    {/if}

    {#if !boardMode}
    <section aria-label={t('Außerdem')} class="flex flex-col gap-2">
      <SectionHeader title={t('Außerdem')} />
      <ListRow title={t('Erledigte anzeigen')}>
        {#snippet tile()}<Tile color="green"><Icon name="done" size={22} /></Tile>{/snippet}
        {#snippet meta()}{t('der letzten 7 Tage')}{/snippet}
        {#snippet right()}<Toggle checked={sf.showDone} label={t('Erledigte anzeigen')} onchange={(on) => setScheduleFilter({ showDone: on })} />{/snippet}
      </ListRow>
    </section>
    {/if}
  </div>
</Sheet>
