<script lang="ts">
  import { t } from './lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import ArchiveSheet from './components/ArchiveSheet.svelte';
  import AuthView from './components/AuthView.svelte';
  import SlotSheet from './components/SlotSheet.svelte';
  import TabBar from './components/TabBar.svelte';
  import TasksView from './components/TasksView.svelte';
  import WeekSheet from './components/WeekSheet.svelte';
  import BoardsView from './components/BoardsView.svelte';
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
  import FilterSheet from './components/FilterSheet.svelte';
  import { loadAgenda } from './lib/agenda.svelte';
  import { columnForNew } from './lib/calendar';
  import { init, openSheet, ui } from './lib/store.svelte';

  onMount(init);

  // Aufgaben und die Glocke oben (Punkt für „etwas ist offen") teilen sich dieselben Daten; sie laden bei jeder Änderung neu
  $effect(() => {
    void ui.rev;
    if (ui.ready && ui.allowed && !ui.gate) void loadAgenda();
  });

  // Ab 1024 px: klassische Kanban-Ansicht mit allen Spalten nebeneinander
  onMount(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    ui.desktop = mq.matches;
    const on = (e: MediaQueryListEvent) => (ui.desktop = e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  const tab = $derived(ui.tab);
  const view = $derived(ui.view);
  // Der Plus-Button legt immer in der ersten offenen Spalte an (mit Termin nach heute in „Geplant"), egal welche Spalte gerade zu sehen ist
  const newCardColumn = $derived(columnForNew(view?.columns ?? [], false));
</script>

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
  {#if tab === 'boards'}
    <BoardsView />
  {:else if tab === 'tasks'}
    <TasksView />
    {:else}
    <WatchersView />
  {/if}

  {#if (tab === 'boards' || (tab === 'tasks' && !ui.tasksCalendar)) && view && newCardColumn && !ui.isChild}
    <button
      class="fab-grad fixed right-4 bottom-[calc(var(--nav-h)+16px)] z-30 flex h-[58px] w-[58px] items-center justify-center rounded-btn"
      aria-label={t('Neue Karte')}
      onclick={() => openSheet({ type: 'new', columnId: newCardColumn! })}
    >
      <Icon name="plus" size={28} stroke={2.4} />
    </button>
  {/if}

  <TabBar />

  {#if ui.sheet?.type === 'card'}
    {#key ui.sheet.id}<CardSheet id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'cardMenu'}
    {#key ui.sheet.id}<CardMenu id={ui.sheet.id} />{/key}
  {:else if ui.sheet?.type === 'new'}
    <NewCardSheet columnId={ui.sheet.columnId} dueAt={ui.sheet.dueAt ?? null} />
  {:else if ui.sheet?.type === 'slot'}
    <SlotSheet at={ui.sheet.at} />
  {:else if ui.sheet?.type === 'boards'}
    <BoardSwitcher />
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
  {:else if ui.sheet?.type === 'week'}
    <WeekSheet />
  {:else if ui.sheet?.type === 'notifications'}
    <NotificationsSheet />
  {:else if ui.sheet?.type === 'filter'}
    <FilterSheet />
  {/if}

  <Lightbox />
  <ConfirmDialog />
  <Toasts />
{/if}
