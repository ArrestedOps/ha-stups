<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { cardIcon, tileColorOf } from '../lib/cardTile';
  import { boardColorKey, type ScheduleCard } from '../lib/schedule';
  import { completeCard, openCardAnywhere, personById, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import CardMeta from './CardMeta.svelte';
  import Icon from './Icon.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Tile from './ui/Tile.svelte';

  /** Eine Karte mit Termin in der Liste von Aufgaben (aus allen Boards): Erledigt-Kreis, Kachel, Titel, Meta, Personen */
  let { card, nowMs }: { card: ScheduleCard; nowMs: number } = $props();

  const done = $derived(!!card.completedAt);
  const overdue = $derived(!done && !!card.dueAt && Date.parse(card.dueAt) < nowMs);
  const boardIndex = $derived(ui.boards.findIndex((b) => b.id === card.boardId));
  const assignees = $derived(card.assigneeIds.map(personById).filter((p) => p !== undefined));
</script>

<ListRow
  variant="task"
  title={card.title}
  strike={done}
  check={{
    done,
    label: done ? t('Bereits erledigt') : t('„{title}“ erledigen', { title: card.title }),
    onchange: () => void completeCard(card),
    state: overdue ? 'overdue' : undefined,
    disabled: done || (ui.isChild && !card.assigneeIds.includes(ui.me?.id ?? '')),
  }}
  onclick={() => void openCardAnywhere(card)}
>
  {#snippet tile()}
    <Tile color={tileColorOf(boardColorKey(card.boardColor, boardIndex))}><Icon name={cardIcon(card)} size={20} /></Tile>
  {/snippet}
  {#snippet meta()}
    <span class="flex min-w-0 items-center gap-2">
      <CardMeta {card} {done} {overdue} {nowMs} />
      <span class="min-w-0 truncate">{card.boardName}</span>
    </span>
  {/snippet}
  {#snippet right()}
    {#if assignees.length}
      <span class="flex gap-1">
        {#each assignees.slice(0, 2) as p (p.id)}<Avatar person={p} size={28} />{/each}
      </span>
    {/if}
  {/snippet}
</ListRow>
