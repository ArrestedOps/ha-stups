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
  import { categoryKeyOf } from '../lib/watcherList';
  import { activeScheduleFilter, feat, goTasks, goToDashboard, openSettings, openSheet, selectBoard, selectTab, setPersonScope, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import { symbolById } from '../lib/symbols/library';

  /**
   * Seitenleiste auf dem Desktop (ab 1024 px, 264 px breit, fest), wie im Entwurf: oben Logo mit Home Assistant, Glocke und Zahnrad, die Suche,
   * dann „Aufgaben“ (Alle offen, Gestupst, Heute, Überfällig, Diese Woche, Erledigt: sie wählen die Ansicht der Liste), „Boards“, „Mehr“
   * (Kalender), „Wächter“ (Filter und Kategorien der Tabelle) und oben das Feld „Ansicht für“ (Alle, Meine, die anderen: wessen Aufgaben und Wächter alle Seiten zeigen), unten die angemeldete Person.
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
  // Gruppe „Wächter“: Zahlen von der Seite Wächter (nach dem ersten Besuch), bis dahin die aus der Liste der Wächter
  const wFallback = $derived.by(() => {
    const items = ui.watchers?.items ?? [];
    const byKey = new Map<string, { key: string; name: string | null; n: number }>();
    for (const w of items) {
      const key = categoryKeyOf(w.category);
      const g = byKey.get(key) ?? { key, name: w.category?.trim() ? w.category.trim().replace(/\s+/g, ' ') : null, n: 0 };
      g.n += 1;
      byKey.set(key, g);
    }
    const cats = [...byKey.values()].sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
    return { counts: { all: items.length, problem: 0, waiting: 0, running: 0, soon: 0, paused: items.filter((w) => !w.active).length }, cats };
  });
  const wNav = $derived(ui.watcherNav ?? wFallback);
  const watcherCats = $derived(wNav.cats);
  const watcherItems = $derived<{ id: string; label: string; icon: string; n: number; hot?: boolean }[]>([
    { id: 'all', label: t('Alle Wächter'), icon: 'shield', n: wNav.counts.all },
    { id: 'problem', label: t('Mit Problem'), icon: 'alert', n: wNav.counts.problem, hot: true },
    { id: 'waiting', label: t('Wartet auf jemanden'), icon: 'flag', n: wNav.counts.waiting },
    { id: 'running', label: t('Läuft gerade'), icon: 'play', n: wNav.counts.running },
    { id: 'soon', label: t('Kommt bald'), icon: 'calendar', n: wNav.counts.soon },
    { id: 'paused', label: t('Pausiert'), icon: 'pause', n: wNav.counts.paused },
  ]);
  function pickWatchers(id: string) {
    ui.watcherScope = id;
    selectTab('watchers');
  }
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== meId));
  const onlyId = $derived(sf.personIds.length === 1 ? sf.personIds[0] : null);
  const whoText = $derived(
    sf.personIds.length === 0
      ? t('Aufgaben und Wächter aller Personen')
      : onlyId === meId
        ? t('Deine Aufgaben und Wächter')
        : t('Aufgaben und Wächter von {name}', { name: ui.people.find((p) => p.id === onlyId)?.displayName ?? '…' }),
  );

  const role = $derived(ui.isChild ? t('Kind') : ui.isAdmin ? t('Administrator') : t('Mitglied'));
  const dot = (id: string, color: string | null) => categoryFg(boardColorKey(color, ui.boards.findIndex((b) => b.id === id)));

  function openBoard(id: string) {
    selectTab('boards');
    void selectBoard(id);
  }
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
</script>

<aside class="fixed inset-y-0 left-0 z-30 flex w-64 flex-col gap-px overflow-x-hidden overflow-y-auto border-r border-line bg-bg px-2.5 pt-4 pb-3" data-testid="sidebar">
  <div class="flex h-10 items-center gap-1 px-1">
    <img src={logo} alt="" class="mr-1 block h-7 w-7 shrink-0 rounded-[7px]" width="28" height="28" />
    <span class="flex shrink-0 flex-col items-start leading-none">
      <span class="text-[20px] font-extrabold tracking-tight" aria-hidden="true">stups<span class="text-brand-dot">.</span></span>
      {#if feat.beta}<span class="mt-px text-[9px] leading-none font-extrabold tracking-[0.14em] text-brand-dot uppercase" data-testid="beta-badge">{t('Beta')}</span>{/if}
    </span>
    <span class="sr-only">stups.</span>
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

  <button class="mt-2 mb-2 flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-surface2 px-2.5 text-[14px] text-text-soft" onclick={() => (ui.palette = true)} aria-label={t('Suchen oder Befehl')}>
    <Icon name="search" size={16} stroke={2} /><span class="flex-1 text-left">{t('Suchen oder Befehl')}</span>
    <kbd class="rounded-md bg-surface px-1.5 py-px font-sans text-[11px] font-semibold" aria-hidden="true">{mac ? '⌘ K' : `${t('Strg')} K`}</kbd>
  </button>

  {#if !ui.isChild}
    <!-- „Ansicht für“: wessen Aufgaben und Wächter alle Seiten zeigen. Ganz oben, damit man sieht, dass es für alles gilt; der Klartext darunter nennt die Wahl. -->
    <div class="order-5 mx-1.5 mt-1 mb-1.5 rounded-[12px] bg-surface px-2.5 pt-2.5 pb-2" role="group" aria-label={t('Ansicht für')} data-testid="side-who">
      <p class="mb-2 text-[11px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Ansicht für')}</p>
      <div class="flex flex-wrap items-center gap-1.5">
        <button class="flex h-8 min-w-8 items-center justify-center rounded-full bg-surface2 px-2.5 text-[12.5px] font-bold {onlyId === null && sf.personIds.length === 0 ? 'ring-[2.5px] ring-accent' : ''}" aria-pressed={sf.personIds.length === 0} aria-label={t('Alle')} onclick={() => setPersonScope([])}>{t('Alle')}</button>
        {#if ui.me?.isPerson}
          <button class="rounded-full {onlyId === ui.me.id ? 'ring-[2.5px] ring-accent ring-offset-2 ring-offset-surface' : ''}" aria-pressed={onlyId === ui.me.id} aria-label={t('Meine')} title={t('Meine')} onclick={() => setPersonScope([ui.me!.id])}><Avatar person={ui.me} size={32} /></button>
        {/if}
        {#each people as p (p.id)}
          <button class="rounded-full {onlyId === p.id ? 'ring-[2.5px] ring-accent ring-offset-2 ring-offset-surface' : ''}" aria-pressed={onlyId === p.id} aria-label={p.displayName} title={p.displayName} onclick={() => setPersonScope([p.id])}><Avatar person={p} size={32} /></button>
        {/each}
      </div>
      <p class="mt-2 text-[12.5px] text-fg2" data-testid="side-who-text">{whoText}</p>
    </div>
  {/if}

  <!-- Die Navigationen stehen mit display: contents in einer Spalte; style:order stellt die Reihenfolge des Entwurfs her: Aufgaben, Boards, Mehr, Wächter, Personen -->
  <nav class="contents" aria-label={t('Ansicht')}>
    <p class="side-head" style:order="10">{t('Aufgaben')}</p>
    {#each views as v (v.id)}
      <button style:order="10" class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-label={v.id === 'all' ? t('Aufgaben') : undefined} aria-current={onTasks && ui.taskView === v.id ? 'page' : undefined} onclick={() => pickView(v.id)}>
        <Icon name={v.icon} size={18} stroke={1.8} />
        <span class="min-w-0 flex-1 truncate text-left">{v.label}</span>
        {#if v.n > 0}
          <span class="{v.hot ? 'bell-count' : 'text-[13px] text-text-soft tabular-nums'}" data-testid={v.id === 'all' ? 'side-count' : undefined}>{v.n}</span>
        {/if}
      </button>
    {/each}

    <div class="side-head mt-4 flex items-center justify-between" style:order="20">
      <button class="-mx-1 rounded-md px-1 text-left" id="side-boards" aria-current={ui.tab === 'boards' ? 'page' : undefined} onclick={() => selectTab('boards')}>Boards</button>
      <button class="-mr-1 flex h-6 w-6 items-center justify-center rounded-md text-text-soft hover:bg-surface2" aria-label={t('Neues Board')} onclick={() => openSheet({ type: 'newBoard' })}><Icon name="plus" size={14} stroke={2.2} /></button>
    </div>
    <p class="side-head mt-4" style:order="30">{t('Mehr')}</p>
    <button style:order="30" class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-current={ui.tab === 'tasks' && ui.tasksCalendar ? 'page' : undefined} onclick={() => goTasks('calendar')}>
      <Icon name="calendar" size={18} stroke={1.8} /><span class="min-w-0 flex-1 truncate text-left">{t('Kalender')}</span>
    </button>

    {#if showWatchers}
      <!-- Wächter: eigene Gruppe mit den Auswahlen der Tabelle (Zahlen kommen von der Seite Wächter) und den Kategorien -->
      <p class="side-head mt-4" style:order="35">{t('Wächter')}</p>
      {#each watcherItems as it (it.id)}
        <button style:order="35" class="side-item h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-label={it.id === 'all' ? t('Wächter') : undefined} aria-current={ui.tab === 'watchers' && ui.watcherScope === it.id ? 'page' : undefined} onclick={() => pickWatchers(it.id)}>
          <Icon name={it.icon} size={18} stroke={1.8} /><span class="min-w-0 flex-1 truncate text-left">{it.label}</span>
          {#if it.n > 0}<span class="{it.hot ? 'bell-count' : 'text-[13px] text-text-soft tabular-nums'}">{it.n}</span>{/if}
        </button>
      {/each}
      {#each watcherCats as g (g.key)}
        <button style:order="35" class="side-item h-8 gap-2.5 px-2.5 pl-[38px] text-[13.5px] font-medium" aria-current={ui.tab === 'watchers' && ui.watcherScope === `cat:${g.key}` ? 'page' : undefined} onclick={() => pickWatchers(`cat:${g.key}`)}>
          <span class="min-w-0 flex-1 truncate text-left">{g.name ?? t('Ohne Kategorie')}</span>
          <span class="text-[13px] text-text-soft tabular-nums">{g.n}</span>
        </button>
      {/each}
    {/if}

  </nav>

  <nav class="contents" aria-labelledby="side-boards">
    {#if showBoards}
      {#each ui.boards as b (b.id)}
        {@const current = ui.tab === 'boards' && b.id === ui.boardId}
        <button style:order="20" class="side-item side-board h-8 gap-2.5 px-2.5 text-[14px] font-medium" aria-current={current ? 'true' : undefined} onclick={() => openBoard(b.id)}>
          <span class="flex h-5 w-5 shrink-0 items-center justify-center" style:color={dot(b.id, b.color)} aria-hidden="true">
            {#if symbolById(b.icon)}<SymbolIcon id={b.icon} size={18} />{:else}<span class="h-2.5 w-2.5 rounded-full bg-current"></span>{/if}
          </span>
          <span class="min-w-0 flex-1 truncate text-left">{b.name}</span>
          <span class="shrink-0 text-[13px] text-text-soft tabular-nums" aria-label={t('{n} offen', { n: b.openCards })}>{b.openCards}</span>
        </button>
      {/each}
      {#if !ui.isChild}
        <button style:order="20" class="side-item h-8 gap-2.5 px-2.5 text-[13px] font-medium text-text-soft" onclick={() => openSheet({ type: 'boardSettings' })}><Icon name="gear" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Board-Einstellungen')}</span></button>
        {#if ui.archivedBoards.length > 0}
          <button style:order="20" class="side-item h-8 gap-2.5 px-2.5 text-[13px] font-medium text-text-soft" onclick={() => openSheet({ type: 'archivedBoards' })}><Icon name="archive" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Archivierte Boards')} ({ui.archivedBoards.length})</span></button>
        {/if}
        {#if ui.boards.length > 1}
          <button style:order="20" class="side-item h-8 gap-2.5 px-2.5 text-[13px] font-medium text-text-soft" onclick={() => openSheet({ type: 'boardOrder' })}><Icon name="arrow-up" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Reihenfolge ändern')}</span></button>
        {/if}
      {/if}
    {/if}

  </nav>
  <span class="flex-1" style:order="90"></span>
  {#if ui.me}
    <button style:order="95" class="mt-2 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-surface2" data-testid="side-user" aria-label={t('Profil öffnen')} onclick={() => openSettings()}>
      <Avatar person={ui.me} size={28} />
      <span class="min-w-0 truncate text-[13px] text-text-soft"><span class="font-semibold text-fg">{ui.me.displayName}</span> · {role}</span>
    </button>
  {/if}
</aside>
