<script lang="ts">
  import logo from '../assets/stups-icon.png';
  import { agenda } from '../lib/agenda.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/schedule';
  import { categoryFg } from '../lib/cardMeta';
  import { taskStats } from '../lib/tasks';
  import { deviceTz } from '../lib/datetime';
  import { visibleTabs, type Tab } from '../lib/tabs';
  import { feat, openSettings, openSheet, selectBoard, selectTab, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  /**
   * Seitenleiste auf dem Desktop (ab 1024 px, 256 px breit, fest): ersetzt die Leiste unten und das Blatt „Board wechseln“.
   * Oben Logo und Wortmarke, dann die Reiter (Aufgaben mit Zähler, Boards, Wächter), der Abschnitt BOARDS mit allen Boards
   * (Farbpunkt, Name, offene Karten) und „Neues Board“, unten die Karte der angemeldeten Person mit dem Zahnrad (Einstellungen).
   * Dieselbe Navigation (`Ansicht`) und dasselbe `aria-current` wie die Leiste unten: gleiche Bedienung, gleiche Tests.
   */
  const all: Record<Tab, { label: string; icon: string }> = $derived({
    tasks: { label: t('Aufgaben'), icon: 'checklist' },
    boards: { label: 'Boards', icon: 'layers' },
    watchers: { label: t('Wächter'), icon: 'shield' },
  });
  const tabs = $derived(visibleTabs({ watchers: feat.watchers, isChild: ui.isChild }).map((id) => ({ id, ...all[id] })));

  // Zähler am Reiter Aufgaben: was für mich heute dran oder überfällig ist (dieselben Zahlen wie die Zahlenleiste)
  const due = $derived.by(() => {
    void ui.rev;
    const s = taskStats([...agenda.open, ...agenda.recentDone], ui.me?.id ?? null, Date.now(), deviceTz());
    return s.today + s.overdue;
  });

  const role = $derived(ui.isChild ? t('Kind') : ui.isAdmin ? t('Administrator') : t('Mitglied'));
  const dot = (id: string, color: string | null) => categoryFg(boardColorKey(color, ui.boards.findIndex((b) => b.id === id)));

  function openBoard(id: string) {
    selectTab('boards');
    void selectBoard(id);
  }
</script>

<aside class="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-line bg-bg px-3 pt-5 pb-4" data-testid="sidebar">
  <div class="flex h-10 items-center gap-2.5 px-2">
    <img src={logo} alt="" class="block h-9 w-9 rounded-[10px]" width="36" height="36" />
    <span class="text-[26px] font-extrabold tracking-tight" aria-hidden="true">stups<span class="text-brand-dot">.</span></span>
    {#if feat.beta}<span class="ml-1.5 rounded-md bg-brand-dot/20 px-1.5 py-0.5 text-[11px] leading-none font-extrabold tracking-wider text-brand-dot uppercase" data-testid="beta-badge">{t('Beta')}</span>{/if}
  </div>

  <nav class="mt-6 flex flex-col gap-1" aria-label={t('Ansicht')}>
    {#each tabs as tb (tb.id)}
      <button class="side-item h-[46px] gap-3 px-3.5 text-[15px] font-semibold" aria-current={ui.tab === tb.id ? 'page' : undefined} onclick={() => selectTab(tb.id)}>
        <Icon name={tb.icon} size={22} stroke={1.8} />
        <span class="min-w-0 flex-1 truncate text-left">{tb.label}</span>
        {#if tb.id === 'tasks' && due > 0}
          <span class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent-grad px-1.5 text-[12px] font-extrabold !shadow-none" aria-hidden="true" data-testid="side-count">{due}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <p class="mt-7 mb-1.5 px-3.5 text-[12px] font-bold tracking-[0.12em] text-fg2 uppercase" id="side-boards">Boards</p>
  <nav class="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-2" aria-labelledby="side-boards">
    {#each ui.boards as b (b.id)}
      {@const current = ui.tab === 'boards' && b.id === ui.boardId}
      <button class="side-board h-10 gap-3 px-3.5 text-[14px] font-semibold" aria-current={current ? 'true' : undefined} onclick={() => openBoard(b.id)}>
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background={dot(b.id, b.color)} aria-hidden="true"></span>
        <span class="min-w-0 flex-1 truncate text-left">{b.name}</span>
        <span class="shrink-0 text-[13px] font-medium text-fg2" aria-label={t('{n} offen', { n: b.openCards })}>{b.openCards}</span>
      </button>
    {/each}
    <!-- auch ein Kind: es legt dort Boards „nur ich" an -->
    <button class="side-board side-board-add h-10 gap-3 px-3.5 text-[14px] font-medium text-fg2" onclick={() => openSheet({ type: 'newBoard' })}>
      <Icon name="plus" size={16} stroke={2} />{t('Neues Board')}
    </button>
    {#if !ui.isChild}
      <button class="side-board side-board-add h-10 gap-3 px-3.5 text-[14px] font-medium text-fg2" onclick={() => openSheet({ type: 'boardSettings' })}>
        <Icon name="gear" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Board-Einstellungen')}</span>
      </button>
      {#if ui.archivedBoards.length > 0}
        <button class="side-board h-10 gap-3 px-3.5 text-[14px] font-medium text-fg2" onclick={() => openSheet({ type: 'archivedBoards' })}>
          <Icon name="archive" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Archivierte Boards')} ({ui.archivedBoards.length})</span>
        </button>
      {/if}
      {#if ui.boards.length > 1}
        <button class="side-board h-10 gap-3 px-3.5 text-[14px] font-medium text-fg2" onclick={() => openSheet({ type: 'boardOrder' })}>
          <Icon name="arrow-up" size={16} stroke={2} /><span class="min-w-0 truncate">{t('Reihenfolge ändern')}</span>
        </button>
      {/if}
    {/if}
  </nav>

  {#if ui.me}
    <div class="mt-2 flex items-center gap-2.5 rounded-row border border-line bg-surface py-2 pr-1.5 pl-2.5" data-testid="side-user">
      <button class="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label={t('Profil öffnen')} onclick={() => openSettings()}>
        <Avatar person={ui.me} size={38} />
        <span class="min-w-0">
          <span class="block truncate text-[14px] leading-tight font-bold">{ui.me.displayName}</span>
          <span class="block truncate text-[12px] leading-tight text-fg2">{role}</span>
        </span>
      </button>
      <button class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-soft hover:bg-surface2" aria-label={t('Einstellungen öffnen')} onclick={() => openSettings()}>
        <Icon name="gear" size={22} stroke={1.7} />
      </button>
    </div>
  {/if}
</aside>
