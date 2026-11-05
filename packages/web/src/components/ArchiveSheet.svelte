<script lang="ts">
  import { t, numberLocale } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, type Card } from '../lib/api';
  import { groupArchive } from '../lib/archiveGroups';
  import { formatCreated } from '../lib/datetime';
  import { act, closeSheet, openSheet, personById, toast, ui } from '../lib/store.svelte';
  import CardTile from './CardTile.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';

  let items = $state<Card[] | null>(null);
  let search = $state('');

  const firstOpen = $derived((ui.view?.columns ?? []).find((c) => !c.isDone) ?? ui.view?.columns[0]);
  const shown = $derived((items ?? []).filter((c) => !search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase())));
  const groups = $derived(groupArchive(shown));
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, 15)).toLocaleDateString(numberLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  const who = (c: Card) => c.assigneeIds.map((id) => personById(id)?.displayName).filter(Boolean).join(', ');

  const load = async () => {
    if (ui.boardId) items = await api.archived(ui.boardId).catch(() => []);
  };
  onMount(load);

  async function restore(card: Card) {
    if (!firstOpen) return;
    const ok = await act(() => api.restoreArchived(card.id, firstOpen!.id));
    if (ok) toast(t('„{title}“ ist zurück in „{column}“', { title: card.title, column: firstOpen.name }));
    await load();
  }
</script>

<Sheet title={t('Archiv')} onclose={closeSheet}>
  {#snippet left()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={() => openSheet(ui.sheet?.type === 'archive' && ui.sheet.from === 'stats' ? { type: 'stats', kind: 'done' } : { type: 'boardSettings' })}>{t('Zurück')}</button>
  {/snippet}
  <div class="flex flex-col gap-3.5 pt-1">
    {#if items === null}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else if items.length === 0}
      <p class="py-10 text-center text-fg2">{t('Noch nichts archiviert. Erledigte Karten landen hier nach der Archivfrist des Boards.')}</p>
    {:else}
      <label class="focus-ring-in flex h-12 items-center gap-2.5 rounded-row border border-line bg-surface px-3.5 text-fg2">
        <Icon name="search" size={20} stroke={2} />
        <input type="search" bind:value={search} placeholder={t('Im Archiv suchen')} class="min-w-0 flex-1 bg-transparent text-[16px] font-medium text-fg outline-none placeholder:text-dim" aria-label={t('Im Archiv suchen')} />
      </label>
      <p class="-mt-1 px-1 text-[12.5px] leading-[1.45] text-hint">
        {ui.view?.board.archiveAfterDays ? t('Erledigte Karten landen nach {n} Tagen hier. Nichts geht verloren, alles lässt sich zurückholen.', { n: ui.view.board.archiveAfterDays }) : t('Nichts geht verloren, alles lässt sich zurückholen.')}
      </p>
      {#each groups as g (g.key)}
        <div class="flex flex-col gap-2">
          <SectionHeader title={g.week ? t('Diese Woche') : monthLabel(g.key)} count={g.items.length} />
          {#each g.items as card (card.id)}
            <ListRow title={card.title} strike variant="task" check={{ done: true, label: t('Erledigt'), onchange: () => undefined, disabled: true }}>
              {#snippet tile()}<CardTile {card} />{/snippet}
              {#snippet meta()}
                {t('erledigt {when}', { when: formatCreated(card.completedAt ?? card.archivedAt ?? '') })}{who(card) ? ` • ${who(card)}` : ''}
              {/snippet}
              {#snippet right()}
                <button class="bg-surface2 inline-flex h-[34px] shrink-0 items-center gap-[5px] rounded-[12px] px-3 text-[13px] font-bold text-text-soft" aria-label={t('{title} zurückholen', { title: card.title })} onclick={() => restore(card)}>
                  <Icon name="undo" size={14} stroke={2.2} />{t('Zurück')}
                </button>
              {/snippet}
            </ListRow>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</Sheet>
