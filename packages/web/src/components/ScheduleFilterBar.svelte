<script lang="ts">
  import { boardColorKey, boardCounts, isFiltered, personCounts, personFilterActive, toggleId, DEFAULT_FILTER, type ScheduleCard } from '../lib/schedule';
  import { scrollStrip } from '../lib/scrollStrip';
  import { setScheduleFilter, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  /** alle geladenen Karten (ohne Personen- und Board-Filter), daraus kommen die Zahlen an den Chips */
  let { cards }: { cards: ScheduleCard[] } = $props();

  const sf = $derived(ui.sf);
  // ich zuerst, dann die übrigen Personen
  const people = $derived(
    [...ui.people.filter((p) => p.isPerson)].sort((a, b) => Number(b.id === ui.me?.id) - Number(a.id === ui.me?.id)),
  );
  const pc = $derived(personCounts(cards, sf));
  const bc = $derived(boardCounts(cards, sf));

  const chip = (on: boolean) => `flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[15px] ${on ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}`;
</script>

<div class="space-y-2" role="group" aria-label="Filter">
  <div class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Personen" use:scrollStrip={sf.personIds.join() + sf.unassigned}>
    <button class={chip(!personFilterActive(sf))} aria-pressed={!personFilterActive(sf)} onclick={() => setScheduleFilter({ personIds: [], unassigned: false })}>
      Alle
    </button>
    {#each people as p (p.id)}
      {@const on = sf.personIds.includes(p.id)}
      <button class={chip(on)} aria-pressed={on} onclick={() => setScheduleFilter({ personIds: toggleId(sf.personIds, p.id) })}>
        <Avatar person={p} size={20} />{p.id === ui.me?.id ? 'Ich' : p.displayName}<span class="text-[13px] text-fg2">{pc.byPerson[p.id] ?? 0}</span>
      </button>
    {/each}
    <button class={chip(sf.unassigned)} aria-pressed={sf.unassigned} onclick={() => setScheduleFilter({ unassigned: !sf.unassigned })}>
      Niemand<span class="text-[13px] text-fg2">{pc.unassigned}</span>
    </button>
  </div>

  {#if ui.boards.length > 1}
    <div class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Boards" use:scrollStrip={sf.boardIds.join()}>
      {#each ui.boards as b, i (b.id)}
        {@const on = sf.boardIds.includes(b.id)}
        <button class={chip(on)} aria-pressed={on} onclick={() => setScheduleFilter({ boardIds: toggleId(sf.boardIds, b.id) })}>
          <i class="h-[9px] w-[9px] rounded-full" style:background="var(--c-{boardColorKey(b.color, i)}-fg)"></i>{b.name}<span class="text-[13px] text-fg2">{bc[b.id] ?? 0}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="flex items-center gap-2">
    <button class={chip(sf.showDone)} aria-pressed={sf.showDone} onclick={() => setScheduleFilter({ showDone: !sf.showDone })}>
      <Icon name="check" size={14} stroke={2.6} />Erledigte
    </button>
    {#if isFiltered(sf)}
      <button class="min-h-9 shrink-0 px-2 text-[14px] text-accent-text" onclick={() => setScheduleFilter({ ...DEFAULT_FILTER })}>Zurücksetzen</button>
    {/if}
  </div>
</div>
