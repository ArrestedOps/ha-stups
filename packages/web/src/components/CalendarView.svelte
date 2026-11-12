<script lang="ts">
  import { clock as minuteClock } from '../lib/clock.svelte';
  import { numberLocale, t, tn } from '../lib/i18n/index.svelte';
  import { tick } from 'svelte';
  import { api } from '../lib/api';
  import {
    cardsByDay,
    dayKeyOf,
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
  import { boardColorKey, filterSchedule, type ScheduleCard } from '../lib/schedule';
  import { activeScheduleFilter, filterContext, openCardAnywhere, openSheet, ui } from '../lib/store.svelte';
  import { tileColorOf } from '../lib/cardTile';
  import Icon from './Icon.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import TaskRow from './TaskRow.svelte';

  const HOUR_PX = 44;

  /**
   * Die Rasteransichten von Aufgaben: Tag, Woche, Monat. Die Ansicht und der gezeigte Tag gehören der Seite Aufgaben
   * (Wochenleiste und Umschalter setzen sie), hier steht die Navigation vor und zurück und das Raster.
   */
  let {
    mode,
    day = $bindable(),
    onopenday,
  }: { mode: CalMode; day: string; onopenday: (day: string) => void } = $props();
  const todayKey = () => dayKeyOf(Date.now());

  let loaded = $state<ScheduleCard[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let request = 0;

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

  // Ein Kind sieht nur die eigenen Karten
  const shown = $derived(filterSchedule(loaded, activeScheduleFilter(), filterContext()).filter((c) => !ui.isChild || c.assigneeIds.includes(ui.me?.id ?? '')));
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
  const nowTop = $derived((void minuteClock.tick, (minutesOfDay(new Date().toISOString()) / 60) * HOUR_PX));

  function tapSlot(e: MouseEvent, d: string) {
    if (ui.isChild) return; // ein Kind legt keine Karten an
    const el = e.currentTarget as HTMLElement;
    // Mit der Tastatur gibt es keine Stelle: dann 9 Uhr
    const minutes = e.detail === 0 ? 9 * 60 : ((e.clientY - el.getBoundingClientRect().top) / HOUR_PX) * 60 - 15;
    const rounded = Math.max(0, Math.min(23 * 60 + 45, Math.round(minutes / 15) * 15));
    pending = { day: d, minutes: rounded };
    openSheet({ type: 'slot', at: slotIso(d, minutes) });
  }
  /** der angetippte freie Zeitpunkt, gestrichelt markiert, solange das Fenster „Neue Karte" offen ist */
  let pending = $state<{ day: string; minutes: number } | null>(null);
  const showPending = $derived(ui.sheet?.type === 'slot' ? pending : null);
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  function openDay(d: string) {
    day = d;
    onopenday(d);
  }

  const dayLabel = (d: string) => `${weekdayShort(d)} ${dayNumber(d)}`;

  /** Monat: die Karten des gewählten Tages und seine Überschrift („Freitag, 31. Januar") */
  const dayCards = $derived(byDay.get(day) ?? []);
  const dayTitle = $derived.by(() => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(numberLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  });
  const dotsOf = (list: ScheduleCard[]) => [...new Set(list.map((c) => boardColorKey(c.boardColor, boardIndex(c.boardId))))].slice(0, 3);
  const nowMs = $derived((void minuteClock.tick, Date.now()));
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mt-3 flex items-center gap-1.5">
    <button class="flex h-11 w-11 items-center justify-center text-text-soft2" aria-label={t('Zurück')} onclick={() => (day = step(mode, day, -1))}>
      <span class="flex h-9 w-9 items-center justify-center rounded-full bg-(--soft-btn)"><Icon name="chevron-left" size={20} stroke={2.4} /></span>
    </button>
    <h2 class="min-w-0 flex-1 truncate text-center text-[15px] font-bold" aria-live="polite">{rangeTitle(mode, day)}</h2>
    <button class="flex h-11 w-11 items-center justify-center text-text-soft2" aria-label={t('Weiter')} onclick={() => (day = step(mode, day, 1))}>
      <span class="flex h-9 w-9 items-center justify-center rounded-full bg-(--soft-btn)"><Icon name="chevron-right" size={20} stroke={2.4} /></span>
    </button>
    <button class="border-line-chip inline-flex h-[34px] shrink-0 items-center rounded-full border bg-surface px-3 text-[13px] font-semibold text-text-soft" onclick={() => (day = todayKey())}>{t('Heute')}</button>
  </div>

  {#if failed}
    <p class="py-10 text-center text-fg2">{t('Der Kalender konnte nicht geladen werden.')}</p>
  {:else if mode === 'month'}
    <div class="-mr-3 mt-3 min-h-0 flex-1 overflow-y-auto pr-3 pb-tabbar" data-testid="calendar-month">
      <div class="rounded-row border border-line bg-surface">
        <div class="grid grid-cols-7 px-1.5 pt-3 text-center text-[12px] font-semibold text-fg2">
          {#each weeks[0]! as d (d)}<span>{weekdayShort(d)}</span>{/each}
        </div>
        <div class="grid grid-cols-7 gap-1 px-1.5 py-2">
          {#each weeks.flat() as d (d)}
            {@const list = byDay.get(d) ?? []}
            <button
              class="flex h-[50px] flex-col items-center justify-center gap-1 rounded-xl text-[15px] font-semibold {d === today ? 'bg-accent-grad glow-day' : ''} {d === day ? 'shadow-[inset_0_0_0_2px_var(--brand-dot)]' : ''} {inMonth(d, day) || d === today ? '' : 'text-sep'}"
              aria-label={`${dayLabel(d)}, ${tn('{n} Karte', '{n} Karten', list.length)}`}
              aria-pressed={d === day}
              data-today={d === today ? '' : undefined}
              onclick={() => (day = d)}
            >
              <span>{dayNumber(d)}</span>
              <span class="flex h-1.5 gap-[3px]">
                {#each dotsOf(list) as c (c)}<i class="h-1.5 w-1.5 rounded-full" style:background="var(--c-{c}-fg)"></i>{/each}
              </span>
            </button>
          {/each}
        </div>
      </div>
      <div class="mt-3.5" data-testid="calendar-daylist">
        <SectionHeader title={dayTitle} count={dayCards.length} />
        <ul class="mt-2 flex flex-col gap-2">
          {#each dayCards as c (c.id)}<li><TaskRow card={c} {nowMs} /></li>{/each}
        </ul>
        {#if dayCards.length === 0}<p class="px-1 pt-1 text-[13px] text-fg2">{t('Nichts fällig an diesem Tag.')}</p>{/if}
        <button class="mt-3 inline-flex h-11 items-center gap-1.5 px-1 text-[15px] font-semibold text-accent-text" onclick={() => onopenday(day)}>
          <Icon name="calendar" size={18} />{t('Tagesansicht öffnen')}
        </button>
      </div>
    </div>
  {:else}
    <div class="mt-3 grid shrink-0 gap-0.5" style:grid-template-columns="34px repeat({days.length}, minmax(0, 1fr))" aria-hidden={mode === 'day'}>
      <span></span>
      {#each days as d (d)}
        <button
          class="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] {d === day ? 'bg-accent-grad glow-day' : 'text-fg2'}"
          onclick={() => openDay(d)}
          aria-label={t('Tag {day} öffnen', { day: dayLabel(d) })}
        >
          {weekdayShort(d)}
          <b class="text-[15px] font-bold {d === day ? '' : d === today ? 'text-accent-text' : 'text-fg'}">{dayNumber(d)}</b>
        </button>
      {/each}
    </div>

    <div class="mt-3 min-h-0 flex-1 overflow-hidden rounded-row border border-line bg-surface">
      <div bind:this={scroller} class="h-full overflow-y-auto overscroll-contain" data-testid="calendar-grid">
        <div class="relative flex" style:height="{24 * HOUR_PX}px">
          <div class="relative w-[34px] shrink-0">
            {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
              <span class="absolute right-1 -translate-y-1/2 text-[10px] text-dim" style:top="{h * HOUR_PX}px" class:hidden={h === 0}>{h}</span>
            {/each}
          </div>
          <div class="relative flex flex-1">
            {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
              <div class="pointer-events-none absolute inset-x-0 border-t border-line/60" style:top="{h * HOUR_PX}px"></div>
            {/each}
            {#each days as d (d)}
              <div class="relative flex-1 border-l border-line/50">
                <button class="absolute inset-0 w-full cursor-pointer" aria-label={t('Neue Karte am {day}', { day: dayLabel(d) })} onclick={(e) => tapSlot(e, d)}></button>
                {#if showPending && showPending.day === d}
                  <span
                    class="pointer-events-none absolute z-[1] flex items-center justify-center rounded-lg border-[1.5px] border-dashed border-brand-dot bg-accent/10 text-center text-[10.5px] leading-[1.15] font-bold text-tok"
                    style:top="{(showPending.minutes / 60) * HOUR_PX + 2}px"
                    style:height="{HOUR_PX - 4}px"
                    style:left="2px"
                    style:right="2px"
                    data-testid="slot-preview"
                  >+ {clock(showPending.minutes)}</span>
                {/if}
                {#each placed.get(d) ?? [] as p (p.card.id)}
                  {@const c = p.card}
                  <button
                    class="tile tile-{tileColorOf(color(c))} absolute z-[2] overflow-hidden !rounded-lg px-[5px] py-1 text-left {c.completedAt ? 'opacity-60' : ''}"
                    style:top="{(p.top / 60) * HOUR_PX + 1}px"
                    style:height="{Math.max((p.height / 60) * HOUR_PX - 3, 24)}px"
                    style:left="calc({(p.col / p.cols) * 100}% + 2px)"
                    style:width="calc({100 / p.cols}% - 4px)"
                    aria-label="{c.title}, {c.boardName}"
                    onclick={() => openCardAnywhere(c)}
                  >
                    <span class="block text-[10.5px] leading-[1.2] font-bold {c.completedAt ? 'line-through' : ''} {mode === 'week' ? 'break-all' : ''}" style:display="-webkit-box" style:-webkit-line-clamp="2" style:-webkit-box-orient="vertical">{c.title}</span>
                    {#if mode === 'day'}<span class="block truncate text-[10.5px] opacity-80">{c.boardName}</span>{/if}
                  </button>
                {/each}
              </div>
            {/each}
            {#if days.includes(today)}
              <div class="pointer-events-none absolute inset-x-0 z-[3] h-0.5 bg-brand-dot" style:top="{nowTop - 1}px" aria-hidden="true">
                <span class="absolute -top-[3px] -left-1 h-2 w-2 rounded-full bg-brand-dot"></span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
    <p class="px-1 pt-2 pb-tabbar text-[12.5px] leading-[1.45] text-hint">{t('Auf eine freie Zeit tippen legt eine Karte mit genau diesem Termin an.')}</p>
  {/if}

  {#if loading}<p class="sr-only" role="status">{t('Lädt …')}</p>{/if}
</div>
