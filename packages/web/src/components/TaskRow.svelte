<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { ScheduleCard } from '../lib/schedule';
  import { completeCard, openCardAnywhere, openCardMenuAnywhere, personById, ui } from '../lib/store.svelte';
  import AvatarStack from './AvatarStack.svelte';
  import CardMeta from './CardMeta.svelte';
  import Icon from './Icon.svelte';
  import ListRow from './ui/ListRow.svelte';
  import CardTile from './CardTile.svelte';

  /**
   * Eine Karte mit Termin in der Liste von Aufgaben (aus allen Boards), wie im Mockup: Erledigt-Kreis, Kachel, Titel,
   * Meta-Zeile („Mo, 27. Jan • Ben • 0/3 • 1"), rechts das Bild der Person und der Mehr-Knopf („…", öffnet das Karten-Menü)
   */
  let { card, nowMs }: { card: ScheduleCard; nowMs: number } = $props();

  const done = $derived(!!card.completedAt);
  const overdue = $derived(!done && !!card.dueAt && Date.parse(card.dueAt) < nowMs);
  const assignees = $derived(card.assigneeIds.map(personById).filter((p) => p !== undefined));
  // Kategorien der Karte (vom Server mitgeliefert): die erste steht mit Farbpunkt in der Zeile
  const categories = $derived(card.categories ?? []);
</script>

<ListRow
  variant="task"
  title={card.title}
  current={ui.desktop && ui.detailId === card.id}
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
    <CardTile {card} />
  {/snippet}
  {#snippet meta()}
    <CardMeta {card} {done} {overdue} {nowMs} {categories} quietDue />
  {/snippet}
  {#snippet right()}
    <AvatarStack people={assignees} />
    {#if !ui.isChild}
      <button
        class="flex h-11 w-7 shrink-0 items-center justify-center text-text-soft2"
        aria-label={t('Menü für „{title}“', { title: card.title })}
        onclick={() => void openCardMenuAnywhere(card)}
      >
        <Icon name="more" size={20} stroke={2.6} />
      </button>
    {/if}
  {/snippet}
</ListRow>
