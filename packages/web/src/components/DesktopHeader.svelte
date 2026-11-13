<script lang="ts">
  import { columnForNew } from '../lib/calendar';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/colors';
  import { openSheet, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  /**
   * Kopfzeile des Desktops (ab 1024 px) über allen Reitern: links Titel und Untertitel, rechts die Suche (Strg/Cmd + K), „Neue Aufgabe“
   * (ersetzt den „+“-Knopf des Handys), Home Assistant (nur im Add-on) und die Glocke. Logo, Zahnrad und Profil stehen in der Seitenleiste.
   * Die Suche filtert die schon geladenen Aufgaben im Gerät: in Boards wie das Feld im Blatt „Filter“ (`filter.search`), in Aufgaben und
   * Wächtern über `ui.query`.
   */
  const view = $derived(ui.view);
  const board = $derived(ui.boards.find((b) => b.id === ui.boardId));
  const VIEW_LABEL = $derived({ all: t('Alle offen'), nudged: t('Gestupst'), today: t('Heute'), overdue: t('Überfällig'), week: t('Diese Woche'), done: t('Erledigt') });
  const page = $derived(
    ui.tab === 'boards'
      ? { title: board?.name ?? 'Boards', sub: t('Organisiere deine Aufgaben in Kanban-Boards.'), titleTestid: 'board-name' }
      : ui.tab === 'watchers'
        ? { title: t('Wächter'), sub: t('Automatische Aufgaben aus Home Assistant.') }
        : { title: ui.tasksCalendar ? t('Kalender') : VIEW_LABEL[ui.taskView], sub: t('Deine Aufgaben, Termine und To-dos an einem Ort.'), subTestid: 'tasks-sub' },
  );

  const newColumn = $derived(columnForNew(view?.columns ?? [], false));
  const canCreate = $derived(!!view && !!newColumn && !ui.isChild);
  const boardKey = $derived(boardColorKey(ui.boards, ui.boardId ?? ''));
  const onList = $derived(ui.tab === 'tasks' && !ui.tasksCalendar);

  const value = $derived(ui.tab === 'boards' ? ui.filter.search : ui.query);
  function setValue(v: string) {
    if (ui.tab === 'boards') ui.filter.search = v;
    else ui.query = v;
  }
  // Mac: ⌘, sonst Strg (die Taste selbst prüft App.svelte)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  function keydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Erst leeren, dann den Fokus lösen; ein Escape, das etwas getan hat, schließt nicht zusätzlich die Detailspalte
    if (value) setValue('');
    else (e.currentTarget as HTMLElement).blur();
    e.preventDefault();
  }
</script>

<header class="flex shrink-0 items-start gap-4 pt-6 pb-5" data-testid="desktop-header">
  <div class="min-w-0 flex-1">
    <h1 class="flex items-baseline gap-3 truncate text-[30px] leading-[1.1] font-extrabold tracking-tight" data-testid={page.titleTestid}>{#if ui.tab === 'boards' && board}<i class="block h-3 w-3 shrink-0 rounded-full" style:background="var(--c-{boardKey}-fg)" aria-hidden="true"></i>{/if}{page.title}{#if ui.tab === 'boards' && board}<span class="text-[14px] font-medium tracking-normal text-text-soft">{t('{n} offen', { n: board.openCards })}</span>{/if}{#if onList}<span class="text-[14px] font-medium tracking-normal text-text-soft">{tn('{n} Aufgabe', '{n} Aufgaben', ui.taskCount)}</span>{/if}</h1>
    <p class="mt-1 truncate text-[14px] text-fg2" data-testid={page.subTestid}>{page.sub}</p>
  </div>

  {#if !ui.online}
    <span class="mt-2 flex shrink-0 items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-[13px] text-fg2" role="status">
      <Icon name="wifi-off" size={14} />Offline
    </span>
  {/if}

  {#if onList}
    <div class="flex h-10 shrink-0 items-center gap-0.5 rounded-[10px] bg-surface2 p-0.5" role="radiogroup" aria-label={t('Gruppieren')}>
      {#each [['due', t('Fälligkeit')], ['board', 'Board']] as [id, label] (id)}
        <button class="h-9 rounded-[8px] px-3 text-[13px] font-semibold {ui.taskGroupBy === id ? 'bg-surface shadow-sm' : 'text-text-soft'}" role="radio" aria-checked={ui.taskGroupBy === id} onclick={() => (ui.taskGroupBy = id as 'due' | 'board')}>{label}</button>
      {/each}
    </div>
  {/if}

  <label class="focus-ring-in flex h-12 w-[230px] shrink-0 items-center gap-2.5 rounded-[14px] border border-line-chip bg-surface px-3.5 text-text-soft hover:border-sep xl:w-[340px]">
    <Icon name="search" size={20} stroke={1.9} />
    <input
      id="desktop-search"
      type="search"
      class="desktop-search min-w-0 flex-1 bg-transparent text-[15px] font-medium text-fg outline-none placeholder:text-dim"
      placeholder={ui.tab === 'boards' ? t('In diesem Board filtern') : ui.tab === 'watchers' ? t('Wächter, Geräte und Räume suchen') : onList ? t('Aufgaben filtern') : `${t('Suchen')} …`}
      aria-label={t('Suchen')}
      autocomplete="off"
      {value}
      oninput={(e) => setValue(e.currentTarget.value)}
      onkeydown={keydown}
    />
    {#if value}
      <button type="button" class="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg2 hover:bg-surface2 hover:text-fg" aria-label={t('Suche leeren')} onclick={() => setValue('')}>
        <Icon name="x" size={16} stroke={2} />
      </button>
    {:else}
      <kbd class="hidden shrink-0 xl:inline rounded-md border border-line-chip bg-bg px-1.5 py-0.5 font-sans text-[12px] font-semibold text-fg2" aria-hidden="true">{mac ? '⌘ K' : `${t('Strg')} K`}</kbd>
    {/if}
  </label>

  {#if canCreate}
    <button class="fab-grad flex h-12 shrink-0 items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold hover:brightness-110 max-xl:w-12 xl:px-5" data-testid="new-task" onclick={() => openSheet({ type: 'new', columnId: newColumn! })}>
      <Icon name="plus" size={20} stroke={2.4} /><span class="max-xl:sr-only">{t('Neue Aufgabe')}</span>
    </button>
  {/if}
</header>
