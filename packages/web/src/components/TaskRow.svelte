<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { ScheduleCard } from '../lib/schedule';
  import { activeScheduleFilter, completeCard, openCardAnywhere, openCardMenuAnywhere, personById, ui } from '../lib/store.svelte';
  import AvatarStack from './AvatarStack.svelte';
  import CardMeta from './CardMeta.svelte';
  import Icon from './Icon.svelte';
  import ListRow from './ui/ListRow.svelte';
  import CardTile from './CardTile.svelte';

  /**
   * Eine Aufgabe mit Termin in der Liste von Aufgaben (aus allen Boards), wie im Mockup: Erledigt-Kreis, Kachel, Titel,
   * Meta-Zeile („Mo, 27. Jan • Ben • 0/3 • 1"), rechts das Bild der Person und der Mehr-Knopf („…", öffnet das Aufgaben-Menü)
   */
  let { card, nowMs }: { card: ScheduleCard; nowMs: number } = $props();

  const done = $derived(!!card.completedAt);
  const overdue = $derived(!done && !!card.dueAt && Date.parse(card.dueAt) < nowMs);
  const assignees = $derived(card.assigneeIds.map(personById).filter((p) => p !== undefined));
  // Kategorien der Aufgabe (vom Server mitgeliefert): die erste steht mit Farbpunkt in der Zeile
  const categories = $derived(card.categories ?? []);
  /** an mich gestupst: die Zeile hebt sich ab (Entwurf) */
  const nudged = $derived(!done && (card.openNudges ?? []).some((n) => n.toId === ui.me?.id));
  /** „Meine Aufgaben“ und nur ich zuständig: das Bild entfällt (es wäre überall dasselbe) */
  const onlyMine = $derived.by(() => {
    const sf = activeScheduleFilter();
    return sf.personIds.length === 1 && sf.personIds[0] === ui.me?.id && card.assigneeIds.length === 1 && card.assigneeIds[0] === ui.me?.id;
  });
</script>

{#snippet symbol()}<CardTile {card} />{/snippet}

<ListRow
  variant="task"
  tile={card.icon ? symbol : undefined}
  title={card.title}
  current={ui.desktop && ui.detailId === card.id}
  strike={done}
  {nudged}
  check={{
    done,
    label: done ? t('Bereits erledigt') : t('„{title}“ erledigen', { title: card.title }),
    onchange: () => void completeCard(card),
    state: overdue ? 'overdue' : undefined,
    disabled: done || (ui.isChild && !card.assigneeIds.includes(ui.me?.id ?? '')),
  }}
  onclick={() => void openCardAnywhere(card)}
>
  {#snippet meta()}
    <CardMeta {card} {done} {overdue} {nowMs} {categories} quietDue wrap={!ui.desktop} showBoard={ui.boards.length > 1} />
  {/snippet}
  {#snippet right()}
    {#if !onlyMine}<AvatarStack people={assignees} />{/if}
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
