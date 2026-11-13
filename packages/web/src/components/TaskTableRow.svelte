<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/colors';
  import { formatDue } from '../lib/datetime';
  import { describeRecurrence } from '../lib/recurrence';
  import type { ScheduleCard } from '../lib/schedule';
  import { completeCard, openCardAnywhere, openCardMenuAnywhere, personById, ui } from '../lib/store.svelte';
  import AvatarStack from './AvatarStack.svelte';
  import Icon from './Icon.svelte';

  /**
   * Eine Aufgabe als Tabellenzeile am Desktop (wie im Entwurf): Erledigt-Kreis, Titel mit kleiner Zeile darunter (Stups, Wiederholung, Priorität),
   * Board mit Farbpunkt, Fällig, Wer. Die Zeile öffnet die Detailspalte (Inspektor); „…“ erscheint beim Darüberfahren.
   */
  let { card, nowMs, showBoard = true }: { card: ScheduleCard; nowMs: number; showBoard?: boolean } = $props();

  const done = $derived(!!card.completedAt);
  const overdue = $derived(!done && !!card.dueAt && Date.parse(card.dueAt) < nowMs);
  const assignees = $derived(card.assigneeIds.map(personById).filter((p) => p !== undefined));
  const nudgers = $derived([...new Set((card.openNudges ?? []).filter((n) => n.toId === ui.me?.id).map((n) => n.fromId))].map(personById).filter((p) => p !== undefined));
  const dot = $derived(`var(--c-${boardColorKey(ui.boards, card.boardId)}-fg)`);
  const current = $derived(ui.detailId === card.id);
  const hasSub = $derived(nudgers.length > 0 || !!card.recurrence || card.priority === 'high' || card.priority === 'medium');
</script>

<div
  class="group relative grid min-h-[52px] items-center gap-x-4 px-4 py-1.5 {nudgers.length > 0 && !done ? 'row-nudged' : ''} {current ? 'row-current' : 'hover:bg-surface2/60'}"
  style:grid-template-columns="minmax(0,1fr) 170px 150px 92px"
  data-testid="task-table-row"
  role="presentation"
  oncontextmenu={(e) => { if (ui.isChild) return; e.preventDefault(); ui.ctx = { x: e.clientX, y: e.clientY, card }; }}
>
  <div class="flex min-w-0 items-center gap-3">
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? t('Bereits erledigt') : t('„{title}“ erledigen', { title: card.title })}
      disabled={done || (ui.isChild && !card.assigneeIds.includes(ui.me?.id ?? ''))}
      class="flex h-8 w-8 shrink-0 items-center justify-center"
      onclick={() => void completeCard(card)}
    >
      {#if done}
        <span class="bg-accent-grad flex h-[22px] w-[22px] items-center justify-center rounded-full !shadow-none"><Icon name="check" size={13} /></span>
      {:else}
        <span class="h-[22px] w-[22px] rounded-full border-[1.75px] border-ring"></span>
      {/if}
    </button>
    <button type="button" data-row-open aria-current={current ? 'true' : undefined} class="min-w-0 flex-1 text-left" onclick={() => void openCardAnywhere(card)}>
      <span class="block truncate text-[15px] leading-tight {done ? 'text-hint line-through' : ''}">{card.title}</span>
      {#if hasSub}
        <span class="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] leading-tight text-text-soft">
          {#if nudgers.length > 0}<span class="inline-flex items-center gap-1 font-semibold text-accent-text"><Icon name="hand" size={12} stroke={2} />{t('{names} stupst dich', { names: nudgers.map((p) => p.displayName).join(', ') })}</span>{/if}
          {#if card.recurrence}<span class="inline-flex items-center gap-1"><Icon name="repeat" size={12} stroke={2} />{describeRecurrence(card.recurrence)}</span>{/if}
          {#if card.priority === 'high' || card.priority === 'medium'}<span class="inline-flex items-center gap-1 font-semibold text-accent-text"><Icon name="flag" size={12} stroke={2} />{card.priority === 'high' ? t('Hoch') : t('Mittel')}</span>{/if}
        </span>
      {/if}
    </button>
  </div>
  <span class="flex min-w-0 items-center gap-2 text-[14px]">
    {#if showBoard}<i class="block h-2.5 w-2.5 shrink-0 rounded-full" style:background={dot} aria-hidden="true"></i><span class="truncate">{card.boardName}</span>{/if}
  </span>
  <span class="flex items-center gap-1.5 text-[14px] {overdue ? 'text-danger' : 'text-text-soft'}">
    {#if card.dueAt}<Icon name="clock" size={14} stroke={2} />{formatDue(card.dueAt, nowMs)}{/if}
  </span>
  <span class="flex items-center justify-end gap-1">
    <AvatarStack people={assignees} />
    {#if !ui.isChild}
      <button class="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-text-soft2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label={t('Menü für „{title}“', { title: card.title })} onclick={() => void openCardMenuAnywhere(card)}>
        <Icon name="more" size={18} stroke={2.6} />
      </button>
    {/if}
  </span>
</div>
