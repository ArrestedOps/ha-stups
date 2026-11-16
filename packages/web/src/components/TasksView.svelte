<script lang="ts">
  import { tick } from 'svelte';
  import { clock } from '../lib/clock.svelte';
  import { agenda } from '../lib/agenda.svelte';
  import { type TodayCard } from '../lib/api';
  import { columnForNew, dayKeyOf, isoWeek, rangeTitle, step as stepCal, type CalMode } from '../lib/calendar';
  import { deviceTz } from '../lib/datetime';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { activeFilterCount, DEFAULT_FILTER, extraFilterCount, filterSchedule, isFiltered, personFilterActive, toggleId, WHEN_KEYS } from '../lib/schedule';
  import { matchesQuery } from '../lib/search';
  import type { StatsKind } from '../lib/statsSheets';
  import { groupTasks, nudgesToMe, parseTasksView, taskStats, taskStatsFor, type TasksView } from '../lib/tasks';
  import { ageText, sourceLine } from '../lib/today';
    import { activeScheduleFilter, claimCard, closeDetail, completeCard, filterContext, openCardAnywhere, openSheet, passCard, personById, setPersonScope, setScheduleFilter, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import CalendarBoards from './CalendarBoards.svelte';
  import CalendarView from './CalendarView.svelte';
  import FeedbackLink from './FeedbackLink.svelte';
  import Icon from './Icon.svelte';
  import type { ScheduleCard } from '../lib/schedule';
  import TaskRow from './TaskRow.svelte';
  import CardSheet from './CardSheet.svelte';
  import TaskTableRow from './TaskTableRow.svelte';
  import TopBar from './TopBar.svelte';
  import StupsCard from './StupsCard.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Segmented from './ui/Segmented.svelte';
  import StatsBar from './ui/StatsBar.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * Der Reiter Aufgaben nach dem Mockup (Main), von oben nach unten: Kopf mit Titel, Zahlenleiste, „Diese Woche" mit Wochenleiste,
   * Stups-Banner (nur bei offenem Stups an mich), Chips (Meine, Alle, Personen, Filter), die Gruppen Überfällig, Heute, Diese Woche, Später.
   * „Vom Haus" steht (nur mit Aufgaben) vor Überfällig, Fairness und „Bei den anderen" am Ende. Der Kalender (Tag, Woche, Monat) ist eine
   * eigene Seite unter Aufgaben mit „‹ Aufgaben" oben: „Monatsansicht" und der Kalender-Knopf der Wochenleiste öffnen sie.
   */

  // ---------- Ansicht: Liste oder Kalender ----------
  /** Ohne gemerkte Ansicht: auf dem Handy 3 Tage (genug Platz zum Lesen), am Desktop die Woche */
  const fallbackMode = (): CalMode => (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches ? 'week' : 'days3');
  const rememberedMode = (() => {
    try {
      const v = parseTasksView(localStorage.getItem('stups.calmode'));
      return v === 'list' ? fallbackMode() : v;
    } catch {
      return fallbackMode();
    }
  })();
  let view = $state<TasksView>('list');
  let calMode = $state<CalMode>(rememberedMode);
  let day = $state(dayKeyOf(Date.now()));

  const VIEWS = $derived([
    { id: 'day', label: t('Tag') },
    { id: 'days3', label: t('3 Tage') },
    { id: 'week', label: t('Woche') },
    { id: 'month', label: t('Monat') },
  ]);

  function setCalMode(m: CalMode) {
    calMode = m;
    view = m;
    try {
      localStorage.setItem('stups.calmode', m);
    } catch {
      /* egal */
    }
  }
  const openCalendar = (m: CalMode) => setCalMode(m);
  function openDay(key: string) {
    day = key;
    setCalMode('day');
  }
  const back = () => (view = 'list');
  // Die Leiste unten hat „Aufgaben“ und „Kalender“: sie wünschen sich die Ansicht über ui.tasksGoto
  $effect(() => {
    const goto = ui.tasksGoto;
    if (!goto) return;
    ui.tasksGoto = null;
    if (goto === 'calendar') setCalMode(view === 'list' ? calMode : (view as CalMode));
    else view = 'list';
  });
  $effect(() => {
    ui.tasksCalendar = view !== 'list';
    // Im Kalender gibt es keine Detailspalte: eine gewählte Aufgabe öffnet dort als Fenster
    if (ui.tasksCalendar) closeDetail();
    return () => {
      ui.tasksCalendar = false;
    };
  });

  // ---------- Daten (Store: dieselben wie für die Glocke) ----------
  const today = $derived(agenda.today);
  const open = $derived(agenda.open);
  const undated = $derived(agenda.undated);
  const recentDone = $derived(agenda.recentDone);
  const loaded = $derived(agenda.loaded);
  const failed = $derived(agenda.failed);

  const tz = deviceTz();
  const nowMs = $derived((void ui.rev, void clock.tick, Date.now()));
  const meId = $derived(ui.me?.id ?? null);
  /** Der Filter, wie er für diese Rolle gilt, und was er zum Rechnen braucht */
  const sf = $derived(activeScheduleFilter());
  const fctx = $derived(filterContext());
  /** Ein Kind sieht nur die eigenen Aufgaben; Erwachsene wählen mit den Chips und dem Blatt „Filter" */
  /** Desktop: das Suchfeld oben filtert die geladenen Aufgaben (Titel, Beschreibung, Board, Kategorien) */
  /** Handy: das Suchfeld unter dem Titel (Desktop: das Feld oben in der Kopfzeile) */
  let phoneQuery = $state('');
  const query = $derived((ui.desktop ? ui.query : phoneQuery).trim());
  const visible = (list: typeof open, f = sf) =>
    filterSchedule(ui.isChild ? list.filter((c) => !!meId && c.assigneeIds.includes(meId)) : list, f, fctx).filter(
      (c) => !query || matchesQuery(query, c.title, c.description, c.boardName, ...c.categories.map((x) => x.name)),
    );
  const house = $derived<TodayCard[]>(ui.isChild ? [] : (today?.house ?? []).filter((c) => !query || matchesQuery(query, c.title, c.why, c.boardName)));
  const houseIds = $derived(new Set(house.map((c) => c.id)));
  const shownOpen = $derived(visible([...open, ...undated]).filter((c) => !houseIds.has(c.id)));
  /**
   * Was die Liste gerade ausblendet, ohne dass man es sieht: (1) Aufgaben anderer und Aufgaben ohne Zuständigen, solange „Meine“ (oder eine Person)
   * gewählt ist (beim Start immer), und (2) Aufgaben ohne Termin, solange der Filter „Ohne Termin“ aus ist; Aufgaben von Wächtern haben meist keinen
   * Termin. Ohne Hinweis wirkt eine Aufgabe, die man am Handy sieht, am Desktop wie verschwunden.
   */
  const allWhen = [...WHEN_KEYS];
  const everyOpen = $derived([...open, ...undated]);
  const hiddenByScope = $derived(
    ui.isChild || !personFilterActive(sf) ? 0 : visible(everyOpen, { ...sf, personIds: [], unassigned: false }).filter((c) => !houseIds.has(c.id)).length - shownOpen.length,
  );
  const hiddenUndated = $derived(
    ui.isChild || sf.when.includes('undated') ? 0 : visible(everyOpen, { ...sf, when: allWhen }).filter((c) => !houseIds.has(c.id)).length - shownOpen.length,
  );
  const groups = $derived(
    groupTasks(sf.showDone ? [...shownOpen, ...visible(recentDone).filter((c) => !houseIds.has(c.id))] : shownOpen, nowMs, tz, {
      withDone: sf.showDone,
      sort: sf.sort,
    }),
  );
  /** Desktop: die Gruppen der gewählten Ansicht (Seitenleiste) und Gruppierung (Kopfzeile) */
  type DeskGroup = { key: string; title: string; cards: ScheduleCard[] };
  const deskGroups = $derived.by<DeskGroup[]>(() => {
    const v = ui.taskView;
    const base = v === 'done' ? visible(recentDone).filter((c) => !houseIds.has(c.id)) : shownOpen;
    if (v === 'nudged') {
      const ids = new Set(nudges.map((n) => n.card.id));
      return [{ key: 'nudged', title: t('Gestupst'), cards: base.filter((c) => ids.has(c.id)) }];
    }
    if (ui.taskGroupBy === 'board' && v !== 'done') {
      const dueOnly = base.filter((c) => (v === 'all' ? true : groupTasks([c], nowMs, tz)[0]?.key === v));
      return ui.boards
        .map((b) => ({ key: `board:${b.id}`, title: b.name, cards: dueOnly.filter((c) => c.boardId === b.id) }))
        .filter((g) => g.cards.length > 0);
    }
    const gs = groupTasks(base, nowMs, tz, { withDone: v === 'done', sort: sf.sort });
    return gs.filter((g) => (v === 'all' ? g.key !== 'done' : v === 'done' ? g.key === 'done' : g.key === v));
  });
  // Die Aufgabe klappt unter ihrer Zeile auf: ins Bild scrollen, wenn sie unten herausragt
  $effect(() => {
    const id = ui.detailId;
    if (!id || !ui.desktop) return;
    void tick().then(() => document.querySelector('[data-testid="detail-row"]')?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  });
  const deskCount = $derived(deskGroups.reduce((n, g) => n + g.cards.length, 0));
  $effect(() => {
    ui.taskCount = deskCount;
  });
  const stats = $derived(taskStats([...open, ...recentDone], meId, nowMs, tz));
  /** Meine offenen Aufgaben, die in den nächsten sieben Tagen fällig werden (die Kachel „Diese Woche“) */
  const weekCount = $derived(
    meId ? open.filter((c) => c.assigneeIds.includes(meId) && !!c.dueAt && Date.parse(c.dueAt) >= nowMs && Date.parse(c.dueAt) < nowMs + 7 * 86_400_000).length : 0,
  );
  /** Desktop: die Zahlen der Kacheln folgen dem Menü „Für wen?“ (ohne Auswahl alle Personen; ein Kind sieht nur das Eigene) */
  const deskStats = $derived(taskStatsFor([...open, ...recentDone], ui.isChild ? (meId ? [meId] : []) : sf.personIds, nowMs, tz));
  /** Die Kachel, die gerade die Liste filtert (Gestupst und Alle offen haben keine Kachel) */
  const deskTile = $derived(ui.taskView === 'today' || ui.taskView === 'overdue' || ui.taskView === 'week' || ui.taskView === 'done' ? ui.taskView : null);
  const pickTile = (id: string) => {
    const v = id as 'today' | 'overdue' | 'week' | 'done';
    ui.taskView = ui.taskView === v ? 'all' : v;
  };
  const nudges = $derived(
    (ui.isChild ? [] : nudgesToMe(open, meId)).sort((a, b) => (a.card.updatedAt < b.card.updatedAt ? 1 : a.card.updatedAt > b.card.updatedAt ? -1 : 0)),
  );
  const others = $derived(
    (today?.others ?? []).map((o) => ({ ...o, person: personById(o.personId) })).filter((o): o is typeof o & { person: NonNullable<typeof o.person> } => o.person !== undefined),
  );
  const othersOpen = $derived(others.reduce((sum, o) => sum + o.open, 0));

  // ---------- Chips: Meine, Alle, Personen, Filter ----------
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== meId));
  /** Zähler am Knopf „Filter": was das Blatt eingestellt hat und die Chips daneben nicht zeigen */
  const extraFilter = $derived(extraFilterCount(sf));
  let closed = $state<string[]>([]);
  const toggleGroup = (key: string) => (closed = toggleId(closed, key));

  /** Desktop: Pfeil auf und ab springt in der Liste von Zeile zu Zeile (Enter öffnet sie in der Detailspalte) */
  function arrows(e: KeyboardEvent) {
    if (!ui.desktop || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.metaKey || e.ctrlKey) return;
    const el = e.target as HTMLElement;
    if (!el.matches?.('[data-row-open]')) return;
    const rows = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-row-open]')];
    const next = rows[rows.indexOf(el) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  const done = (c: TodayCard) => void completeCard(c);
  const openHouse = (c: TodayCard) => void openCardAnywhere(c);

  /** Desktop: Schnellzeile über der Tabelle */
  let quick = $state('');
  const quickColumn = $derived(columnForNew(ui.view?.columns ?? [], false));

  /** Handy: Beschriftung und Menü des Bereichs-Chips */
  let scopeOpen = $state(false);
  const scopeText = $derived.by(() => {
    if (!personFilterActive(sf)) return t('Alle Aufgaben');
    if (sf.personIds.length === 1) {
      if (sf.personIds[0] === meId) return t('Meine Aufgaben');
      const p = ui.people.find((x) => x.id === sf.personIds[0]);
      if (p) return t('Aufgaben von {name}', { name: p.displayName });
    }
    return t('Mehrere Personen');
  });
  /** Ein Stups: die Aufgabe öffnen (dort die Antwort); mehrere: die Liste der Mitteilungen */
</script>

{#snippet scopeHint()}
  {#if hiddenByScope > 0}
    <p class="flex flex-wrap items-center gap-x-2 px-1 text-[13.5px] text-fg2" data-testid="scope-hidden">
      <span>{tn('{n} weitere Aufgabe ist ausgeblendet (von anderen oder ohne Zuständigen).', '{n} weitere Aufgaben sind ausgeblendet (von anderen oder ohne Zuständigen).', hiddenByScope)}</span>
      <button type="button" class="font-bold text-accent-text" data-testid="scope-show-all" onclick={() => setPersonScope([])}>{t('Alle anzeigen')}</button>
    </p>
  {/if}
  {#if hiddenUndated > 0}
    <p class="flex flex-wrap items-center gap-x-2 px-1 text-[13.5px] text-fg2" data-testid="undated-hidden">
      <span>{tn('{n} Aufgabe ohne Termin ist ausgeblendet.', '{n} Aufgaben ohne Termin sind ausgeblendet.', hiddenUndated)}</span>
      <button type="button" class="font-bold text-accent-text" data-testid="undated-show" onclick={() => setScheduleFilter({ when: allWhen })}>{t('Anzeigen')}</button>
    </p>
  {/if}
{/snippet}

{#snippet scopeItem(label: string, on: boolean, run: () => void)}
  <button class="flex h-11 w-full items-center justify-between gap-3 px-4 text-left text-[16px]" role="menuitemradio" aria-checked={on} onclick={() => { run(); scopeOpen = false; }}>
    {label}{#if on}<Icon name="check" size={18} stroke={2.6} />{/if}
  </button>
{/snippet}

{#snippet filterButton(count: number, small: boolean)}
  <!-- Knopf „Filter" (wie im Mockup neben den Chips): mit gesetztem Filter Umriss und Zähler -->
  <span class="relative inline-flex shrink-0" data-testid="filter-button">
    <Chip
      {small}
      square
      label={count > 0 ? t('Filter, {n} aktiv', { n: count }) : t('Filter')}
      outline={count > 0}
      onclick={() => openSheet({ type: 'filter' })}
    ><Icon name="sliders" size={small ? 18 : 20} /></Chip>
    {#if count > 0}
      <span
        class="pointer-events-none absolute -top-1 -right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-grad px-1 text-[11px] leading-none font-extrabold"
        data-testid="filter-count"
        aria-hidden="true">{count}</span
      >
    {/if}
  </span>
{/snippet}

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col lg:max-w-none lg:flex-row lg:gap-6">
  {#if view !== 'list'}
    <!-- Kalender: eigene Seite unter Aufgaben (Zurück, Titel, Monat, Tag/Woche/Monat) -->
    <div class="flex min-h-0 flex-1 flex-col px-3 pt-[calc(var(--safe-top)+8px)] lg:px-0 lg:pt-0" data-testid="calendar-page">
      <div class="flex flex-col gap-3">
        <!-- Handy: derselbe Kopf wie auf allen Reitern (Logo, Home Assistant, Glocke, Zahnrad), darunter der Titel -->
        {#if !ui.desktop}
        <TopBar title={t('Kalender')} sub={t('Deine Aufgaben, Termine und To-dos an einem Ort.')} />
        {:else}
        <!-- Desktop: Heute und Pfeile, Zeitraum mit Kalenderwoche; rechts Boards, Tag, 3 Tage, Woche, Monat und der Filter. Kein Umbruch: der Zeitraum
             wird gekürzt, damit nichts springt, wenn er bei „Tag“ länger wird -->
        <div class="flex flex-nowrap items-center gap-2.5" data-testid="calendar-head">
          <button class="inline-flex h-9 shrink-0 items-center rounded-full bg-surface px-4 text-[14px] font-semibold shadow-[0_0_0_0.5px_var(--sep)] hover:bg-surface2" onclick={() => (day = dayKeyOf(nowMs))}>{t('Heute')}</button>
          <span class="flex shrink-0 items-center">
            <button class="flex h-9 w-9 items-center justify-center rounded-full text-text-soft hover:bg-surface2 hover:text-fg" aria-label={t('Zurück')} onclick={() => (day = stepCal(calMode, day, -1))}><Icon name="chevron-left" size={18} stroke={2.4} /></button>
            <button class="flex h-9 w-9 items-center justify-center rounded-full text-text-soft hover:bg-surface2 hover:text-fg" aria-label={t('Weiter')} onclick={() => (day = stepCal(calMode, day, 1))}><Icon name="chevron-right" size={18} stroke={2.4} /></button>
          </span>
          <h2 class="flex min-w-0 flex-1 items-baseline gap-2 text-[19px] font-bold tracking-tight" aria-live="polite"><span class="truncate">{rangeTitle(calMode, day)}</span>{#if calMode === 'week' || calMode === 'days3'}<span class="shrink-0 text-[14px] font-medium text-text-soft">KW {isoWeek(day)}</span>{/if}</h2>
          <CalendarBoards />
          <div class="w-[290px] shrink-0"><Segmented items={VIEWS} value={calMode} label={t('Ansicht')} small onchange={(v) => setCalMode(v as CalMode)} /></div>
          {@render filterButton(activeFilterCount(sf), true)}
        </div>
        {/if}
        {#if !ui.desktop}
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1"><Segmented items={[...VIEWS, { id: 'list', label: t('Liste') }]} value={calMode} label={t('Ansicht')} small onchange={(v) => (v === 'list' ? back() : setCalMode(v as CalMode))} /></div>
            <span class="inline-flex" data-testid="filter-button">
              <span class="relative inline-flex">
                <button class="top-circle {activeFilterCount(sf) > 0 ? 'ring-2 ring-accent' : ''}" aria-label={activeFilterCount(sf) > 0 ? t('Filter, {n} aktiv', { n: activeFilterCount(sf) }) : t('Filter')} onclick={() => openSheet({ type: 'filter' })}>
                  <Icon name="sliders" size={20} stroke={2} />
                </button>
                {#if activeFilterCount(sf) > 0}<span class="bell-count pointer-events-none absolute -top-1 -right-1" data-testid="filter-count" aria-hidden="true">{activeFilterCount(sf)}</span>{/if}
              </span>
            </span>
          </div>
        {/if}
      </div>
      <div class="flex min-h-0 flex-1 gap-6">
        <div class="flex min-h-0 min-w-0 flex-1 flex-col"><CalendarView mode={calMode} bind:day onopenday={openDay} hideNav={ui.desktop} /></div>
      </div>
    </div>
  {:else}
    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-[calc(var(--safe-top)+8px)] pb-fab lg:-mx-1 lg:px-1 lg:pt-0" data-testid="tasks" role="presentation" onkeydown={arrows}>
      <div class="flex flex-col gap-3">
        <div class="order-[-10]"><TopBar title={t('Aufgaben')} sub={t('Deine Aufgaben, Termine und To-dos an einem Ort.')} subTestid="tasks-sub" /></div>
        {#if !ui.desktop && loaded}
          <label class="order-[-8] flex h-9 items-center gap-1.5 rounded-[10px] bg-surface2 px-2.5 text-text-soft">
            <Icon name="search" size={17} stroke={2} />
            <input class="h-full min-w-0 flex-1 bg-transparent text-[17px] text-fg outline-none placeholder:text-text-soft" type="search" enterkeyhint="search" placeholder="{t('Suchen')} …" aria-label={t('Aufgaben durchsuchen')} bind:value={phoneQuery} />
          </label>
        {/if}

        {#if failed && !loaded}
          <p class="py-10 text-center text-fg2">{t('Aufgaben konnten nicht geladen werden.')}</p>
        {:else if !loaded}
          <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
        {:else}
          <div class="max-lg:order-[-6] lg:hidden">
          <StatsBar
            label={t('Deine Zahlen')}
            onselect={(id) => (id === 'week' ? openCalendar('week') : openSheet({ type: 'stats', kind: id as StatsKind }))}
            items={[
              { id: 'today', label: t('Heute fällig'), value: stats.today, icon: 'calendar', color: 'blue' },
              { id: 'overdue', label: t('Überfällig'), value: stats.overdue, icon: 'alert-circle', color: 'red' },
              { id: 'week', label: t('Diese Woche'), value: weekCount, icon: 'list', color: 'orange' },
              { id: 'done', label: t('Erledigt heute'), value: stats.done, icon: 'done', color: 'gray' },
            ]}
          />
          </div>

          {#if nudges.length > 0}
            <div class="max-lg:order-[-7] lg:hidden"><StupsCard {nudges} /></div>
          {/if}
          <!-- Handy: ein Bereichs-Chip („Meine Aufgaben ▾“) mit Menü und der Filter-Knopf; Desktop: die Chips unten -->
          <div class="relative flex items-center justify-between gap-2 lg:hidden order-[-9]">
            {#if !ui.isChild}
              <button
                class="inline-flex h-9 items-center gap-1 rounded-full bg-surface2 px-3.5 text-[15px] font-semibold"
                aria-haspopup="menu"
                aria-expanded={scopeOpen}
                data-testid="scope-button"
                onclick={() => (scopeOpen = !scopeOpen)}
              >{scopeText}<Icon name="chevron-down" size={16} stroke={2.4} /></button>
              {#if scopeOpen}
                <button class="fixed inset-0 z-40 cursor-default" aria-label={t('Schließen')} tabindex="-1" onclick={() => (scopeOpen = false)}></button>
                <div class="absolute top-11 left-0 z-50 min-w-[230px] overflow-hidden rounded-[14px] bg-surface py-1 shadow-[0_10px_30px_rgba(0,0,0,0.22)]" role="menu" aria-label={t('Personen')}>
                  {@render scopeItem(t('Alle Aufgaben'), !personFilterActive(sf), () => setScheduleFilter({ personIds: [], unassigned: false }))}
                  {#if ui.me?.isPerson}
                    {@render scopeItem(t('Meine Aufgaben'), sf.personIds.length === 1 && sf.personIds[0] === ui.me.id, () => setScheduleFilter({ personIds: [ui.me!.id], unassigned: false }))}
                  {/if}
                  {#each people as p (p.id)}
                    {@render scopeItem(t('Aufgaben von {name}', { name: p.displayName }), sf.personIds.length === 1 && sf.personIds[0] === p.id, () => setScheduleFilter({ personIds: [p.id], unassigned: false }))}
                  {/each}
                </div>
              {/if}
            {:else}
              <span></span>
            {/if}
            <span class="relative inline-flex shrink-0" data-testid="filter-button">
              <button class="top-circle {extraFilter > 0 ? 'ring-2 ring-accent' : ''}" aria-label={extraFilter > 0 ? t('Filter, {n} aktiv', { n: extraFilter }) : t('Filter')} onclick={() => openSheet({ type: 'filter' })}>
                <Icon name="sliders" size={20} stroke={2} />
              </button>
              {#if extraFilter > 0}
                <span class="bell-count pointer-events-none absolute -top-1 -right-1" data-testid="filter-count" aria-hidden="true">{extraFilter}</span>
              {/if}
            </span>
          </div>

          {#if ui.desktop}
            <!-- Desktop (Entwurf): Stups-Leiste, Schnellzeile, Tabelle mit den Spalten Aufgabe, Board, Fällig, Wer; die Ansicht wählt die Seitenleiste -->
            {#if nudges.length > 0 && (ui.taskView === 'all' || ui.taskView === 'nudged')}<StupsCard bar {nudges} />{/if}
            <StatsBar
              desk
              label={t('Deine Zahlen')}
              selected={deskTile}
              onselect={pickTile}
              items={[
                { id: 'today', label: t('Heute fällig'), value: deskStats.today },
                { id: 'overdue', label: t('Überfällig'), value: deskStats.overdue, tone: 'danger' },
                { id: 'week', label: t('Diese Woche'), value: deskStats.week },
                { id: 'done', label: t('Erledigt heute'), value: deskStats.done },
              ]}
            />
            <div class="flex items-center justify-between gap-3" data-testid="desk-toolbar">
              <span class="flex min-h-7 items-center">
                {#if ui.taskView !== 'all'}
                  <span class="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft pr-1 pl-3 text-[13px] font-bold text-accent-text" data-testid="view-chip">
                    {{ nudged: t('Gestupst'), today: t('Heute fällig'), overdue: t('Überfällig'), week: t('Diese Woche'), done: t('Erledigt heute') }[ui.taskView as 'nudged' | 'today' | 'overdue' | 'week' | 'done']}
                    <button class="flex h-5 w-5 items-center justify-center rounded-full hover:bg-surface2" aria-label={t('Filter aufheben')} onclick={() => (ui.taskView = 'all')}><Icon name="x" size={12} stroke={2.6} /></button>
                  </span>
                {/if}
              </span>
              <span class="flex items-center gap-2 text-[13px] font-medium text-text-soft">
                {t('Gruppieren')}
                <span class="flex h-8 shrink-0 items-center gap-0.5 rounded-[10px] bg-surface2 p-0.5" role="radiogroup" aria-label={t('Gruppieren')}>
                  {#each [['due', t('Fälligkeit')], ['board', 'Board']] as [id, label] (id)}
                    <button class="h-7 rounded-[8px] px-3 text-[13px] font-semibold {ui.taskGroupBy === id ? 'bg-surface shadow-sm' : 'text-text-soft'}" role="radio" aria-checked={ui.taskGroupBy === id} onclick={() => (ui.taskGroupBy = id as 'due' | 'board')}>{label}</button>
                  {/each}
                </span>
              </span>
            </div>
            {#if !ui.isChild && quickColumn}
              <label class="flex h-11 items-center gap-3 rounded-[12px] bg-surface px-3 text-text-soft">
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-accent/14 text-accent-text"><Icon name="plus" size={14} stroke={2.6} /></span>
                <input
                  class="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-text-soft"
                  placeholder={t('Neue Aufgabe: z. B. Müll morgen 19 Uhr')}
                  aria-label={t('Neue Aufgabe schnell anlegen')}
                  bind:value={quick}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && quick.trim()) {
                      e.preventDefault();
                      openSheet({ type: 'new', columnId: quickColumn!, title: quick.trim() });
                      quick = '';
                    }
                  }}
                />
                {@render filterButton(extraFilter, true)}
              </label>
            {/if}
            {@render scopeHint()}
            <div class="grid px-4 text-[12px] font-medium text-text-soft" style:grid-template-columns="minmax(0,1fr) 170px 150px 92px" aria-hidden="true">
              <span class="pl-11">{t('Aufgabe')}</span><span>Board</span><span>{t('Fällig')}</span><span class="text-right">{t('Wer')}</span>
            </div>
            {#if ui.detailId && !deskGroups.some((g) => g.cards.some((c) => c.id === ui.detailId))}
              <div class="rounded-row bg-bg px-4 pt-3 pb-5 shadow-[inset_0_0_0_0.5px_var(--sep)]" data-testid="detail-row">{#key ui.detailId}<CardSheet inline id={ui.detailId} />{/key}</div>
            {/if}
            {#each deskGroups as g (g.key)}
              {@const isOpen = !closed.includes(g.key)}
              <section aria-label={g.title} data-testid="group-{g.key}">
                <SectionHeader title={g.title} count={g.cards.length} tone={g.key === 'overdue' ? 'danger' : undefined} plain open={isOpen} ontoggle={() => toggleGroup(g.key)} />
                {#if isOpen}
                  <ul class="list-group !mt-0 desk-table">
                    {#each g.cards as c (c.id)}
                      <li><TaskTableRow card={c} {nowMs} showBoard /></li>
                      {#if ui.detailId === c.id}
                        <li class="bg-bg px-4 pt-2 pb-5 shadow-[inset_0_0_0_0.5px_var(--sep)]" data-testid="detail-row">{#key c.id}<CardSheet inline id={c.id} />{/key}</li>
                      {/if}
                    {/each}
                  </ul>
                {/if}
              </section>
            {/each}
            {#if deskCount === 0}
              <div class="py-10 text-center" data-testid="tasks-empty">
                <p class="text-[17px] font-semibold">{t('Hier ist nichts offen.')}</p>
                <p class="mt-1 text-[15px] text-text-soft">{t('Gute Arbeit.')}</p>
              </div>
            {/if}
          {/if}

          {#if house.length > 0}
            <section aria-label={t('Vom Haus')} data-testid="today-house">
              <SectionHeader title={t('Vom Haus')} icon="eye" tone="house" count={house.length} large />
              <ul class="mt-2 space-y-2">
                {#each house as c (c.id)}
                  <li class="rounded-row border border-house-line bg-house-bg p-3.5">
                    <p class="text-[13px] font-semibold text-house">{sourceLine(c).text} · {ageText(c.createdAt, nowMs)}</p>
                    <button class="mt-1 block w-full text-left text-[16px] leading-snug font-bold" onclick={() => openHouse(c)}>{c.title}</button>
                    {#if c.why}<p class="mt-1 text-[13px] text-fg2">{c.why}</p>{/if}
                    <div class="mt-3 flex gap-2">
                      {#if c.assigneeIds.length === 0}
                        <!-- "Erst vorschlagen": noch hat niemand die Aufgabe, wer zuerst tippt, bekommt sie -->
                        <button class="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-house font-semibold text-bg" onclick={() => void claimCard(c)}>
                          <Icon name="hand" size={18} />{t('Übernehmen')}
                        </button>
                      {:else}
                        <button class="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-house font-semibold text-bg" onclick={() => done(c)}>
                          <Icon name="check" size={18} stroke={2.8} />{t('Erledigt')}
                        </button>
                        <button class="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-house-line font-semibold text-house" onclick={() => void passCard(c)}>
                          <Icon name="arrow-right" size={18} />{t('Weitergeben')}
                        </button>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          {#if !ui.desktop}{@render scopeHint()}{/if}
          {#each ui.desktop ? [] : groups as g (g.key)}
            {@const isOpen = !closed.includes(g.key)}
            <section aria-label={g.title} data-testid="group-{g.key}">
              <SectionHeader
                title={g.title}
                count={g.cards.length}
                tone={g.key === 'overdue' ? 'danger' : undefined}
                plain
                open={isOpen}
                ontoggle={() => toggleGroup(g.key)}
              />
              {#if isOpen}
                <ul class="list-group !mt-0">
                  {#each g.cards as c (c.id)}<li><TaskRow card={c} {nowMs} /></li>{/each}
                </ul>
              {/if}
            </section>
          {/each}

          {#if !ui.desktop && groups.length === 0 && house.length === 0}
            <div class="py-6 text-center" data-testid="tasks-empty">
              <p class="text-[17px] font-semibold">{t('Keine Aufgaben mit Termin')}</p>
              <p class="mt-1 text-[15px] text-fg2">{t('Aufgaben mit Termin erscheinen hier, nach Fälligkeit geordnet.')}</p>
              {#if isFiltered(sf)}
                <button class="mt-3 min-h-11 rounded-xl border border-line px-4 text-[15px]" onclick={() => setScheduleFilter({ ...DEFAULT_FILTER })}>{t('Zurücksetzen')}</button>
              {/if}
            </div>
          {/if}

          {#if !ui.isChild}
            <!-- Fairness und die Aufgaben der anderen: ohne Rangliste, Prozente und Punkte -->
            <div class="flex flex-col gap-2">
              <ListRow title={t('Fairness diese Woche')} onclick={() => openSheet({ type: 'week' })}>
                {#snippet tile()}<Tile color="teal"><Icon name="user" size={24} /></Tile>{/snippet}
                {#snippet meta()}{t('Wer erledigt wie viel, ohne Rangliste')}{/snippet}
                {#snippet right()}<Icon name="chevron-right" size={18} stroke={2} />{/snippet}
              </ListRow>
              {#if others.length > 0}
                <ListRow title={t('Bei den anderen')} onclick={() => openSheet({ type: 'week' })}>
                  {#snippet meta()}{tn('{n} Aufgabe offen', '{n} Aufgaben offen', othersOpen)}{/snippet}
                  {#snippet right()}
                    <span class="flex -space-x-1.5">
                      {#each others.slice(0, 4) as o (o.personId)}<Avatar person={o.person} size={28} ring={1.5} />{/each}
                    </span>
                  {/snippet}
                </ListRow>
              {/if}
            </div>
            <FeedbackLink />
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</main>
