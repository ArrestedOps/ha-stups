<script lang="ts">
  import { tick } from 'svelte';
  import { api } from '../lib/api';
  import {
    cardsByDay,
    dayNumber,
    inMonth,
    layoutDay,
    minutesOfDay,
    monthGrid,
    rangeFor,
    rangeTitle,
    slotIso,
    step,
    visibleDays,
    weekdayShort,
    type CalMode,
  } from '../lib/calendar';
  import { boardColorKey, dayKeyOf, filterSchedule, isFiltered, type ScheduleCard } from '../lib/schedule';
  import { openCardAnywhere, openSheet, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import SettingsButton from './SettingsButton.svelte';
  import ScheduleFilterBar from './ScheduleFilterBar.svelte';

  const HOUR_PX = 56;
  const MODES: { id: CalMode; label: string }[] = [
    { id: 'day', label: 'Tag' },
    { id: 'week', label: 'Woche' },
    { id: 'month', label: 'Monat' },
  ];

  const remembered = (() => {
    try {
      return localStorage.getItem('stups.calmode');
    } catch {
      return null;
    }
  })();
  let mode = $state<CalMode>(remembered === 'day' || remembered === 'month' ? remembered : 'week');
  const todayKey = () => dayKeyOf(Date.now());
  let day = $state(todayKey());
  let filterOpen = $state(false);

  let loaded = $state<ScheduleCard[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let request = 0;

  function setMode(m: CalMode) {
    mode = m;
    try {
      localStorage.setItem('stups.calmode', m);
    } catch {
      /* egal */
    }
  }

  $effect(() => {
    void ui.rev;
    const { from, to } = rangeFor(mode, day);
    const showDone = ui.sf.showDone;
    const mine = ++request;
    api
      .schedule({ from, to, done: showDone })
      .then((list) => {
        if (mine !== request) return;
        loaded = list;
        failed = false;
      })
      .catch(() => {
        if (mine === request) failed = true;
      })
      .finally(() => {
        if (mine !== request) return;
        loading = false;
        void tick().then(jump);
      });
  });

  const shown = $derived(filterSchedule(loaded, ui.sf));
  const byDay = $derived(cardsByDay(shown));
  const days = $derived(visibleDays(mode, day));
  const weeks = $derived(monthGrid(day));
  const boardIndex = (id: string) => ui.boards.findIndex((b) => b.id === id);
  const color = (c: ScheduleCard) => boardColorKey(c.boardColor, boardIndex(c.boardId));
  const today = $derived(todayKey());

  // ---------- Zeitraster ----------
  let scroller: HTMLDivElement | undefined = $state();
  // Nach dem Wechsel von Ansicht oder Datum einmal an eine sinnvolle Stelle springen (nicht bei jedem Nachladen)
  let needScroll = true;
  $effect(() => {
    void mode;
    void day;
    needScroll = true;
  });

  function jump() {
    if (!needScroll || !scroller || mode === 'month') return;
    needScroll = false;
    // erste Karte; bei „heute" höchstens die aktuelle Uhrzeit; ohne Karten 7 Uhr
    const first = days.flatMap((d) => byDay.get(d) ?? []).map((c) => minutesOfDay(c.dueAt!))[0];
    const now = minutesOfDay(new Date().toISOString());
    const target = first !== undefined ? Math.min(first, days.includes(today) ? now : first) : days.includes(today) ? now - 60 : 7 * 60;
    scroller.scrollTop = Math.max(0, (target / 60) * HOUR_PX - 24);
  }

  const placed = $derived(new Map(days.map((d) => [d, layoutDay(byDay.get(d) ?? [])])));
  const nowTop = $derived((minutesOfDay(new Date().toISOString()) / 60) * HOUR_PX);

  function tapSlot(e: MouseEvent, d: string) {
    const el = e.currentTarget as HTMLElement;
    // Mit der Tastatur gibt es keine Stelle: dann 9 Uhr
    const minutes = e.detail === 0 ? 9 * 60 : ((e.clientY - el.getBoundingClientRect().top) / HOUR_PX) * 60 - 15;
    openSheet({ type: 'slot', at: slotIso(d, minutes) });
  }

  function openDay(d: string) {
    day = d;
    setMode('day');
  }

  const dayLabel = (d: string) => `${weekdayShort(d)} ${dayNumber(d)}`;
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[1100px] flex-col px-4 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0 pt-2">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-[34px] leading-tight font-bold tracking-tight">Kalender</h1>
      <div class="flex items-center gap-2">
      <button
        class="relative flex h-11 items-center gap-1.5 rounded-[14px] border border-line bg-surface px-3 text-[15px] {isFiltered(ui.sf) ? 'text-accent-text' : 'text-fg2'}"
        aria-pressed={filterOpen}
        onclick={() => (filterOpen = !filterOpen)}
      >
        <Icon name="user" size={18} />Filter{#if isFiltered(ui.sf)}<span class="h-2 w-2 rounded-full bg-accent"></span>{/if}
      </button>
      <SettingsButton />
      </div>
    </div>

    {#if filterOpen}<div class="mt-2"><ScheduleFilterBar cards={loaded} /></div>{/if}

    <div class="mt-2 flex items-center gap-1.5">
      <button class="flex h-10 w-10 items-center justify-center rounded-xl text-fg2" aria-label="Zurück" onclick={() => (day = step(mode, day, -1))}>
        <Icon name="chevron-left" size={22} stroke={2.6} />
      </button>
      <h2 class="min-w-0 flex-1 truncate text-center text-[17px] font-bold" aria-live="polite">{rangeTitle(mode, day)}</h2>
      <button class="flex h-10 w-10 items-center justify-center rounded-xl text-fg2" aria-label="Weiter" onclick={() => (day = step(mode, day, 1))}>
        <Icon name="chevron-right" size={22} stroke={2.6} />
      </button>
      <button class="min-h-9 rounded-xl border border-line px-3 text-[14px] font-semibold" onclick={() => (day = todayKey())}>Heute</button>
    </div>

    <div class="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-surface2 p-1" role="group" aria-label="Ansicht">
      {#each MODES as m (m.id)}
        <button
          class="min-h-9 rounded-lg text-[15px] {mode === m.id ? 'bg-surface font-semibold shadow-sm' : 'text-fg2'}"
          aria-pressed={mode === m.id}
          onclick={() => setMode(m.id)}
        >
          {m.label}
        </button>
      {/each}
    </div>
  </header>

  {#if failed}
    <p class="py-10 text-center text-fg2">Der Kalender konnte nicht geladen werden.</p>
  {:else if mode === 'month'}
    <div class="-mr-4 mt-3 min-h-0 flex-1 overflow-y-auto pr-4 pb-tabbar" data-testid="calendar-month">
      <div class="grid grid-cols-7 pb-1 text-center text-[12px] font-semibold text-fg2">
        {#each weeks[0]! as d (d)}<span>{weekdayShort(d)}</span>{/each}
      </div>
      <div class="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {#each weeks.flat() as d (d)}
          {@const list = byDay.get(d) ?? []}
          <button
            class="flex min-h-[72px] flex-col items-stretch gap-0.5 bg-surface p-1 text-left sm:min-h-[104px] {inMonth(d, day) ? '' : 'opacity-45'}"
            aria-label="{dayLabel(d)}, {list.length} {list.length === 1 ? 'Karte' : 'Karten'}"
            data-today={d === today ? '' : undefined}
            onclick={() => openDay(d)}
          >
            <span class="mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold {d === today ? 'bg-accent text-on-accent' : ''}">{dayNumber(d)}</span>
            <span class="flex flex-wrap justify-center gap-[3px] sm:hidden">
              {#each list.slice(0, 6) as c (c.id)}
                <i class="h-[7px] w-[7px] rounded-full" style:background="var(--c-{color(c)}-fg)"></i>
              {/each}
            </span>
            <span class="hidden flex-col gap-0.5 sm:flex">
              {#each list.slice(0, 3) as c (c.id)}
                <span class="truncate rounded px-1 text-[11px] {c.completedAt ? 'line-through opacity-60' : ''}" style:background="var(--c-{color(c)}-bg)" style:color="var(--c-{color(c)}-fg)">{c.title}</span>
              {/each}
              {#if list.length > 3}<span class="px-1 text-[11px] text-fg2">+{list.length - 3}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="mt-3 flex shrink-0 pr-[1px] pl-10" aria-hidden={mode === 'day'}>
      {#each days as d (d)}
        <button class="flex flex-1 flex-col items-center py-1 text-[12px] text-fg2" onclick={() => openDay(d)} aria-label="Tag {dayLabel(d)} öffnen">
          {weekdayShort(d)}
          <span class="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-bold {d === today ? 'bg-accent text-on-accent' : 'text-fg'}">{dayNumber(d)}</span>
        </button>
      {/each}
    </div>

    <div bind:this={scroller} class="-mr-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-tabbar" data-testid="calendar-grid">
      <div class="relative flex" style:height="{24 * HOUR_PX}px">
        <div class="relative w-10 shrink-0">
          {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
            <span class="absolute right-1.5 -translate-y-1/2 text-[11px] text-fg2" style:top="{h * HOUR_PX}px" class:hidden={h === 0}>{String(h).padStart(2, '0')}:00</span>
          {/each}
        </div>
        <div class="relative flex flex-1 border-l border-line">
          {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
            <div class="pointer-events-none absolute inset-x-0 border-t border-line/70" style:top="{h * HOUR_PX}px"></div>
          {/each}
          {#each days as d (d)}
            <div class="relative flex-1 border-r border-line/50 last:border-r-0">
              <button class="absolute inset-0 w-full cursor-pointer" aria-label="Neue Karte am {dayLabel(d)}" onclick={(e) => tapSlot(e, d)}></button>
              {#if d === today}
                <div class="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-accent" style:top="{nowTop}px" aria-hidden="true">
                  <span class="absolute -top-[5px] -left-1 h-2 w-2 rounded-full bg-accent"></span>
                </div>
              {/if}
              {#each placed.get(d) ?? [] as p (p.card.id)}
                {@const c = p.card}
                <button
                  class="absolute z-[2] overflow-hidden rounded-lg border-l-[3px] px-1 py-0.5 text-left {c.completedAt ? 'opacity-60' : ''}"
                  style:top="{(p.top / 60) * HOUR_PX}px"
                  style:height="{Math.max((p.height / 60) * HOUR_PX - 2, 24)}px"
                  style:left="calc({(p.col / p.cols) * 100}% + 1px)"
                  style:width="calc({100 / p.cols}% - 2px)"
                  style:background="var(--c-{color(c)}-bg)"
                  style:border-color="var(--c-{color(c)}-fg)"
                  style:color="var(--c-{color(c)}-fg)"
                  aria-label="{c.title}, {c.boardName}"
                  onclick={() => openCardAnywhere(c)}
                >
                  <span class="block text-[11px] leading-tight font-semibold {c.completedAt ? 'line-through' : ''} {mode === 'week' ? 'break-all' : ''}" style:display="-webkit-box" style:-webkit-line-clamp="2" style:-webkit-box-orient="vertical">{c.title}</span>
                  {#if mode === 'day'}<span class="block truncate text-[11px] opacity-80">{c.boardName}</span>{/if}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if loading}<p class="sr-only" role="status">Lädt …</p>{/if}
</main>
