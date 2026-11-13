<script lang="ts">
  import { t } from './lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import AuthView from './components/AuthView.svelte';
  import SlotSheet from './components/SlotSheet.svelte';
  import TabBar from './components/TabBar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import DesktopHeader from './components/DesktopHeader.svelte';
  import TasksView from './components/TasksView.svelte';
  import BoardsView from './components/BoardsView.svelte';
  import BoardSwitcher from './components/BoardSwitcher.svelte';
  import CardMenu from './components/CardMenu.svelte';
  import CardSheet from './components/CardSheet.svelte';
  import CardContextMenu from './components/CardContextMenu.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import Icon from './components/Icon.svelte';
  import Lightbox from './components/Lightbox.svelte';
  import NewCardSheet from './components/NewCardSheet.svelte';
  import NoAccess from './components/NoAccess.svelte';
  import Toasts from './components/Toasts.svelte';
  import FilterSheet from './components/FilterSheet.svelte';
  import { loadAgenda } from './lib/agenda.svelte';
  import { loadInbox } from './lib/inbox.svelte';
  import { agendaDelay } from './lib/agendaGate';
  import { columnForNew } from './lib/calendar';
  import { feedbackSheet } from './lib/feedbackSheet.svelte';
  import { closeDetail, feat, goTasks, init, openSheet, selectTab, setDesktop, ui } from './lib/store.svelte';
  import { watchDesktop } from './lib/viewport';
  import Lazy from './components/Lazy.svelte';

  // Selten gebrauchte Fenster und Reiter: je ein eigenes Paket, geladen beim ersten Öffnen (das Hauptpaket wird kleiner, der Start schneller)
  const loadOnboarding = () => import('./components/Onboarding.svelte');
  const loadBoardCreate = () => import('./components/BoardCreate.svelte');
  const loadBoardOrder = () => import('./components/BoardOrder.svelte');
  const loadArchivedBoards = () => import('./components/ArchivedBoards.svelte');
  const loadBoardSettings = () => import('./components/BoardSettings.svelte');
  const loadSettingsSheet = () => import('./components/SettingsSheet.svelte');
  const loadPeopleSheet = () => import('./components/PeopleSheet.svelte');
  const loadWatcherSheet = () => import('./components/WatcherSheet.svelte');
  const loadFoundSheet = () => import('./components/FoundSheet.svelte');
  const loadNudgeSheet = () => import('./components/NudgeSheet.svelte');
  const loadTrashSheet = () => import('./components/TrashSheet.svelte');
  const loadArchiveSheet = () => import('./components/ArchiveSheet.svelte');
  const loadStatsSheet = () => import('./components/StatsSheet.svelte');
  const loadWeekSheet = () => import('./components/WeekSheet.svelte');
  const loadNotificationsSheet = () => import('./components/NotificationsSheet.svelte');
  const loadFeedbackSheet = () => import('./components/FeedbackSheet.svelte');
  const loadWatchersView = () => import('./components/WatchersView.svelte');

  onMount(init);

  // Aufgaben und die Glocke oben (Punkt für Ungelesenes aus dem Posteingang) laden im selben Takt: Auf „Aufgaben" laden sie bei jeder Änderung neu,
  // auf den anderen Reitern höchstens alle 30 Sekunden (sonst holte jede Änderung einer Aufgabe zusätzlich alle Termine aller Boards)
  let lastAgenda = 0;
  let agendaTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    void ui.rev;
    const onTasks = ui.tab === 'tasks';
    if (!ui.ready || !ui.allowed || ui.gate) return;
    const wait = agendaDelay(lastAgenda, Date.now(), onTasks);
    const run = () => {
      agendaTimer = null;
      lastAgenda = Date.now();
      void loadAgenda();
      void loadInbox();
    };
    if (wait === 0) {
      if (agendaTimer) clearTimeout(agendaTimer);
      run();
    } else if (!agendaTimer) {
      agendaTimer = setTimeout(run, wait);
    }
  });

  // Ab 1024 px: Desktop-Ansicht (Seitenleiste, Detailspalte, alle Spalten nebeneinander); das Handy (darunter) bleibt, wie es ist
  onMount(() => watchDesktop(setDesktop));

  const tab = $derived(ui.tab);
  const view = $derived(ui.view);
  // Der Plus-Button legt immer in der ersten offenen Spalte an (mit Termin nach heute in „Geplant"), egal welche Spalte gerade zu sehen ist
  const newCardColumn = $derived(columnForNew(view?.columns ?? [], false));
  const canCreate = $derived(!!view && !!newCardColumn && !ui.isChild);

  /** Tippt die Person gerade (Feld, Auswahl, Notiz)? Dann gehören die Tasten dem Feld. */
  const typing = (el: EventTarget | null) => el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

  /**
   * Tasten des Desktops. Strg/Cmd + K: Befehlspalette, „/“: Suchfeld. G dann T, B, C oder W: zu Aufgaben, Boards, Kalender, Wächter. N: neue Aufgabe (nicht in Eingabefeldern, nicht mit offenem Fenster). Escape: Detailspalte
   * schließen (nur wenn kein Fenster, Foto oder Rückfrage darüber liegt und Escape nicht schon etwas anderes getan hat). Im Capture,
   * damit ein Fenster, das Escape selbst schließt, die Detailspalte nicht gleich mit schließt.
   */
  /** Zweistufige Tasten: „G“, dann T (Aufgaben), B (Boards), C (Kalender), W (Wächter); die zweite Taste gilt eine Sekunde lang */
  let goAt = 0;
  function keydown(e: KeyboardEvent) {
    if (!ui.desktop || !ui.ready || ui.gate || !ui.allowed) return;
    const modal = !!ui.sheet || !!ui.viewer || !!ui.confirm || ui.palette;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !modal) {
      const key = e.key.toLowerCase();
      if (goAt && Date.now() - goAt < 1000 && 'tbcw'.includes(key) && key.length === 1) {
        goAt = 0;
        e.preventDefault();
        if (key === 't') goTasks('list');
        else if (key === 'c') goTasks('calendar');
        else if (key === 'b') selectTab('boards');
        else if (feat.watchers) selectTab('watchers');
        return;
      }
      goAt = key === 'g' ? Date.now() : 0;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modal && !ui.palette) return;
      ui.palette = !ui.palette;
    } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !modal && !ui.palette) {
      e.preventDefault();
      const input = document.getElementById('desktop-search') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    } else if (e.key === 'Escape') {
      if (ui.detailId && !modal && !e.defaultPrevented && !(e.target instanceof HTMLElement && e.target.id === 'desktop-search')) {
        (document.activeElement as HTMLElement | null)?.blur();
        closeDetail();
      }
    } else if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !modal && canCreate && ui.tab !== 'watchers') {
      e.preventDefault();
      openSheet({ type: 'new', columnId: newCardColumn! });
    }
  }
</script>

<svelte:window onkeydowncapture={keydown} />

{#if ui.fatal}
  <div class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
    <Icon name="wifi-off" size={32} />
    <p class="text-[17px] font-semibold">{t('Stups konnte nicht geladen werden')}</p>
    <p class="text-fg2">{ui.fatal}</p>
    <button class="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent" onclick={() => location.reload()}>{t('Neu laden')}</button>
  </div>
{:else if !ui.ready}
  <div class="flex h-full items-center justify-center text-fg2">{t('Lädt …')}</div>
{:else if ui.gate}
  <AuthView />
{:else if !ui.allowed}
  <NoAccess />
{:else}
  {#if ui.onboarding.needs}
    <!-- Einrichtung beim ersten Start: statt der Reiter, solange der Server sie verlangt; Fenster (Einstellungen, Prüfen) öffnen darüber -->
    <Lazy load={loadOnboarding} />
  {:else}
  {#snippet pages()}
    {#if tab === 'boards'}
      <BoardsView />
    {:else if tab === 'tasks'}
      <TasksView />
    {:else}
      <Lazy load={loadWatchersView} />
    {/if}
  {/snippet}

  {#if ui.desktop}
    <!-- Desktop: feste Seitenleiste, rechts davon Kopfzeile und Reiter (Inhalt höchstens 1560 px breit, bei sehr breiten Fenstern mittig) -->
    <Sidebar />
    <div class="relative z-[1] h-full pl-64">
      <div class="mx-auto flex h-full max-w-[1560px] flex-col px-8">
        <DesktopHeader />
        <div class="min-h-0 flex-1">{@render pages()}</div>
      </div>
    </div>
  {:else}
    {@render pages()}

    <TabBar />
  {/if}
  {/if}

  {#if ui.sheet?.type === 'card'}
    {#key ui.sheet.id}<CardSheet id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'cardMenu'}
    {#key ui.sheet.id}<CardMenu id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'new'}
    <NewCardSheet columnId={ui.sheet.columnId} dueAt={ui.sheet.dueAt ?? null} picked={ui.sheet.picked ?? false} initialTitle={ui.sheet.title ?? ''} />
  {:else if ui.sheet?.type === 'slot'}
    <SlotSheet at={ui.sheet.at} />
  {:else if ui.sheet?.type === 'boards'}
    <BoardSwitcher />
  {:else if ui.sheet?.type === 'newBoard'}
    <Lazy load={loadBoardCreate} />
  {:else if ui.sheet?.type === 'boardOrder'}
    <Lazy load={loadBoardOrder} />
  {:else if ui.sheet?.type === 'archivedBoards'}
    <Lazy load={loadArchivedBoards} />
  {:else if ui.sheet?.type === 'boardSettings'}
    <Lazy load={loadBoardSettings} />
  {:else if ui.sheet?.type === 'settings'}
    <Lazy load={loadSettingsSheet} />
  {:else if ui.sheet?.type === 'people'}
    <Lazy load={loadPeopleSheet} />
  {:else if ui.sheet?.type === 'watcher'}
    {#key ui.sheet.id ?? 'neu'}<Lazy load={loadWatcherSheet} props={{ id: ui.sheet.id, template: ui.sheet.template, hit: ui.sheet.hit }} />{/key}
  {:else if ui.sheet?.type === 'found'}
    <Lazy load={loadFoundSheet} />
  {:else if ui.sheet?.type === 'nudge'}
    {#key ui.sheet.id}<Lazy load={loadNudgeSheet} props={{ id: ui.sheet.id }} />{/key}
  {:else if ui.sheet?.type === 'trash'}
    <Lazy load={loadTrashSheet} />
  {:else if ui.sheet?.type === 'archive'}
    <Lazy load={loadArchiveSheet} />
  {:else if ui.sheet?.type === 'stats'}
    <Lazy load={loadStatsSheet} props={{ kind: ui.sheet.kind }} />
  {:else if ui.sheet?.type === 'week'}
    <Lazy load={loadWeekSheet} />
  {:else if ui.sheet?.type === 'notifications'}
    <Lazy load={loadNotificationsSheet} />
  {:else if ui.sheet?.type === 'filter'}
    <FilterSheet />
  {/if}

  <!-- Feedback liegt über allem, was offen ist (Einstellungen, Aufgaben …), und schließt zurück dorthin -->
  {#if feedbackSheet.open && !ui.isChild}<Lazy load={loadFeedbackSheet} />{/if}

  <Lightbox />
  <ConfirmDialog />
  {#if ui.desktop && ui.palette}<CommandPalette />{/if}
  {#if ui.desktop && ui.ctx}<CardContextMenu />{/if}
  <Toasts />
{/if}
