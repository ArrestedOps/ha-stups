<script lang="ts">
  import { agenda } from '../lib/agenda.svelte';
  import { type TodayCard } from '../lib/api';
  import type { CalMode } from '../lib/calendar';
  import { deviceTz } from '../lib/datetime';
  import { names as monthNames } from '../lib/i18n/names';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { DEFAULT_FILTER, dayKeyOf, filterSchedule, personFilterActive, toggleId } from '../lib/schedule';
  import { scrollStrip } from '../lib/scrollStrip';
  import { groupTasks, nudgesToMe, parseTasksView, taskStats, type TaskGroupKey, type TasksView } from '../lib/tasks';
  import { ageText, sourceLine } from '../lib/today';
  import { shortMonthTitle, weekStrip } from '../lib/week';
  import { claimCard, completeCard, openCardAnywhere, openSheet, passCard, personById, setScheduleFilter, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import CalendarView from './CalendarView.svelte';
  import Icon from './Icon.svelte';
  import TaskRow from './TaskRow.svelte';
  import WeekStrip from './WeekStrip.svelte';
  import TopBar from './TopBar.svelte';
  import Banner from './ui/Banner.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Segmented from './ui/Segmented.svelte';
  import StatsBar from './ui/StatsBar.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * Der Reiter Aufgaben nach dem Mockup (Main), von oben nach unten: Kopf mit Titel, Zahlenleiste, „Diese Woche" mit Wochenleiste,
   * Stups-Banner (nur bei offenem Stups an mich), Chips (Meine, Alle, Personen, Filter), die Gruppen Überfällig, Heute, Diese Woche, Später.
   * „Vom Haus" steht (nur mit Karten) vor Überfällig, Fairness und „Bei den anderen" am Ende. Der Kalender (Tag, Woche, Monat) ist eine
   * eigene Seite unter Aufgaben mit „‹ Aufgaben" oben: „Monatsansicht" und der Kalender-Knopf der Wochenleiste öffnen sie.
   */

  // ---------- Ansicht: Liste oder Kalender ----------
  const rememberedMode = (() => {
    try {
      const v = parseTasksView(localStorage.getItem('stups.calmode'));
      return v === 'list' ? 'week' : v;
    } catch {
      return 'week';
    }
  })();
  let view = $state<TasksView>('list');
  let calMode = $state<CalMode>(rememberedMode);
  let day = $state(dayKeyOf(Date.now()));

  const VIEWS = $derived([
    { id: 'day', label: t('Tag') },
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
  $effect(() => {
    ui.tasksCalendar = view !== 'list';
    return () => {
      ui.tasksCalendar = false;
    };
  });

  // ---------- Daten (Store: dieselben wie für die Glocke) ----------
  const today = $derived(agenda.today);
  const open = $derived(agenda.open);
  const recentDone = $derived(agenda.recentDone);
  const loaded = $derived(agenda.loaded);
  const failed = $derived(agenda.failed);

  const tz = deviceTz();
  const nowMs = $derived((void ui.rev, Date.now()));
  const meId = $derived(ui.me?.id ?? null);
  /** Ein Kind sieht nur die eigenen Karten; Erwachsene wählen mit den Chips */
  const visible = (list: typeof open) => (ui.isChild ? list.filter((c) => !!meId && c.assigneeIds.includes(meId)) : filterSchedule(list, ui.sf));
  const house = $derived<TodayCard[]>(ui.isChild ? [] : (today?.house ?? []));
  const houseIds = $derived(new Set(house.map((c) => c.id)));
  const shownOpen = $derived(visible(open).filter((c) => !houseIds.has(c.id)));
  const groups = $derived(
    groupTasks(ui.sf.showDone ? [...shownOpen, ...visible(recentDone).filter((c) => !houseIds.has(c.id))] : shownOpen, nowMs, tz, { withDone: ui.sf.showDone }),
  );
  const stats = $derived(taskStats([...open, ...recentDone], meId, nowMs, tz));
  const strip = $derived(weekStrip(visible(open), nowMs, tz));
  const nudges = $derived(
    (ui.isChild ? [] : nudgesToMe(open, meId)).sort((a, b) => (a.card.updatedAt < b.card.updatedAt ? 1 : a.card.updatedAt > b.card.updatedAt ? -1 : 0)),
  );
  const others = $derived(
    (today?.others ?? []).map((o) => ({ ...o, person: personById(o.personId) })).filter((o): o is typeof o & { person: NonNullable<typeof o.person> } => o.person !== undefined),
  );
  const othersOpen = $derived(others.reduce((sum, o) => sum + o.open, 0));
  const monthTitle = $derived(shortMonthTitle(nowMs, tz));
  const calMonthTitle = $derived.by(() => {
    const [y, m] = day.split('-');
    return `${monthNames().monthsLong[Number(m) - 1]} ${y}`;
  });

  const nameList = (ids: string[]) => ids.map((id) => personById(id)?.displayName ?? t('Jemand')).join(', ');

  // ---------- Chips: Meine, Alle, Personen, Filter ----------
  const sf = $derived(ui.sf);
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== meId));
  const extraFilter = $derived(sf.boardIds.length > 0 || sf.showDone || sf.unassigned);
  let closed = $state<string[]>([]);
  const toggleGroup = (key: string) => (closed = toggleId(closed, key));

  const GROUP_ICON: Record<TaskGroupKey, { icon: string; tone: 'red' | 'orange' | 'blue' | 'soft' | 'green' }> = {
    overdue: { icon: 'alert', tone: 'red' },
    today: { icon: 'calendar', tone: 'orange' },
    week: { icon: 'calendar', tone: 'blue' },
    later: { icon: 'calendar', tone: 'soft' },
    done: { icon: 'done', tone: 'green' },
  };

  const done = (c: TodayCard) => void completeCard(c);
  const openHouse = (c: TodayCard) => void openCardAnywhere(c);
  /** Ein Stups: die Karte öffnen (dort die Antwort); mehrere: die Liste der Mitteilungen */
  const openNudge = () => (nudges.length === 1 ? void openCardAnywhere(nudges[0]!.card) : openSheet({ type: 'notifications' }));
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col">
  {#if view !== 'list'}
    <!-- Kalender: eigene Seite unter Aufgaben (Zurück, Titel, Monat, Tag/Woche/Monat) -->
    <div class="flex min-h-0 flex-1 flex-col px-3 pt-[calc(var(--safe-top)+8px)]" data-testid="calendar-page">
      <div class="flex flex-col gap-3">
        <div>
          <button class="-ml-1 inline-flex h-11 items-center gap-0.5 text-[16px] font-semibold text-accent-text" onclick={back}>
            <Icon name="chevron-left" size={22} stroke={2.2} />{t('Aufgaben')}
          </button>
          <div class="flex items-end justify-between gap-2">
            <h1 class="mt-0.5 text-[30px] leading-[1.1] font-extrabold tracking-tight">{t('Kalender')}</h1>
            <div class="mb-0.5 flex items-center gap-2">
              {#if !ui.isChild}
                <Chip small square label={t('Filter')} outline={extraFilter || personFilterActive(sf)} onclick={() => openSheet({ type: 'filter' })}><Icon name="sliders" size={18} /></Chip>
              {/if}
              <Chip small onclick={() => setCalMode('month')}>{calMonthTitle}<Icon name="chevron-down" size={16} stroke={2} /></Chip>
            </div>
          </div>
        </div>
        <Segmented items={VIEWS} value={calMode} label={t('Ansicht')} small onchange={(v) => setCalMode(v as CalMode)} />
      </div>
      <CalendarView mode={calMode} bind:day onopenday={openDay} />
    </div>
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-[calc(var(--safe-top)+8px)] pb-fab" data-testid="tasks">
      <div class="flex flex-col gap-3.5">
        <TopBar title={t('Aufgaben')} sub={t('Deine Aufgaben, Termine und To-dos an einem Ort.')} subTestid="tasks-sub" />

        {#if failed && !loaded}
          <p class="py-10 text-center text-fg2">{t('Aufgaben konnten nicht geladen werden.')}</p>
        {:else if !loaded}
          <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
        {:else}
          <StatsBar
            label={t('Deine Zahlen')}
            items={[
              { id: 'today', label: t('Heute fällig'), value: stats.today, icon: 'calendar', tone: 'accent' },
              { id: 'overdue', label: t('Überfällig'), value: stats.overdue, icon: 'alert-circle', tone: 'danger' },
              { id: 'done', label: t('Erledigt'), value: stats.done, icon: 'done', tone: 'ok' },
            ]}
          />

          <WeekStrip days={strip} title={monthTitle} onday={openDay} onweek={() => openCalendar('week')} onmonth={() => openCalendar('month')} />

          {#if nudges.length > 0}
            {@const n = nudges[0]!}
            <Banner
              title={t('{names} stupst dich! 👋', { names: nameList(n.fromIds) })}
              sub={nudges.length > 1 ? `${n.card.title} · ${tn('{n} weiterer Stups', '{n} weitere Stupse', nudges.length - 1)}` : n.card.title}
              onclick={openNudge}
            >
              {#snippet leading()}
                <svg class="text-banner-icon" width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6l3 2M7 2.5l1.5 3M2 12h3.5" />
                  <path d="M12 9h16a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-9l-6 5v-5h-1a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z" />
                  <path d="M15.5 17l3 3 6-6" />
                </svg>
              {/snippet}
              {#snippet trailing()}<Icon name="chevron-right" size={20} stroke={2} />{/snippet}
            </Banner>
          {/if}

          {#if !ui.isChild}
            <div class="flex items-center gap-2">
              <div class="no-scrollbar -ml-3 flex min-w-0 flex-1 gap-2 overflow-x-auto pl-3" role="group" aria-label={t('Personen')} use:scrollStrip={sf.personIds.join() + sf.unassigned}>
                {#if ui.me?.isPerson}
                  <Chip photo active={sf.personIds.includes(ui.me.id)} pressed={sf.personIds.includes(ui.me.id)} onclick={() => setScheduleFilter({ personIds: toggleId(sf.personIds, ui.me!.id) })}>
                    <Avatar person={ui.me} size={32} />{t('Meine')}
                  </Chip>
                {/if}
                <Chip active={!personFilterActive(sf)} pressed={!personFilterActive(sf)} onclick={() => setScheduleFilter({ personIds: [], unassigned: false })}>
                  <Icon name="user" size={20} />{t('Alle')}
                </Chip>
                {#each people as p (p.id)}
                  <Chip active={sf.personIds.includes(p.id)} pressed={sf.personIds.includes(p.id)} onclick={() => setScheduleFilter({ personIds: toggleId(sf.personIds, p.id) })}>
                    <Icon name="user" size={20} />{p.displayName}
                  </Chip>
                {/each}
              </div>
              <Chip square label={t('Filter')} outline={extraFilter} onclick={() => openSheet({ type: 'filter' })}><Icon name="sliders" size={20} /></Chip>
            </div>
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
                        <!-- "Erst vorschlagen": noch hat niemand die Karte, wer zuerst tippt, bekommt sie -->
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

          {#each groups as g (g.key)}
            {@const isOpen = !closed.includes(g.key)}
            <section aria-label={g.title} data-testid="group-{g.key}">
              <SectionHeader
                title={g.title}
                count={g.cards.length}
                tone={g.key === 'overdue' ? 'danger' : undefined}
                icon={GROUP_ICON[g.key].icon}
                iconTone={GROUP_ICON[g.key].tone}
                large
                open={isOpen}
                ontoggle={() => toggleGroup(g.key)}
              />
              {#if isOpen}
                <ul class="mt-2 flex flex-col gap-2">
                  {#each g.cards as c (c.id)}<li><TaskRow card={c} {nowMs} /></li>{/each}
                </ul>
              {/if}
            </section>
          {/each}

          {#if groups.length === 0 && house.length === 0}
            <div class="py-6 text-center" data-testid="tasks-empty">
              <p class="text-[17px] font-semibold">{t('Keine Aufgaben mit Termin')}</p>
              <p class="mt-1 text-[15px] text-fg2">{t('Karten mit Termin erscheinen hier, nach Fälligkeit geordnet.')}</p>
              {#if extraFilter || personFilterActive(sf)}
                <button class="mt-3 min-h-11 rounded-xl border border-line px-4 text-[15px]" onclick={() => setScheduleFilter({ ...DEFAULT_FILTER })}>{t('Zurücksetzen')}</button>
              {/if}
            </div>
          {/if}

          {#if !ui.isChild}
            <!-- Fairness und die Karten der anderen: ohne Rangliste, Prozente und Punkte -->
            <div class="flex flex-col gap-2">
              <ListRow title={t('Fairness diese Woche')} onclick={() => openSheet({ type: 'week' })}>
                {#snippet tile()}<Tile color="teal"><Icon name="user" size={24} /></Tile>{/snippet}
                {#snippet meta()}{t('Wer erledigt wie viel, ohne Rangliste')}{/snippet}
                {#snippet right()}<Icon name="chevron-right" size={18} stroke={2} />{/snippet}
              </ListRow>
              {#if others.length > 0}
                <ListRow title={t('Bei den anderen')} onclick={() => openSheet({ type: 'week' })}>
                  {#snippet meta()}{tn('{n} Karte offen', '{n} Karten offen', othersOpen)}{/snippet}
                  {#snippet right()}
                    <span class="flex -space-x-1.5">
                      {#each others.slice(0, 4) as o (o.personId)}<Avatar person={o.person} size={28} ring={1.5} />{/each}
                    </span>
                  {/snippet}
                </ListRow>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</main>
