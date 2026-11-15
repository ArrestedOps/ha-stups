<script lang="ts">
  import logo from '../assets/stups-icon.png';
  import { agenda } from '../lib/agenda.svelte';
  import { unread } from '../lib/inbox.svelte';
  import { bellText } from '../lib/inbox';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/schedule';
  import { categoryFg } from '../lib/cardMeta';
  import { nudgesToMe } from '../lib/tasks';
  import { feat, goTasks, goToDashboard, openSettings, openSheet, selectBoard, selectTab, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import { symbolById } from '../lib/symbols/library';

  /**
   * Seitenleiste auf dem Desktop (ab 1024 px, 244 px breit, fest; eingeklappt 68 px). Sie sagt nur, wohin man gehen kann: oben Logo mit Knopf zum
   * Einklappen und die Suche (Befehlspalette), dann die vier Ziele Aufgaben, Boards, Kalender und Wächter, darunter die Boards, unten die
   * angemeldete Person mit Home Assistant, Glocke und Zahnrad. Was eine Seite betrifft (Ansichten, Person, Hauptaktion), steht in der Seite selbst,
   * wie am Handy. Zahlen nur, wo etwas zu tun ist: Gestupstes an Aufgaben, Probleme an Wächter. Die Ziele bleiben als Navigation „Ansicht“
   * erreichbar; `aria-current` wie die Leiste am Handy.
   */
  const meId = $derived(ui.me?.id ?? null);
  const nudged = $derived((void ui.rev, nudgesToMe(agenda.open, meId).length));
  const unseen = $derived(unread());
  const problems = $derived(ui.watcherNav?.counts.problem ?? 0);
  const onTasks = $derived(ui.tab === 'tasks' && !ui.tasksCalendar);
  const onCalendar = $derived(ui.tab === 'tasks' && ui.tasksCalendar);
  const showWatchers = $derived(feat.watchers && !ui.isChild);
  const slim = $derived(ui.sideSlim);
  const role = $derived(ui.isChild ? t('Kind') : ui.isAdmin ? t('Administrator') : t('Mitglied'));
  const dot = (id: string, color: string | null) => categoryFg(boardColorKey(color, ui.boards.findIndex((b) => b.id === id)));
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  function toggleSlim() {
    ui.sideSlim = !ui.sideSlim;
    try {
      localStorage.setItem('stups.sideslim', ui.sideSlim ? '1' : '0');
    } catch {
      /* egal */
    }
  }
  function openBoard(id: string) {
    selectTab('boards');
    void selectBoard(id);
  }
  /** Menü „…“ am Abschnitt Boards: Einstellungen, Archiv, Reihenfolge */
  let boardMenu = $state(false);
  const pickMenu = (run: () => void) => {
    boardMenu = false;
    run();
  };
</script>

{#snippet bellButton()}
  <button class="side-icon relative" aria-label={unseen > 0 ? tn('Mitteilungen, {n} ungelesen', 'Mitteilungen, {n} ungelesen', unseen) : t('Mitteilungen')} data-testid="bell" onclick={() => openSheet({ type: 'notifications' })}>
    <Icon name="bell" size={20} />
    {#if unseen > 0}<span class="bell-count absolute -top-0.5 -right-0.5" data-testid="bell-dot" aria-hidden="true">{bellText(unseen)}</span>{/if}
  </button>
{/snippet}

{#snippet destination(id: string, label: string, icon: string, current: boolean, run: () => void, badge: number, hot: boolean, labelOnly?: string)}
  <button class="nav-item {slim ? 'slim' : ''}" aria-current={current ? 'page' : undefined} aria-label={slim ? label : labelOnly} title={slim ? label : undefined} data-testid="nav-{id}" onclick={run}>
    <span class="nav-ico relative inline-flex"><Icon name={icon} size={19} stroke={1.8} />{#if slim && badge > 0}<span class="absolute -top-1 -right-1.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold {hot ? 'bg-danger text-on-danger' : 'bg-accent text-on-accent'}" aria-hidden="true">{badge}</span>{/if}</span>
    {#if !slim}
      <span class="min-w-0 flex-1 truncate text-left">{label}</span>
      {#if badge > 0}<span class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-bold {hot ? 'bg-danger text-on-danger' : 'bg-accent text-on-accent'}" data-testid={id === 'tasks' ? 'side-count' : undefined}>{badge}</span>{/if}
    {/if}
  </button>
{/snippet}

<aside class="fixed inset-y-0 left-0 z-30 flex flex-col gap-0.5 overflow-x-hidden overflow-y-auto bg-side pt-3.5 pb-2.5 {slim ? 'w-[68px] items-center' : 'w-[244px] px-2.5'}" data-testid="sidebar">
  {#if slim}
    <img src={logo} alt="" class="mb-1.5 block h-7 w-7 shrink-0 rounded-[8px]" width="28" height="28" />
    <button class="side-icon mb-1" aria-label={t('Seitenleiste ausklappen')} data-testid="side-toggle" onclick={toggleSlim}><Icon name="sidebar" size={19} /></button>
    <button class="nav-item slim" aria-label={t('Suchen oder Befehl')} title={t('Suchen oder Befehl')} onclick={() => (ui.palette = true)}><span class="nav-ico inline-flex"><Icon name="search" size={19} stroke={1.9} /></span></button>
  {:else}
    <div class="mb-2 flex h-10 items-center gap-2 px-1.5">
      <img src={logo} alt="" class="block h-7 w-7 shrink-0 rounded-[8px]" width="28" height="28" />
      <span class="flex shrink-0 flex-col items-start leading-none">
        <span class="text-[20px] font-extrabold tracking-tight" aria-hidden="true">stups<span class="text-brand-dot">.</span></span>
        {#if feat.beta}<span class="mt-px text-[9px] leading-none font-extrabold tracking-[0.14em] text-brand-dot uppercase" data-testid="beta-badge">{t('Beta')}</span>{/if}
      </span>
      <span class="sr-only">stups.</span>
      <span class="flex-1"></span>
      <button class="side-icon" aria-label={t('Seitenleiste einklappen')} data-testid="side-toggle" onclick={toggleSlim}><Icon name="sidebar" size={19} /></button>
    </div>
    <button class="nav-item mb-1.5" onclick={() => (ui.palette = true)} aria-label={t('Suchen oder Befehl')}>
      <span class="nav-ico inline-flex"><Icon name="search" size={19} stroke={1.9} /></span><span class="min-w-0 flex-1 truncate text-left">{t('Suchen')}</span>
      <kbd class="font-sans text-[11px] font-semibold text-hint" aria-hidden="true">{mac ? '⌘ K' : `${t('Strg')} K`}</kbd>
    </button>
  {/if}

  <nav class="contents" aria-label={t('Ansicht')}>
    {@render destination('tasks', t('Aufgaben'), 'checklist', onTasks, () => goTasks('list'), nudged, false)}
    {@render destination('boards', 'Boards', 'kanban', ui.tab === 'boards', () => selectTab('boards'), 0, false)}
    {@render destination('calendar', t('Kalender'), 'calendar', onCalendar, () => goTasks('calendar'), 0, false)}
    {#if showWatchers}{@render destination('watchers', t('Wächter'), 'eye', ui.tab === 'watchers', () => selectTab('watchers'), problems, true)}{/if}
  </nav>

  {#if !slim}
    <div class="mt-3.5 flex items-center justify-between px-2.5 pb-1">
      <span class="text-[12.5px] font-semibold text-hint" id="side-boards">Boards</span>
      <span class="relative flex items-center gap-0.5">
        <button class="-my-1 flex h-6 w-6 items-center justify-center rounded-md text-hint hover:bg-surface2" aria-label={t('Neues Board')} onclick={() => openSheet({ type: 'newBoard' })}><Icon name="plus" size={14} stroke={2.4} /></button>
        {#if !ui.isChild}
          <button class="-my-1 -mr-1 flex h-6 w-6 items-center justify-center rounded-md text-hint hover:bg-surface2" aria-label={t('Mehr zu Boards')} aria-haspopup="menu" aria-expanded={boardMenu} data-testid="board-more" onclick={() => (boardMenu = !boardMenu)}><Icon name="more" size={15} stroke={2.4} /></button>
          {#if boardMenu}
            <button class="fixed inset-0 z-40 cursor-default" aria-label={t('Schließen')} tabindex="-1" onclick={() => (boardMenu = false)}></button>
            <div class="absolute top-7 right-0 z-50 w-[230px] overflow-hidden rounded-[14px] bg-surface py-1 shadow-[0_10px_30px_rgba(0,0,0,0.22)]" role="menu" aria-label="Boards">
              <button class="flex h-10 w-full items-center gap-2.5 px-3.5 text-left text-[14px]" role="menuitem" onclick={() => pickMenu(() => openSheet({ type: 'boardSettings' }))}><Icon name="gear" size={16} stroke={2} />{t('Board-Einstellungen')}</button>
              {#if ui.archivedBoards.length > 0}
                <button class="flex h-10 w-full items-center gap-2.5 px-3.5 text-left text-[14px]" role="menuitem" onclick={() => pickMenu(() => openSheet({ type: 'archivedBoards' }))}><Icon name="archive" size={16} stroke={2} />{t('Archivierte Boards')} ({ui.archivedBoards.length})</button>
              {/if}
              {#if ui.boards.length > 1}
                <button class="flex h-10 w-full items-center gap-2.5 px-3.5 text-left text-[14px]" role="menuitem" onclick={() => pickMenu(() => openSheet({ type: 'boardOrder' }))}><Icon name="arrow-up" size={16} stroke={2} />{t('Reihenfolge ändern')}</button>
              {/if}
            </div>
          {/if}
        {/if}
      </span>
    </div>
  {:else}
    <span class="my-1.5 h-px w-6 bg-line" aria-hidden="true"></span>
  {/if}

  <nav class="contents" aria-labelledby={slim ? undefined : 'side-boards'} aria-label={slim ? 'Boards' : undefined}>
    {#each ui.boards as b (b.id)}
      {@const current = ui.tab === 'boards' && b.id === ui.boardId}
      <button class="nav-item {slim ? 'slim' : '!h-8 !pl-3 !text-[14px]'}" aria-current={current ? 'true' : undefined} aria-label={slim ? b.name : undefined} title={slim ? b.name : undefined} onclick={() => openBoard(b.id)}>
        <span class="flex h-[18px] w-[18px] shrink-0 items-center justify-center" style:color={dot(b.id, b.color)} aria-hidden="true">
          {#if symbolById(b.icon)}<SymbolIcon id={b.icon} size={slim ? 19 : 16} />{:else}<span class="h-2.5 w-2.5 rounded-full bg-current"></span>{/if}
        </span>
        {#if !slim}
          <span class="min-w-0 flex-1 truncate text-left">{b.name}</span>
          <span class="shrink-0 text-[13px] font-normal text-hint tabular-nums" aria-label={t('{n} offen', { n: b.openCards })}>{b.openCards}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <span class="flex-1"></span>
  {#if slim}
    <div class="flex flex-col items-center gap-1">
      {#if feat.haUi}<button class="side-icon text-[var(--ha)]" aria-label={t('Zurück zu Home Assistant')} data-testid="home-button" onclick={goToDashboard}><SymbolIcon id="home-assistant" size={20} /></button>{/if}
      {@render bellButton()}
      <button class="side-icon" aria-label={t('Einstellungen öffnen')} onclick={() => openSettings()}><Icon name="gear" size={20} /></button>
      {#if ui.me}<button class="mt-1 rounded-full" data-testid="side-user" aria-label={t('Profil öffnen')} onclick={() => openSettings()}><Avatar person={ui.me} size={30} /></button>{/if}
    </div>
  {:else}
    <div class="flex items-center gap-0.5 pt-1.5">
      {#if ui.me}
        <button class="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-1.5 py-1 text-left hover:bg-surface2" data-testid="side-user" aria-label={t('Profil öffnen')} onclick={() => openSettings()}>
          <Avatar person={ui.me} size={30} />
          <span class="min-w-0 truncate text-[13px] leading-tight text-hint"><span class="block truncate font-semibold text-fg">{ui.me.displayName}</span>{role}</span>
        </button>
      {:else}
        <span class="flex-1"></span>
      {/if}
      {#if feat.haUi}
        <button class="side-icon text-[var(--ha)]" aria-label={t('Zurück zu Home Assistant')} data-testid="home-button" onclick={goToDashboard}><SymbolIcon id="home-assistant" size={20} /></button>
      {/if}
      {@render bellButton()}
      <button class="side-icon" aria-label={t('Einstellungen öffnen')} onclick={() => openSettings()}><Icon name="gear" size={20} /></button>
    </div>
  {/if}
</aside>
