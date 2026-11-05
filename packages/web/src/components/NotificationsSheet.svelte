<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { filterEntries, groupByDay, entryView, isUnread, timeLabel, INBOX_CHIPS, type InboxChip, type InboxGroupKey } from '../lib/inbox';
  import { inbox, loadInbox, loadMoreInbox, markAllRead, unread } from '../lib/inbox.svelte';
  import { deviceTz } from '../lib/datetime';
  import { closeSheet, openCardAnywhere, ui } from '../lib/store.svelte';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * Mitteilungen (Glocke oben) nach dem Mockup: „Schließen" und „Alle gelesen" im Kopf, Chips, Gruppen Heute, Gestern, Älter mit
   * Zeilen aus Kachel, Titel, Zeile darunter, Uhrzeit und Punkt für Ungelesenes. Die Daten liefert der Server je Person (GET /api/inbox);
   * der Satz entsteht hier aus Art und Daten (lib/inbox.ts).
   */
  let chip = $state<InboxChip>('all');
  const tz = deviceTz();
  const nowMs = $derived((void ui.rev, Date.now()));
  const shown = $derived(filterEntries(inbox.items, chip));
  const groups = $derived(groupByDay(shown, nowMs, tz));
  const ctx = { nameOf: (id: string | null) => ui.people.find((p) => p.id === id)?.displayName ?? t('Jemand'), tz };

  const LABEL: Record<InboxChip, string> = {
    all: t('Alle'),
    nudge: t('Stupse'),
    watcher: t('Wächter'),
    done: t('Erledigt'),
    comment: t('Kommentare'),
  };
  const GROUP: Record<InboxGroupKey, string> = { today: t('Heute'), yesterday: t('Gestern'), older: t('Älter') };

  // Beim Öffnen den neuesten Stand holen (die Kopfzeile lädt nur im Takt der Aufgaben)
  onMount(() => void loadInbox());

  const open = (cardId: string, boardId: string) => {
    closeSheet();
    void openCardAnywhere({ id: cardId, boardId });
  };
</script>

<Sheet title={t('Mitteilungen')} onclose={closeSheet}>
  {#snippet right()}
    <button
      class="inline-flex h-11 items-center px-2 text-[14px] font-bold text-accent-text disabled:opacity-40"
      disabled={unread() === 0}
      data-testid="mark-all-read"
      onclick={markAllRead}>{t('Alle gelesen')}</button>
  {/snippet}

  <div class="flex flex-col gap-3.5 pt-1" data-testid="notifications">
    <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Art der Mitteilung')}>
      {#each INBOX_CHIPS as c (c)}
        <Chip small active={c === chip} pressed={c === chip} onclick={() => (chip = c)}>{LABEL[c]}</Chip>
      {/each}
    </div>

    {#if groups.length === 0}
      <div class="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="notifications-empty">
        <Tile color="gray" size="lg"><Icon name="bell" size={26} /></Tile>
        <p class="mt-2 text-[17px] font-extrabold">{inbox.failed && !inbox.loaded ? t('Mitteilungen nicht geladen') : t('Alles ruhig')}</p>
        <p class="text-[14px] text-fg2">
          {inbox.failed && !inbox.loaded
            ? t('Beim Laden ist etwas schiefgegangen. Bitte gleich noch einmal versuchen.')
            : t('Stupse, Antworten, Karten von Wächtern, Erledigtes und Kommentare der letzten 14 Tage erscheinen hier.')}
        </p>
      </div>
    {:else}
      {#each groups as g (g.key)}
        <div class="flex flex-col gap-2" data-testid="inbox-group-{g.key}">
          <SectionHeader title={GROUP[g.key]} />
          {#each g.items as e (e.id)}
            {@const v = entryView(e, ctx)}
            {@const fresh = isUnread(e, inbox.seenAt)}
            <ListRow title={v.title} highlight={fresh} onclick={() => open(e.cardId, e.boardId)}>
              {#snippet tile()}<Tile color={v.color}><Icon name={v.icon} size={22} /></Tile>{/snippet}
              {#snippet meta()}<span class="truncate">{v.meta}</span>{/snippet}
              {#snippet right()}
                <span class="flex flex-col items-end gap-1.5">
                  <span class="text-[12px] text-dim">{timeLabel(e.at, g.key, tz)}</span>
                  {#if fresh}<span class="dot-new h-[9px] w-[9px] rounded-full" aria-label={t('Neu')} role="img"></span>{/if}
                </span>
              {/snippet}
            </ListRow>
          {/each}
        </div>
      {/each}
      {#if inbox.hasMore && chip === 'all'}
        <button class="mx-auto min-h-11 rounded-full px-4 text-[14px] font-semibold text-accent-text" onclick={loadMoreInbox}>{t('Ältere laden')}</button>
      {/if}
    {/if}
  </div>
</Sheet>
