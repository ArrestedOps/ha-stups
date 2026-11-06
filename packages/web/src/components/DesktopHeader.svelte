<script lang="ts">
  import { unread } from '../lib/inbox.svelte';
  import { columnForNew } from '../lib/calendar';
  import { t } from '../lib/i18n/index.svelte';
  import { feat, goToDashboard, openSheet, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import SymbolIcon from './SymbolIcon.svelte';

  /**
   * Kopfzeile des Desktops (ab 1024 px) über allen Reitern: links Titel und Untertitel, rechts die Suche (Strg/Cmd + K), „Neue Aufgabe“
   * (ersetzt den „+“-Knopf des Handys), Home Assistant (nur im Add-on) und die Glocke. Logo, Zahnrad und Profil stehen in der Seitenleiste.
   * Die Suche filtert die schon geladenen Karten im Gerät: in Boards wie das Feld im Blatt „Filter“ (`filter.search`), in Aufgaben und
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
  const fresh = $derived(unread() > 0);

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
    <h1 class="truncate text-[30px] leading-[1.1] font-extrabold tracking-tight" data-testid={page.titleTestid}>{page.title}</h1>
    <p class="mt-1 truncate text-[14px] text-fg2" data-testid={page.subTestid}>{page.sub}</p>
  </div>

  {#if !ui.online}
    <span class="mt-2 flex shrink-0 items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-[13px] text-fg2" role="status">
      <Icon name="wifi-off" size={14} />Offline
    </span>
  {/if}

  <label class="focus-ring-in flex h-12 w-[230px] shrink-0 items-center gap-2.5 rounded-[14px] border border-line-chip bg-surface px-3.5 text-text-soft hover:border-sep xl:w-[340px]">
    <Icon name="search" size={20} stroke={1.9} />
    <input
      id="desktop-search"
      type="search"
      class="desktop-search min-w-0 flex-1 bg-transparent text-[15px] font-medium text-fg outline-none placeholder:text-dim"
      placeholder="{t('Suchen')} …"
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
  {#if feat.haUi}
    <button class="head-icon" aria-label={t('Zurück zu Home Assistant')} data-testid="home-button" onclick={goToDashboard}>
      <SymbolIcon id="home-assistant" size={26} />
    </button>
  {/if}
  <button class="head-icon relative" aria-label={fresh ? t('Mitteilungen, es gibt Ungelesenes') : t('Mitteilungen')} data-testid="bell" onclick={() => openSheet({ type: 'notifications' })}>
    <Icon name="bell" size={24} />
    {#if fresh}<span class="absolute top-[11px] right-[13px] h-[9px] w-[9px] rounded-full bg-brand-dot" data-testid="bell-dot"></span>{/if}
  </button>
</header>
