<script lang="ts">
  import { columnForNew } from '../lib/calendar';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/colors';
  import { can, feat, openNewWatcher, openSheet, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import ScopeMenu from './ScopeMenu.svelte';

  /**
   * Kopfzeile des Desktops (ab 1024 px) über allen Reitern: links Titel und Untertitel, rechts die Suche (Strg/Cmd + K), „Neue Aufgabe“
   * (ersetzt den „+“-Knopf des Handys), Home Assistant (nur im Add-on) und die Glocke. Logo, Zahnrad und Profil stehen in der Seitenleiste.
   * Die Suche filtert die schon geladenen Aufgaben im Gerät: in Boards wie das Feld im Blatt „Filter“ (`filter.search`), in Aufgaben und
   * Wächtern über `ui.query`.
   */
  const view = $derived(ui.view);
  const board = $derived(ui.boards.find((b) => b.id === ui.boardId));
  const page = $derived(
    ui.tab === 'boards'
      ? { title: board?.name ?? 'Boards', sub: t('Organisiere deine Aufgaben in Kanban-Boards.'), titleTestid: 'board-name' }
      : ui.tab === 'watchers'
        ? { title: t('Wächter'), sub: t('Automatische Aufgaben aus Home Assistant.') }
        : { title: ui.tasksCalendar ? t('Kalender') : t('Aufgaben'), sub: t('Deine Aufgaben, Termine und To-dos an einem Ort.'), subTestid: 'tasks-sub' },
  );

  const newColumn = $derived(columnForNew(view?.columns ?? [], false));
  const canCreate = $derived(!!view && !!newColumn && !ui.isChild);
  const boardKey = $derived(boardColorKey(ui.boards, ui.boardId ?? ''));
  const onList = $derived(ui.tab === 'tasks' && !ui.tasksCalendar);
  /** Das Personen-Menü gilt auf Aufgaben, Kalender und Wächter (nicht für ein Kind, das nur das Eigene sieht, und nicht auf Boards) */
  const showScope = $derived(!ui.isChild && ui.tab !== 'boards');
  const onWatchers = $derived(ui.tab === 'watchers');
  const canNewWatcher = $derived(onWatchers && feat.watchers && can('watchers') && !ui.isChild);

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

<header class="flex shrink-0 items-start gap-3 pt-6 pb-4" data-testid="desktop-header">
  <div class="min-w-0 flex-1">
    <div class="flex min-w-0 items-baseline gap-3">
      {#if ui.tab === 'boards' && board}<i class="block h-3 w-3 shrink-0 self-center rounded-full" style:background="var(--c-{boardKey}-fg)" aria-hidden="true"></i>{/if}
      <h1 class="truncate text-[30px] leading-[1.1] font-extrabold tracking-tight" data-testid={page.titleTestid}>{page.title}</h1>
      {#if ui.tab === 'boards' && board}<span class="shrink-0 text-[14px] font-medium text-text-soft">{t('{n} offen', { n: board.openCards })}</span>{/if}
      {#if onList}<span class="shrink-0 text-[14px] font-medium text-text-soft">{tn('{n} Aufgabe', '{n} Aufgaben', ui.taskCount)}</span>{/if}
    </div>
    <p class="mt-1 truncate text-[14px] text-fg2" data-testid={page.subTestid}>{page.sub}</p>
  </div>

  {#if !ui.online}
    <span class="mt-2 flex shrink-0 items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-[13px] text-fg2" role="status">
      <Icon name="wifi-off" size={14} />Offline
    </span>
  {/if}

  <label class="focus-ring-in flex h-9 w-[190px] shrink-0 items-center gap-2 rounded-full bg-surface px-3 text-text-soft shadow-[0_0_0_0.5px_var(--sep)] hover:bg-surface2 xl:w-[260px]">
    <Icon name="search" size={17} stroke={1.9} />
    <input
      id="desktop-search"
      type="search"
      class="desktop-search min-w-0 flex-1 bg-transparent text-[14px] font-medium text-fg outline-none placeholder:text-dim"
      placeholder={ui.tab === 'boards' ? t('In diesem Board filtern') : ui.tab === 'watchers' ? t('Wächter suchen') : onList ? t('Aufgaben filtern') : `${t('Suchen')} …`}
      aria-label={t('Suchen')}
      autocomplete="off"
      {value}
      oninput={(e) => setValue(e.currentTarget.value)}
      onkeydown={keydown}
    />
    {#if value}
      <button type="button" class="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg2 hover:bg-surface2 hover:text-fg" aria-label={t('Suche leeren')} onclick={() => setValue('')}>
        <Icon name="x" size={16} stroke={2} />
      </button>
    {:else}
      <kbd class="hidden shrink-0 xl:inline font-sans text-[11px] font-semibold text-hint" aria-hidden="true">{mac ? '⌘ K' : `${t('Strg')} K`}</kbd>
    {/if}
  </label>

  {#if showScope}<ScopeMenu noun={onWatchers ? 'watchers' : 'tasks'} />{/if}

  {#if canNewWatcher}
    <button class="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-bold text-on-accent hover:brightness-110" data-testid="new-watcher" onclick={() => openNewWatcher()}>
      <Icon name="plus" size={16} stroke={2.4} /><span class="max-xl:sr-only">{t('Neuer Wächter')}</span>
    </button>
  {:else if canCreate && !onWatchers}
    <button class="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-bold text-on-accent hover:brightness-110" data-testid="new-task" onclick={() => openSheet({ type: 'new', columnId: newColumn! })}>
      <Icon name="plus" size={16} stroke={2.4} /><span class="max-xl:sr-only">{t('Neue Aufgabe')}</span>
    </button>
  {/if}
</header>
