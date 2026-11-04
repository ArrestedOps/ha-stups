<script lang="ts">
  import { currentInbox } from '../lib/agenda.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { inboxFilters, type InboxFilterId, type InboxItem, type InboxKind } from '../lib/inbox';
  import { ageText } from '../lib/today';
  import { closeSheet, openCardAnywhere } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';

  /**
   * Mitteilungen (Glocke oben), Gestaltung nach dem Mockup: Chips, Abschnitt, Zeilen mit Kachel, Titel, Zeile darunter, Uhrzeit und Punkt.
   * Die volle Datenbasis (Posteingang, Gelesen-Marker, Verlauf) kommt mit Phase 6b. Bis dahin zeigt das Blatt, was gerade für mich offen ist
   * (lib/inbox.ts): Stupse an mich, Bestätigungen, Karten von Wächtern. Ist nichts offen, steht hier ein freundlicher Satz.
   */
  const all = $derived(currentInbox());
  const filters = $derived(inboxFilters(all));
  let filter = $state<InboxFilterId>('all');
  const shown = $derived(filter === 'all' || !filters.some((f) => f.id === filter) ? all : all.filter((i) => i.kind === filter));
  const nowMs = Date.now();

  const LABEL: Record<InboxFilterId, string> = {
    all: t('Alle'),
    nudge: t('Stupse'),
    confirm: t('Bestätigungen'),
    house: t('Wächter'),
  };
  const TILE: Record<InboxKind, { color: TileColor; icon: string }> = {
    nudge: { color: 'purple', icon: 'hand' },
    confirm: { color: 'green', icon: 'done' },
    house: { color: 'orange', icon: 'shield' },
  };
  const open = (i: InboxItem) => {
    closeSheet();
    void openCardAnywhere(i.card);
  };
</script>

<Sheet title={t('Mitteilungen')} onclose={closeSheet}>
  <div class="flex flex-col gap-3.5 pt-1" data-testid="notifications">
    {#if filters.length > 2}
      <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Art der Mitteilung')}>
        {#each filters as f (f.id)}
          <Chip small active={f.id === filter} pressed={f.id === filter} onclick={() => (filter = f.id)}>{LABEL[f.id]}</Chip>
        {/each}
      </div>
    {/if}

    {#if shown.length === 0}
      <div class="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="notifications-empty">
        <Tile color="gray" size="lg"><Icon name="bell" size={26} /></Tile>
        <p class="mt-2 text-[17px] font-extrabold">{t('Alles ruhig')}</p>
        <p class="text-[14px] text-fg2">{t('Gerade wartet nichts auf dich. Stupse, Bestätigungen und Karten von Wächtern erscheinen hier.')}</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        <SectionHeader title={t('Wartet auf dich')} />
        {#each shown as i (i.id)}
          <ListRow title={i.title} highlight onclick={() => open(i)}>
            {#snippet tile()}<Tile color={TILE[i.kind].color}><Icon name={TILE[i.kind].icon} size={22} /></Tile>{/snippet}
            {#snippet meta()}<span class="truncate">{i.sub}</span>{/snippet}
            {#snippet right()}
              <span class="flex flex-col items-end gap-1.5">
                {#if i.since}<span class="text-[12px] text-dim">{ageText(i.since, nowMs)}</span>{/if}
                <span class="dot-new h-[9px] w-[9px] rounded-full" aria-label={t('Neu')} role="img"></span>
              </span>
            {/snippet}
          </ListRow>
        {/each}
      </div>
    {/if}
  </div>
</Sheet>
