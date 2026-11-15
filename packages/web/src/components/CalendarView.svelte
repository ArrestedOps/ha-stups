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
    isoWeek,
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
  import Icon from './Icon.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import TaskRow from './TaskRow.svelte';

  /** Am Desktop ist das Raster etwas höher (mehr Platz für Titel und Uhrzeit), am Handy bleibt es kompakt */
  const HOUR_PX = $derived(ui.desktop ? 52 : 44);

  /**
   * Die Rasteransichten von Aufgaben: Tag, Woche, Monat. Die Ansicht und der gezeigte Tag gehören der Seite Aufgaben
   * (Wochenleiste und Umschalter setzen sie), hier steht die Navigation vor und zurück und das Raster.
   */
  let {
    mode,
    day = $bindable(),
    onopenday,
    hideNav = false,
  }: { mode: CalMode; day: string; onopenday: (day: string) => void; /** Desktop: Pfeile, Titel und „Heute“ stehen in der Kopfzeile der Seite */ hideNav?: boolean } = $props();
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

  // Ein Kind sieht nur die eigenen Aufgaben
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
    // erste Aufgabe; bei „heute" höchstens die aktuelle Uhrzeit; ohne Aufgaben 7 Uhr
    const first = days.flatMap((d) => byDay.get(d) ?? []).map((c) => minutesOfDay(c.dueAt!))[0];
    const now = minutesOfDay(new Date().toISOString());
    const target = first !== undefined ? Math.min(first, days.includes(today) ? now : first) : days.includes(today) ? now - 60 : 7 * 60;
    scroller.scrollTop = Math.max(0, (target / 60) * HOUR_PX - 24);
  }

  const placed = $derived(new Map(days.map((d) => [d, layoutDay(byDay.get(d) ?? [])])));
  const nowTop = $derived((void minuteClock.tick, (minutesOfDay(new Date().toISOString()) / 60) * HOUR_PX));

  function tapSlot(e: MouseEvent, d: string) {
    if (ui.isChild) return; // ein Kind legt keine Aufgaben an
    const el = e.currentTarget as HTMLElement;
    // Mit der Tastatur gibt es keine Stelle: dann 9 Uhr
    const minutes = e.detail === 0 ? 9 * 60 : ((e.clientY - el.getBoundingClientRect().top) / HOUR_PX) * 60 - 15;
    const rounded = Math.max(0, Math.min(23 * 60 + 45, Math.round(minutes / 15) * 15));
    pending = { day: d, minutes: rounded };
    openSheet({ type: 'slot', at: slotIso(d, minutes) });
  }
  /** der angetippte freie Zeitpunkt, gestrichelt markiert, solange das Fenster „Neue Aufgabe" offen ist */
  let pending = $state<{ day: string; minutes: number } | null>(null);
  const showPending = $derived(ui.sheet?.type === 'slot' ? pending : null);
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  function openDay(d: string) {
    day = d;
    onopenday(d);
  }

  /** Wischen nach links/rechts blättert (3 Tage, Woche, Tag); nur eine überwiegend waagrechte Bewegung zählt */
  let touch: { x: number; y: number } | null = null;
  const swipeStart = (e: TouchEvent) => (touch = e.touches.length === 1 ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } : null);
  function swipeEnd(e: TouchEvent) {
    const start = touch;
    touch = null;
    const end = e.changedTouches[0];
    if (!start || !end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) day = step(mode, day, dx < 0 ? 1 : -1);
  }

  const dayLabel = (d: string) => `${weekdayShort(d)} ${dayNumber(d)}`;

  /** Monat: die Aufgaben des gewählten Tages und seine Überschrift („Freitag, 31. Januar") */
  const dayCards = $derived(byDay.get(day) ?? []);
  const dayTitle = $derived.by(() => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(numberLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  });
  const dotsOf = (list: ScheduleCard[]) => [...new Set(list.map((c) => boardColorKey(c.boardColor, boardIndex(c.boardId))))].slice(0, 3);
  const nowMs = $derived((void minuteClock.tick, Date.now()));
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mt-3 flex items-center gap-1 {hideNav ? 'hidden' : ''}">
    <button class="flex h-11 w-9 items-center justify-center text-accent-text" aria-label={t('Zurück')} onclick={() => (day = step(mode, day, -1))}>
      <Icon name="chevron-left" size={22} stroke={2.6} />
    </button>
    <h2 class="min-w-0 flex-1 truncate text-center text-[17px] font-bold lg:text-[15px]" aria-live="polite">{rangeTitle(mode, day)}{#if mode === 'week' || mode === 'days3'}<span class="ml-2 text-[15px] font-medium text-text-soft"> KW {isoWeek(day)}</span>{/if}</h2>
    <button class="flex h-11 w-9 items-center justify-center text-accent-text" aria-label={t('Weiter')} onclick={() => (day = step(mode, day, 1))}>
      <Icon name="chevron-right" size={22} stroke={2.6} />
    </button>
    <button class="inline-flex h-9 shrink-0 items-center rounded-full bg-accent/12 px-3.5 text-[15px] font-semibold text-accent-text" onclick={() => (day = todayKey())}>{t('Heute')}</button>
  </div>

  {#if failed}
    <p class="py-10 text-center text-fg2">{t('Der Kalender konnte nicht geladen werden.')}</p>
  {:else if mode === 'month' && ui.desktop}
    <!-- Desktop: ein großes Monatsraster, jede Zelle mit den Aufgaben des Tages (Uhrzeit und Titel), sonst „+N weitere“ -->
    <div class="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-row bg-surface shadow-[0_0_0_0.5px_var(--sep)]" data-testid="calendar-month">
      <div class="grid shrink-0 grid-cols-7 border-b border-line">
        {#each weeks[0]! as d (d)}<span class="px-2.5 py-2 text-[11.5px] font-bold tracking-[0.06em] text-hint uppercase">{weekdayShort(d)}</span>{/each}
      </div>
      <div class="grid min-h-0 flex-1 grid-cols-7" style:grid-template-rows="repeat({weeks.length}, minmax(0, 1fr))">
        {#each weeks.flat() as d (d)}
          {@const list = [...(byDay.get(d) ?? [])].sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))}
          {@const showList = list.length > 3 ? list.slice(0, 2) : list}
          <div class="flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-t border-l border-line px-1 py-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0 [&:nth-child(-n+7)]:border-t-0" data-day={d}>
            <button
              class="flex h-[26px] w-[26px] shrink-0 items-center justify-center self-start rounded-full text-[13px] {d === today ? 'bg-accent font-bold text-on-accent' : inMonth(d, day) ? 'font-semibold' : 'font-medium text-hint'}"
              aria-label={`${dayLabel(d)}, ${tn('{n} Aufgabe', '{n} Aufgaben', list.length)}`}
              data-today={d === today ? '' : undefined}
              onclick={() => openDay(d)}
            >{dayNumber(d)}</button>
            {#each showList as c (c.id)}
              <button
                class="block w-full shrink-0 truncate rounded-[5px] border-l-[3px] px-1.5 py-px text-left text-[12px] font-medium {c.completedAt ? 'line-through opacity-60' : ''}"
                style:background="color-mix(in srgb, var(--c-{color(c)}-fg) 14%, var(--surface))"
                style:border-left-color="var(--c-{color(c)}-fg)"
                title="{c.title} · {c.boardName}"
                data-testid="calendar-month-event"
                onclick={() => openCardAnywhere(c)}
              ><b class="mr-1 font-bold tabular-nums">{clock(minutesOfDay(c.dueAt!))}</b>{c.title}</button>
            {/each}
            {#if list.length > showList.length}
              <button class="shrink-0 px-1.5 text-left text-[11.5px] font-semibold text-fg2 hover:text-fg" onclick={() => openDay(d)}>{t('+{n} weitere', { n: list.length - showList.length })}</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
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
              aria-label={`${dayLabel(d)}, ${tn('{n} Aufgabe', '{n} Aufgaben', list.length)}`}
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
    <div class="mt-3 grid shrink-0 gap-0.5" style:grid-template-columns="{ui.desktop ? 56 : 34}px repeat({days.length}, minmax(0, 1fr))" aria-hidden={mode === 'day'}>
      <span></span>
      {#each days as d (d)}
        <button
          class="flex flex-col items-center gap-0.5 rounded-xl py-1 text-[12px] font-medium {d === today ? 'text-accent-text' : 'text-text-soft'}"
          aria-current={d === day ? 'date' : undefined}
          onclick={() => openDay(d)}
          aria-label={t('Tag {day} öffnen', { day: dayLabel(d) })}
        >
          {weekdayShort(d)}
          <b class="flex h-8 min-w-8 items-center justify-center rounded-full text-[17px] font-bold {d === today ? 'bg-brand-dot text-on-accent' : d === day ? 'bg-surface2 text-fg' : 'text-fg'}">{dayNumber(d)}</b>
        </button>
      {/each}
    </div>

    <div class="mt-3 min-h-0 flex-1 overflow-hidden rounded-row border border-line bg-surface" role="presentation" ontouchstart={swipeStart} ontouchend={swipeEnd}>
      <div bind:this={scroller} class="h-full overflow-y-auto overscroll-contain" data-testid="calendar-grid">
        <div class="relative flex" style:height="{24 * HOUR_PX}px">
          <div class="relative shrink-0 {ui.desktop ? 'w-[56px]' : 'w-[34px]'}">
            {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
              <span class="absolute right-2 -translate-y-1/2 text-dim tabular-nums {ui.desktop ? 'text-[11px]' : 'right-1 text-[10px]'}" style:top="{h * HOUR_PX}px" class:hidden={h === 0}>{ui.desktop ? clock(h * 60) : h}</span>
            {/each}
          </div>
          <div class="relative flex flex-1">
            {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
              <div class="pointer-events-none absolute inset-x-0 border-t border-line/60" style:top="{h * HOUR_PX}px"></div>
            {/each}
            {#each days as d (d)}
              <div class="relative flex-1 border-l border-line/50">
                <button class="absolute inset-0 w-full cursor-pointer" aria-label={t('Neue Aufgabe am {day}', { day: dayLabel(d) })} onclick={(e) => tapSlot(e, d)}></button>
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
                  {@const hpx = Math.max((p.height / 60) * HOUR_PX - 3, 24)}
                  {@const lines = ui.desktop ? (hpx < 44 ? 1 : Math.max(1, Math.floor((hpx - 28) / 16))) : 2}
                  <button
                    class="absolute z-[2] overflow-hidden rounded-lg border-l-[3px] text-left {ui.desktop ? 'px-[7px] py-[3px]' : 'px-[5px] py-1'} {c.completedAt ? 'opacity-60' : ''}"
                    style:background="color-mix(in srgb, var(--c-{color(c)}-fg) {ui.desktop ? 16 : 15}%, var(--surface))"
                    style:border-left-color="var(--c-{color(c)}-fg)"
                    style:color={ui.desktop ? 'var(--text)' : `var(--c-${color(c)}-fg)`}
                    style:top="{(p.top / 60) * HOUR_PX + 1}px"
                    style:height="{hpx}px"
                    style:left="calc({(p.col / p.cols) * 100}% + 2px)"
                    style:width="calc({100 / p.cols}% - 4px)"
                    aria-label="{c.title}, {c.boardName}"
                    title="{c.title} · {clock(p.top)}–{clock(p.top + p.height)} · {c.boardName}"
                    data-testid="calendar-event"
                    onclick={() => openCardAnywhere(c)}
                  >
                    <span class="block min-w-0 overflow-hidden font-bold {ui.desktop ? 'text-[12.5px] leading-[1.25] [overflow-wrap:anywhere]' : 'text-[10.5px] leading-[1.2]'} {c.completedAt ? 'line-through' : ''} {!ui.desktop && mode === 'week' ? 'break-all' : ''}" style:display="-webkit-box" style:-webkit-line-clamp={lines} style:-webkit-box-orient="vertical">{c.title}</span>
                    {#if ui.desktop && hpx >= 44}<span class="block truncate text-[11.5px] opacity-75 tabular-nums">{clock(p.top)}–{clock(p.top + p.height)}</span>{/if}
                    {#if !ui.desktop && mode === 'day'}<span class="block truncate text-[10.5px] opacity-80">{c.boardName}</span>{/if}
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
    <p class="px-1 pt-2 pb-tabbar text-[12.5px] leading-[1.45] text-hint">{t('Auf eine freie Zeit tippen legt eine Aufgabe mit genau diesem Termin an.')}</p>
  {/if}

  {#if loading}<p class="sr-only" role="status">{t('Lädt …')}</p>{/if}
</div>
