<script lang="ts">
  import { api, type Today, type TodayCard } from '../lib/api';
  import { rangeTitle, type CalMode } from '../lib/calendar';
  import { deviceTz } from '../lib/datetime';
  import { numberLocale, t, tn } from '../lib/i18n/index.svelte';
  import { DEFAULT_FILTER, dayKeyOf, filterSchedule, personFilterActive, toggleId, type ScheduleCard } from '../lib/schedule';
  import { scrollStrip } from '../lib/scrollStrip';
  import { groupTasks, nudgesToMe, parseTasksView, taskStats, type TasksView } from '../lib/tasks';
  import { ageText, sourceLine, todaySentence } from '../lib/today';
  import { weekStrip } from '../lib/week';
  import { claimCard, completeCard, openCardAnywhere, openSheet, passCard, personById, setScheduleFilter, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import CalendarView from './CalendarView.svelte';
  import Icon from './Icon.svelte';
  import ScheduleFilterBar from './ScheduleFilterBar.svelte';
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

  const DAY = 86_400_000;
  /** so weit schaut die Liste voraus (Karten ohne Termin kommen in der Liste nicht vor, sie stehen in den Boards) */
  const HORIZON_DAYS = 365 * 5;

  // ---------- Ansicht ----------
  const VIEWS = $derived([
    { id: 'list', label: t('Liste') },
    { id: 'day', label: t('Tag') },
    { id: 'week', label: t('Woche') },
    { id: 'month', label: t('Monat') },
  ]);
  const remembered = (() => {
    try {
      return localStorage.getItem('stups.calmode');
    } catch {
      return null;
    }
  })();
  let view = $state<TasksView>(parseTasksView(remembered));
  let day = $state(dayKeyOf(Date.now()));
  let filterOpen = $state(false);

  function setView(v: string) {
    view = v as TasksView;
    try {
      localStorage.setItem('stups.calmode', view);
    } catch {
      /* egal */
    }
  }
  function openDay(key: string) {
    day = key;
    setView('day');
  }

  // ---------- Daten der Liste ----------
  let today = $state<Today | null>(null);
  let open = $state<ScheduleCard[]>([]);
  let recentDone = $state<ScheduleCard[]>([]);
  let failed = $state(false);
  let loaded = $state(false);
  let request = 0;

  // Neu laden, wenn sich etwas geändert hat (ui.rev zählt hoch, auch durch Live-Sync)
  $effect(() => {
    void ui.rev;
    if (view !== 'list') return;
    const mine = ++request;
    const to = new Date(Date.now() + HORIZON_DAYS * DAY).toISOString();
    Promise.all([
      api.today(),
      api.schedule({ to }),
      // zuletzt Erledigtes (für „erledigt heute" und auf Wunsch die Gruppe Erledigt)
      api.schedule({ from: new Date(Date.now() - 14 * DAY).toISOString(), to, done: true }),
    ])
      .then(([td, o, d]) => {
        if (mine !== request) return;
        today = td;
        open = o;
        const weekAgo = Date.now() - 7 * DAY;
        recentDone = d.filter((c) => c.completedAt && Date.parse(c.completedAt) >= weekAgo);
        failed = false;
        loaded = true;
      })
      .catch(() => {
        if (mine === request) failed = true;
      });
  });

  const tz = deviceTz();
  const nowMs = $derived((void ui.rev, Date.now()));
  const meId = $derived(ui.me?.id ?? null);
  /** Ein Kind sieht nur die eigenen Karten; Erwachsene wählen mit den Chips */
  const visible = (list: ScheduleCard[]) => (ui.isChild ? list.filter((c) => !!meId && c.assigneeIds.includes(meId)) : filterSchedule(list, ui.sf));
  const house = $derived<TodayCard[]>(ui.isChild ? [] : (today?.house ?? []));
  const houseIds = $derived(new Set(house.map((c) => c.id)));
  const shownOpen = $derived(visible(open).filter((c) => !houseIds.has(c.id)));
  const groups = $derived(
    groupTasks(ui.sf.showDone ? [...shownOpen, ...visible(recentDone).filter((c) => !houseIds.has(c.id))] : shownOpen, nowMs, tz, { withDone: ui.sf.showDone }),
  );
  const stats = $derived(taskStats([...open, ...recentDone], meId, nowMs, tz));
  const strip = $derived(weekStrip(visible(open), nowMs, tz));
  const nudges = $derived(ui.isChild ? [] : nudgesToMe(open, meId));
  const others = $derived(
    (today?.others ?? []).map((o) => ({ ...o, person: personById(o.personId) })).filter((o): o is typeof o & { person: NonNullable<typeof o.person> } => o.person !== undefined),
  );
  const othersOpen = $derived(others.reduce((sum, o) => sum + o.open, 0));
  const monthTitle = $derived(new Date(nowMs).toLocaleDateString(numberLocale(), { month: 'long', year: 'numeric', timeZone: tz }));

  const names = (ids: string[]) => ids.map((id) => personById(id)?.displayName ?? t('Jemand')).join(', ');

  // ---------- Chips: Meine, Alle, Personen ----------
  const sf = $derived(ui.sf);
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== meId));
  const extraFilter = $derived(sf.boardIds.length > 0 || sf.showDone);
  let closed = $state<string[]>([]);
  const toggleGroup = (key: string) => (closed = toggleId(closed, key));

  const grid = $derived<CalMode | null>(view === 'list' ? null : view);
  const done = (c: TodayCard) => void completeCard(c);
  const openHouse = (c: TodayCard) => void openCardAnywhere(c);
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col px-3 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0">
    <TopBar />
    <h1 class="mt-1 text-[30px] leading-tight font-extrabold tracking-tight">{t('Aufgaben')}</h1>
    <p class="mt-1 mb-3 text-[14px] text-fg2" data-testid="today-sentence">{view === 'list' ? (today ? todaySentence(today) : ' ') : rangeTitle(grid ?? 'week', day)}</p>
    <Segmented items={VIEWS} value={view} label={t('Ansicht')} small onchange={setView} />

    {#if !ui.isChild}
      <div class="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Personen')} use:scrollStrip={sf.personIds.join() + sf.unassigned}>
        {#if ui.me?.isPerson}
          <Chip active={sf.personIds.includes(ui.me.id)} pressed={sf.personIds.includes(ui.me.id)} onclick={() => setScheduleFilter({ personIds: toggleId(sf.personIds, ui.me!.id) })}>
            <Avatar person={ui.me} size={24} />{t('Meine')}
          </Chip>
        {/if}
        <Chip active={!personFilterActive(sf)} pressed={!personFilterActive(sf)} onclick={() => setScheduleFilter({ personIds: [], unassigned: false })}>{t('Alle')}</Chip>
        {#each people as p (p.id)}
          <Chip active={sf.personIds.includes(p.id)} pressed={sf.personIds.includes(p.id)} onclick={() => setScheduleFilter({ personIds: toggleId(sf.personIds, p.id) })}>
            <Avatar person={p} size={24} />{p.displayName}
          </Chip>
        {/each}
        <Chip active={sf.unassigned} pressed={sf.unassigned} onclick={() => setScheduleFilter({ unassigned: !sf.unassigned })}>{t('Niemand')}</Chip>
        <Chip active={filterOpen} outline={extraFilter && !filterOpen} pressed={filterOpen} label={t('Filter')} onclick={() => (filterOpen = !filterOpen)}>
          <Icon name="settings" size={18} />{#if extraFilter}<span class="h-2 w-2 rounded-full bg-accent"></span>{/if}
        </Chip>
      </div>
    {/if}
    {#if filterOpen && view === 'list'}<div class="mt-2"><ScheduleFilterBar cards={[...open, ...recentDone]} people={false} /></div>{/if}
  </header>

  {#if grid}
    <CalendarView mode={grid} bind:day {filterOpen} onopenday={openDay} />
  {:else}
    <div class="-mr-3 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-3 pb-fab" data-testid="tasks">
      {#if failed && !loaded}
        <p class="py-10 text-center text-fg2">{t('Aufgaben konnten nicht geladen werden.')}</p>
      {:else if !loaded}
        <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
      {:else}
        <div class="flex flex-col gap-3.5">
          {#if house.length > 0}
            <section aria-label={t('Vom Haus')} data-testid="today-house">
              <SectionHeader title={t('Vom Haus')} icon="eye" tone="house" count={house.length} />
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

          <StatsBar
            label={t('Deine Zahlen')}
            items={[
              { id: 'today', label: t('Heute fällig'), value: stats.today, icon: 'clock', tone: 'accent' },
              { id: 'overdue', label: t('Überfällig'), value: stats.overdue, icon: 'flag', tone: 'danger' },
              { id: 'done', label: t('Erledigt'), value: stats.done, icon: 'check', tone: 'ok' },
            ]}
          />

          <WeekStrip days={strip} title={monthTitle} onday={openDay} onweek={() => setView('week')} onmonth={() => setView('month')} />

          {#each nudges.slice(0, 1) as n (n.card.id)}
            <Banner title={t('{names} stupst dich! 👋', { names: names(n.fromIds) })} sub={n.card.title} onclick={() => void openCardAnywhere(n.card)}>
              {#snippet leading()}<Icon name="hand" size={24} />{/snippet}
              {#snippet trailing()}<Icon name="chevron-right" size={18} />{/snippet}
            </Banner>
          {/each}

          {#each groups as g (g.key)}
            {@const isOpen = !closed.includes(g.key)}
            <section aria-label={g.title} data-testid="group-{g.key}">
              <SectionHeader title={g.title} count={g.cards.length} tone={g.key === 'overdue' ? 'danger' : undefined} icon={g.key === 'overdue' ? 'flag' : g.key === 'done' ? 'check' : 'calendar'} large open={isOpen} ontoggle={() => toggleGroup(g.key)} />
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
                {#snippet tile()}<Tile color="teal"><Icon name="user" size={20} /></Tile>{/snippet}
                {#snippet meta()}{t('Wer erledigt wie viel, ohne Rangliste')}{/snippet}
                {#snippet right()}<Icon name="chevron-right" size={18} />{/snippet}
              </ListRow>
              {#if others.length > 0}
                <ListRow title={t('Bei den anderen')} onclick={() => openSheet({ type: 'week' })}>
                  {#snippet meta()}{tn('{n} Karte offen', '{n} Karten offen', othersOpen)}{/snippet}
                  {#snippet right()}
                    <span class="flex -space-x-1.5">
                      {#each others.slice(0, 4) as o (o.personId)}<Avatar person={o.person} size={28} />{/each}
                    </span>
                  {/snippet}
                </ListRow>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</main>
