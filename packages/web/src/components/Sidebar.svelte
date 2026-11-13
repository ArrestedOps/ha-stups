<script lang="ts">
  import logo from '../assets/stups-icon.png';
  import { agenda } from '../lib/agenda.svelte';
  import { unread } from '../lib/inbox.svelte';
  import { bellText } from '../lib/inbox';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/schedule';
  import { categoryFg } from '../lib/cardMeta';
  import { nudgesToMe, taskStats } from '../lib/tasks';
  import { deviceTz } from '../lib/datetime';
  import { activeScheduleFilter, feat, goTasks, goToDashboard, openSettings, openSheet, selectBoard, selectTab, setScheduleFilter, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import SymbolIcon from './SymbolIcon.svelte';

  /**
   * Seitenleiste auf dem Desktop (ab 1024 px, 264 px breit, fest), wie im Entwurf: oben Logo mit Home Assistant, Glocke und Zahnrad, die Suche,
   * dann „Aufgaben“ (Alle offen, Gestupst, Heute, Überfällig, Diese Woche, Erledigt: sie wählen die Ansicht der Liste), „Boards“, „Mehr“
   * (Kalender, Wächter) und „Personen“ (Meine, Alle, die anderen: sie wählen, wessen Aufgaben die Liste zeigt), unten die angemeldete Person.
   * Die Reiter bleiben als Navigation „Ansicht“ erreichbar; `aria-current` wie die Leiste am Handy.
   */
  type TaskView = typeof ui.taskView;
  const meId = $derived(ui.me?.id ?? null);
  const nowMs = $derived((void ui.rev, Date.now()));
  const stats = $derived.by(() => {
    void ui.rev;
    return taskStats([...agenda.open, ...agenda.recentDone], meId, nowMs, deviceTz());
  });
  const week = $derived(
    meId ? agenda.open.filter((c) => c.assigneeIds.includes(meId) && !!c.dueAt && Date.parse(c.dueAt) >= nowMs && Date.parse(c.dueAt) < nowMs + 7 * 86_400_000).length : 0,
  );
  const openAll = $derived(agenda.open.length + agenda.undated.length);
  const nudged = $derived(nudgesToMe(agenda.open, meId).length);
  const unseen = $derived(unread());
  const sf = $derived(activeScheduleFilter());

  const views = $derived<{ id: TaskView; label: string; icon: string; n: number; hot?: boolean }[]>([
    { id: 'all', label: t('Alle offen'), icon: 'checklist', n: openAll },
    { id: 'nudged', label: t('Gestupst'), icon: 'hand', n: nudged, hot: true },
    { id: 'today', label: t('Heute'), icon: 'calendar', n: stats.today },
    { id: 'overdue', label: t('Überfällig'), icon: 'alert', n: stats.overdue, hot: true },
    { id: 'week', label: t('Diese Woche'), icon: 'calendar', n: week },
    { id: 'done', label: t('Erledigt'), icon: 'done', n: stats.done },
  ]);
  const onTasks = $derived(ui.tab === 'tasks' && !ui.tasksCalendar);
  function pickView(id: TaskView) {
    ui.taskView = id;
    if (!onTasks) goTasks('list');
  }
  const showWatchers = $derived(feat.watchers && !ui.isChild);
  const showBoards = $derived(true);
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== meId));
  const onlyId = $derived(sf.personIds.length === 1 ? sf.personIds[0] : null);
  const pickPerson = (ids: string[]) => {
    setScheduleFilter({ personIds: ids, unassigned: false });
    if (ui.tab !== 'tasks') goTasks('list');
  };

  const role = $derived(ui.isChild ? t('Kind') : ui.isAdmin ? t('Administrator') : t('Mitglied'));
  const dot = (id: string, color: string | null) => categoryFg(boardColorKey(color, ui.boards.findIndex((b) => b.id === id)));

  function openBoard(id: string) {
    selectTab('boards');
    void selectBoard(id);
  }
  function focusSearch() {
    const input = document.getElementById('desktop-search') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
</script>

<aside class="fixed inset-y-0 left-0 z-30 flex w-64 flex-col gap-0 overflow-y-auto border-r border-line bg-bg px-2.5 pt-4 pb-3" data-testid="sidebar">
  <div class="flex h-10 items-center gap-2 px-1.5">
    <img src={logo} alt="" class="block h-7 w-7 rounded-[7px]" width="28" height="28" />
    <span class="text-[20px] font-extrabold tracking-tight" aria-hidden="true">stups<span class="text-brand-dot">.</span></span>
    <span class="sr-only">stups.</span>
    {#if feat.beta}<span class="ml-1 rounded-md bg-brand-dot/20 px-1.5 py-0.5 text-[11px] leading-none font-extrabold tracking-wider text-brand-dot uppercase" data-testid="beta-badge">{t('Beta')}</span>{/if}
    <span class="flex-1"></span>
    {#if feat.haUi}
      <button class="side-icon text-[var(--ha)]" aria-label={t('Zurück zu Home Assistant')} data-testid="home-button" onclick={goToDashboard}><SymbolIcon id="home-assistant" size={20} /></button>
    {/if}
    <button class="side-icon relative" aria-label={unseen > 0 ? tn('Mitteilungen, {n} ungelesen', 'Mitteilungen, {n} ungelesen', unseen) : t('Mitteilungen')} data-testid="bell" onclick={() => openSheet({ type: 'notifications' })}>
      <Icon name="bell" size={20} />
      {#if unseen > 0}<span class="bell-count absolute -top-0.5 -right-0.5" data-testid="bell-dot" aria-hidden="true">{bellText(unseen)}</span>{/if}
    </button>
    <button class="side-icon" aria-label={t('Einstellungen öffnen')} onclick={() => openSettings()}><Icon name="gear" size={20} /></button>
  </div>

  <button class="mt-2 flex h-9 items-center gap-2 rounded-[10px] bg-surface2 px-2.5 text-[14px] text-text-soft" onclick={focusSearch} aria-label={t('Suchen')}>
    <Icon name="search" size={16} stroke={2} /><span class="flex-1 text-left">{t('Suchen')} …</span>
    <kbd class="rounded-md bg-surface px-1.5 py-px font-sans text-[11px] font-semibold" aria-hidden="true">{mac ? '⌘ K' : `${t('Strg')} K`}</kbd>
  </button>

  <nav class="mt-3 flex flex-col gap-px" aria-label={t('Ansicht')}>
    <p class="side-head">{t('Aufgaben')}</p>
    {#each views as v (v.id)}
      <button class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-label={v.id === 'all' ? t('Aufgaben') : undefined} aria-current={onTasks && ui.taskView === v.id ? 'page' : undefined} onclick={() => pickView(v.id)}>
        <Icon name={v.icon} size={18} stroke={1.8} />
        <span class="min-w-0 flex-1 truncate text-left">{v.label}</span>
        {#if v.n > 0}
          <span class="{v.hot ? 'bell-count' : 'text-[13px] text-text-soft tabular-nums'}" data-testid={v.id === 'all' ? 'side-count' : undefined}>{v.n}</span>
        {/if}
      </button>
    {/each}

    <p class="side-head mt-4 flex items-center justify-between" id="side-boards">
      <span>Boards</span>
      <button class="-mr-1 flex h-6 w-6 items-center justify-center rounded-md text-text-soft hover:bg-surface2" aria-label={t('Neues Board')} onclick={() => openSheet({ type: 'newBoard' })}><Icon name="plus" size={14} stroke={2.2} /></button>
    </p>
    {#if showBoards}
      {#each ui.boards as b (b.id)}
        {@const current = ui.tab === 'boards' && b.id === ui.boardId}
        <button class="side-item side-board h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-current={current ? 'true' : undefined} onclick={() => openBoard(b.id)}>
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background={dot(b.id, b.color)} aria-hidden="true"></span>
          <span class="min-w-0 flex-1 truncate text-left">{b.name}</span>
          <span class="shrink-0 text-[13px] text-text-soft tabular-nums" aria-label={t('{n} offen', { n: b.openCards })}>{b.openCards}</span>
        </button>
      {/each}
      {#if !ui.isChild}
        <button class="side-item h-8 gap-2.5 px-2.5 text-[13px] font-medium text-text-soft" onclick={() => openSheet({ type: 'boardSettings' })}><Icon name="gear" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Board-Einstellungen')}</span></button>
        {#if ui.archivedBoards.length > 0}
          <button class="side-item h-8 gap-2.5 px-2.5 text-[13px] font-medium text-text-soft" onclick={() => openSheet({ type: 'archivedBoards' })}><Icon name="archive" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Archivierte Boards')} ({ui.archivedBoards.length})</span></button>
        {/if}
        {#if ui.boards.length > 1}
          <button class="side-item h-8 gap-2.5 px-2.5 text-[13px] font-medium text-text-soft" onclick={() => openSheet({ type: 'boardOrder' })}><Icon name="arrow-up" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Reihenfolge ändern')}</span></button>
        {/if}
      {/if}
    {/if}

    <p class="side-head mt-4">{t('Mehr')}</p>
    <button class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-current={ui.tab === 'tasks' && ui.tasksCalendar ? 'page' : undefined} onclick={() => goTasks('calendar')}>
      <Icon name="calendar" size={18} stroke={1.8} /><span class="min-w-0 flex-1 truncate text-left">{t('Kalender')}</span>
    </button>
    {#if showWatchers}
      <button class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-current={ui.tab === 'watchers' ? 'page' : undefined} onclick={() => selectTab('watchers')}>
        <Icon name="shield" size={18} stroke={1.8} /><span class="min-w-0 flex-1 truncate text-left">{t('Wächter')}</span>
      </button>
    {/if}
    <button class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium {ui.tab === 'boards' ? '' : 'sr-only'}" aria-current={ui.tab === 'boards' ? 'page' : undefined} onclick={() => selectTab('boards')} tabindex={ui.tab === 'boards' ? 0 : -1}>
      <Icon name="layers" size={18} stroke={1.8} /><span class="min-w-0 flex-1 truncate text-left">Boards</span>
    </button>

    {#if !ui.isChild}
      <p class="side-head mt-4">{t('Personen')}</p>
      {#if ui.me?.isPerson}
        <button class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-pressed={onlyId === ui.me.id} onclick={() => pickPerson([ui.me!.id])}>
          <Avatar person={ui.me} size={20} /><span class="min-w-0 flex-1 truncate text-left">{t('Meine')}</span>
        </button>
      {/if}
      <button class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-pressed={sf.personIds.length === 0} onclick={() => pickPerson([])}>
        <Icon name="user" size={18} stroke={1.8} /><span class="min-w-0 flex-1 truncate text-left">{t('Alle')}</span>
      </button>
      {#each people as p (p.id)}
        <button class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-pressed={onlyId === p.id} onclick={() => pickPerson([p.id])}>
          <Avatar person={p} size={20} /><span class="min-w-0 flex-1 truncate text-left">{p.displayName}</span>
        </button>
      {/each}
    {/if}
  </nav>

  <span class="flex-1"></span>
  {#if ui.me}
    <button class="mt-2 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-surface2" data-testid="side-user" aria-label={t('Profil öffnen')} onclick={() => openSettings()}>
      <Avatar person={ui.me} size={28} />
      <span class="min-w-0 truncate text-[13px] text-text-soft"><span class="font-semibold text-fg">{ui.me.displayName}</span> · {role}</span>
    </button>
  {/if}
</aside>
