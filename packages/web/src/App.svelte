<script lang="ts">
  import { t } from './lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import ArchiveSheet from './components/ArchiveSheet.svelte';
  import StatsSheet from './components/StatsSheet.svelte';
  import AuthView from './components/AuthView.svelte';
  import SlotSheet from './components/SlotSheet.svelte';
  import TabBar from './components/TabBar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import DesktopHeader from './components/DesktopHeader.svelte';
  import TasksView from './components/TasksView.svelte';
  import WeekSheet from './components/WeekSheet.svelte';
  import BoardsView from './components/BoardsView.svelte';
  import ArchivedBoards from './components/ArchivedBoards.svelte';
  import BoardCreate from './components/BoardCreate.svelte';
  import BoardOrder from './components/BoardOrder.svelte';
  import BoardSettings from './components/BoardSettings.svelte';
  import BoardSwitcher from './components/BoardSwitcher.svelte';
  import CardMenu from './components/CardMenu.svelte';
  import CardSheet from './components/CardSheet.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import Icon from './components/Icon.svelte';
  import Lightbox from './components/Lightbox.svelte';
  import NewCardSheet from './components/NewCardSheet.svelte';
  import NudgeSheet from './components/NudgeSheet.svelte';
  import NoAccess from './components/NoAccess.svelte';
  import PeopleSheet from './components/PeopleSheet.svelte';
  import SettingsSheet from './components/SettingsSheet.svelte';
  import Toasts from './components/Toasts.svelte';
  import TrashSheet from './components/TrashSheet.svelte';
  import WatcherSheet from './components/WatcherSheet.svelte';
  import FoundSheet from './components/FoundSheet.svelte';
  import WatchersView from './components/WatchersView.svelte';
  import NotificationsSheet from './components/NotificationsSheet.svelte';
  import FeedbackSheet from './components/FeedbackSheet.svelte';
  import FilterSheet from './components/FilterSheet.svelte';
  import { loadAgenda } from './lib/agenda.svelte';
  import { loadInbox } from './lib/inbox.svelte';
  import { agendaDelay } from './lib/agendaGate';
  import { columnForNew } from './lib/calendar';
  import { feedbackSheet } from './lib/feedbackSheet.svelte';
  import { closeDetail, init, openSheet, setDesktop, ui } from './lib/store.svelte';
  import { watchDesktop } from './lib/viewport';

  onMount(init);

  // Aufgaben und die Glocke oben (Punkt für Ungelesenes aus dem Posteingang) laden im selben Takt: Auf „Aufgaben" laden sie bei jeder Änderung neu,
  // auf den anderen Reitern höchstens alle 30 Sekunden (sonst holte jede Änderung einer Karte zusätzlich alle Termine aller Boards)
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
   * Tasten des Desktops. Strg/Cmd + K: Suche. N: neue Aufgabe (nicht in Eingabefeldern, nicht mit offenem Fenster). Escape: Detailspalte
   * schließen (nur wenn kein Fenster, Foto oder Rückfrage darüber liegt und Escape nicht schon etwas anderes getan hat). Im Capture,
   * damit ein Fenster, das Escape selbst schließt, die Detailspalte nicht gleich mit schließt.
   */
  function keydown(e: KeyboardEvent) {
    if (!ui.desktop || !ui.ready || ui.gate || !ui.allowed) return;
    const modal = !!ui.sheet || !!ui.viewer || !!ui.confirm;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modal) return;
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
  <div class="header-glow" aria-hidden="true"></div>
  {#snippet pages()}
    {#if tab === 'boards'}
      <BoardsView />
    {:else if tab === 'tasks'}
      <TasksView />
    {:else}
      <WatchersView />
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

    {#if (tab === 'boards' || (tab === 'tasks' && !ui.tasksCalendar)) && canCreate}
      <!-- ab 640 px sitzt der Knopf am Rand der zentrierten Spalte (720 px), nicht am Rand des Fensters -->
      <button
        class="fab-grad fixed right-[max(1rem,calc((100vw-720px)/2+1rem))] bottom-[calc(var(--nav-h)+16px)] z-30 flex h-[58px] w-[58px] items-center justify-center rounded-btn"
        aria-label={t('Neue Karte')}
        onclick={() => openSheet({ type: 'new', columnId: newCardColumn! })}
      >
        <Icon name="plus" size={28} stroke={2.4} />
      </button>
    {/if}

    <TabBar />
  {/if}

  {#if ui.sheet?.type === 'card'}
    {#key ui.sheet.id}<CardSheet id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'cardMenu'}
    {#key ui.sheet.id}<CardMenu id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'new'}
    <NewCardSheet columnId={ui.sheet.columnId} dueAt={ui.sheet.dueAt ?? null} picked={ui.sheet.picked ?? false} />
  {:else if ui.sheet?.type === 'slot'}
    <SlotSheet at={ui.sheet.at} />
  {:else if ui.sheet?.type === 'boards'}
    <BoardSwitcher />
  {:else if ui.sheet?.type === 'newBoard'}
    <BoardCreate />
  {:else if ui.sheet?.type === 'boardOrder'}
    <BoardOrder />
  {:else if ui.sheet?.type === 'archivedBoards'}
    <ArchivedBoards />
  {:else if ui.sheet?.type === 'boardSettings'}
    <BoardSettings />
  {:else if ui.sheet?.type === 'settings'}
    <SettingsSheet />
  {:else if ui.sheet?.type === 'people'}
    <PeopleSheet />
  {:else if ui.sheet?.type === 'watcher'}
    {#key ui.sheet.id ?? 'neu'}<WatcherSheet id={ui.sheet.id} template={ui.sheet.template} hit={ui.sheet.hit} />{/key}
  {:else if ui.sheet?.type === 'found'}
    <FoundSheet />
  {:else if ui.sheet?.type === 'nudge'}
    {#key ui.sheet.id}<NudgeSheet id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'trash'}
    <TrashSheet />
  {:else if ui.sheet?.type === 'archive'}
    <ArchiveSheet />
  {:else if ui.sheet?.type === 'stats'}
    <StatsSheet kind={ui.sheet.kind} />
  {:else if ui.sheet?.type === 'week'}
    <WeekSheet />
  {:else if ui.sheet?.type === 'notifications'}
    <NotificationsSheet />
  {:else if ui.sheet?.type === 'filter'}
    <FilterSheet />
  {/if}

  <!-- Feedback liegt über allem, was offen ist (Einstellungen, Aufgaben …), und schließt zurück dorthin -->
  {#if feedbackSheet.open && !ui.isChild}<FeedbackSheet />{/if}

  <Lightbox />
  <ConfirmDialog />
  <Toasts />
{/if}
