<script lang="ts">
  import type { Card } from '../lib/api';
  import { catKey } from '../lib/colors';
  import { cardMeta } from '../lib/cardMeta';
  import { formatCost, formatDue, isOverdue } from '../lib/datetime';
  import { nudgeBadge } from '../lib/nudge';
  import { describeRecurrence } from '../lib/recurrence';
  import { swipeTarget } from '../lib/swipe';
  import { urgency, urgencyColor } from '../lib/urgency';
  import { completeCard, openSheet, personById, swipeCard, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  let { card }: { card: Card } = $props();

  const categories = $derived((ui.view?.categories ?? []).filter((c) => card.categoryIds.includes(c.id)));
  const assignees = $derived(card.assigneeIds.map(personById).filter((p) => p !== undefined));
  const overdue = $derived(isOverdue(card.dueAt));
  // Stupse: deutlich, wenn ich gestupst wurde, dezent, wenn ich jemanden gestupst habe
  const nudge = $derived(nudgeBadge(card, ui.me?.id ?? null));
  const names = (ids: string[]) => [...new Set(ids.map((id) => personById(id)?.displayName ?? 'Jemand'))].join(', ');
  const isDoneColumn = $derived(ui.view?.columns.find((c) => c.id === card.columnId)?.isDone ?? false);
  const meta = $derived(cardMeta(card, { overdue, isDone: isDoneColumn }, { due: formatDue, cost: formatCost, recurrence: describeRecurrence }));

  // Farbbalken links: wie dringend die Karte ist
  const bar = $derived(urgencyColor(urgency(card, isDoneColumn)));

  // ---------- Wischen: nach rechts in den nächsten Status, nach links in den vorigen ----------
  const THRESHOLD = 96;
  const columns = $derived(ui.view?.columns ?? []);
  const rightTarget = $derived(swipeTarget(columns, card.columnId, 'right'));
  const leftTarget = $derived(swipeTarget(columns, card.columnId, 'left'));

  let dx = $state(0);
  let animating = $state(false);
  let mode: 'idle' | 'h' | 'v' = 'idle';
  let startX = 0;
  let startY = 0;
  let width = 300;
  let pointer = -1;
  let suppressClick = false;

  // Finger nach links = weiter in den nächsten Status, Finger nach rechts = zurück in den vorigen
  const target = $derived(dx < 0 ? rightTarget : dx > 0 ? leftTarget : null);
  const armed = $derived(!!target && Math.abs(dx) >= THRESHOLD);

  function down(e: PointerEvent) {
    // Mit der Maus wird gezogen (Drag & Drop), gewischt wird mit dem Finger
    if (e.pointerType === 'mouse' || pointer !== -1) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    mode = 'idle';
    width = (e.currentTarget as HTMLElement).offsetWidth;
  }

  function move(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (mode === 'idle') {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) {
        mode = 'h';
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // Zeiger schon beendet oder nicht aktiv: das Wischen funktioniert auch ohne Capture
        }
      } else if (Math.abs(my) > 10) {
        mode = 'v'; // senkrecht = die Liste scrollt, wir halten uns raus
      }
    }
    if (mode === 'h') {
      const t = mx < 0 ? rightTarget : leftTarget;
      // ohne Ziel gibt die Karte nur ein wenig nach (Gummiband)
      dx = t ? Math.max(-width * 0.7, Math.min(width * 0.7, mx)) : mx * 0.2;
    }
  }

  function settle(fire: 'left' | 'right' | null) {
    animating = true;
    if (fire) {
      dx = (fire === 'right' ? -1 : 1) * width; // 'right' = nächster Status = Karte fliegt nach links raus
      setTimeout(async () => {
        await swipeCard(card, fire);
        dx = 0;
        animating = false;
      }, 140);
    } else {
      dx = 0;
      setTimeout(() => (animating = false), 180);
    }
  }

  function up(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (mode !== 'h') return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 350);
    settle(armed ? (dx < 0 ? 'right' : 'left') : null);
  }

  function cancel(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (mode === 'h') settle(null);
  }
</script>

<div class="relative overflow-hidden rounded-[20px] {ui.hop === card.id ? 'hop' : ''}">
  {#if target && Math.abs(dx) > 4}
    <div
      class="pointer-events-none absolute inset-0 flex items-center px-5 {dx > 0 ? 'justify-start' : 'justify-end'} {armed
        ? 'bg-accent text-on-accent'
        : target.isDone
          ? 'bg-(--c-green-bg) text-(--c-green-fg)'
          : 'bg-surface2 text-accent-text'}"
      aria-hidden="true"
    >
      <span class="flex items-center gap-2 text-[16px] font-bold">
        {#if dx < 0}<Icon name="arrow-left" size={20} stroke={2.6} />{/if}
        {#if target.isDone}<Icon name="check" size={20} stroke={3} />{/if}
        {target.isDone ? 'Erledigt' : target.name}
        {#if dx > 0 && !target.isDone}<Icon name="arrow-right" size={20} stroke={2.6} />{/if}
      </span>
    </div>
  {/if}

  <div
    class="card-shadow relative flex touch-pan-y gap-1 overflow-hidden rounded-[20px] border border-line bg-surface pl-1 select-none [-webkit-touch-callout:none] {isDoneColumn
      ? 'opacity-70'
      : ''}"
    style:transform={dx ? `translateX(${dx}px)` : undefined}
    style:transition={animating ? 'transform 150ms ease-out' : 'none'}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={cancel}
    role="presentation"
  >
    {#if bar}<span class="absolute inset-y-0 left-0 w-[5px]" style:background={bar} aria-hidden="true"></span>{/if}
    <button
      class="flex min-h-14 w-11 shrink-0 items-start justify-center pt-[17px]"
      aria-label={isDoneColumn ? 'Bereits erledigt' : `„${card.title}“ erledigen`}
      disabled={isDoneColumn}
      onclick={() => !suppressClick && completeCard(card)}
    >
      <span
        class="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 {isDoneColumn
          ? 'border-accent bg-accent text-on-accent'
          : overdue
            ? 'border-danger'
            : 'border-fg2'}"
      >
        {#if isDoneColumn}<Icon name="check" size={14} stroke={3} />{/if}
      </span>
    </button>

    <button class="min-w-0 flex-1 py-3 text-left" onclick={() => !suppressClick && openSheet({ type: 'card', id: card.id })}>
      <div class="flex items-start justify-between gap-2">
        <span class="line-clamp-2 text-[17px] leading-snug font-semibold {isDoneColumn ? 'line-through' : ''}">{card.title}</span>
        {#if assignees.length}
          <span class="flex shrink-0 gap-1">
            {#each assignees as p (p.id)}<Avatar person={p} />{/each}
          </span>
        {/if}
      </div>

      {#if nudge.toMe.length}
        <span class="mt-1.5 inline-flex items-center gap-1.5 rounded-[9px] bg-accent px-2 py-0.5 text-[13px] font-bold text-on-accent" data-testid="nudge-to-me">
          <Icon name="hand" size={14} />{names(nudge.toMe.map((n) => n.fromId))} stupst dich
        </span>
      {:else if nudge.fromMe.length}
        <span class="mt-1.5 flex items-center gap-1.5 text-[12px] text-fg2" data-testid="nudge-from-me">
          <Icon name="hand" size={12} />Du hast {names(nudge.fromMe.map((n) => n.toId))} gestupst
        </span>
      {/if}

      <!-- Eine Zeile: Was nicht passt, wird hinten abgeschnitten. Alles Weitere steht im Karten-Fenster. -->
      {#if meta.length || categories.length}
        <div class="mt-1.5 flex items-center gap-2 text-[13px]" data-testid="card-meta">
          <div class="flex min-w-0 flex-1 items-center gap-3 overflow-hidden whitespace-nowrap text-fg2">
            {#each meta as m (m.kind)}
              {#if m.kind === 'done'}
                <span class="flex shrink-0 items-center gap-1 text-fg" data-testid="card-done-at"><Icon name="check" size={13} stroke={2.6} />Erledigt {m.text}</span>
              {:else if m.kind === 'due'}
                <span
                  class="flex shrink-0 items-center gap-1 font-medium {m.overdue ? 'text-danger' : 'text-fg'}"
                  data-testid="card-due"
                  data-overdue={m.overdue}
                  aria-label={m.overdue ? `Überfällig, ${m.text}` : undefined}
                >
                  <Icon name="clock" size={13} />{m.text}
                </span>
              {:else if m.kind === 'watcher'}
                <span class="shrink-0" title="Von einem Wächter angelegt" aria-label="Von einem Wächter angelegt" data-testid="card-watcher"><Icon name="eye" size={13} /></span>
              {:else if m.kind === 'recurrence'}
                <span class="shrink-0" title={m.label} aria-label="Wiederholt: {m.label}"><Icon name="repeat" size={13} /></span>
              {:else if m.kind === 'priority'}
                <span
                  class="shrink-0"
                  style:color={m.level === 'high' ? 'var(--c-red-fg)' : 'var(--c-orange-fg)'}
                  aria-label={m.level === 'high' ? 'Priorität hoch' : 'Priorität mittel'}
                  data-testid="card-priority"
                  data-level={m.level}
                >
                  <Icon name="flag" size={13} stroke={2.4} />
                </span>
              {:else if m.kind === 'checklist'}
                <span class="flex shrink-0 items-center gap-1" aria-label="Checkliste {m.done} von {m.total}"><Icon name="checklist" size={13} />{m.done}/{m.total}</span>
              {:else if m.kind === 'comments'}
                <span class="flex shrink-0 items-center gap-1" aria-label="{m.count} Kommentare"><Icon name="message" size={13} />{m.count}</span>
              {:else if m.kind === 'links'}
                <span class="flex shrink-0 items-center gap-1" aria-label="{m.count} Links"><Icon name="link" size={13} />{m.count}</span>
              {:else if m.kind === 'attachments'}
                <span class="flex shrink-0 items-center gap-1" aria-label="{m.count} Anhänge"><Icon name="paperclip" size={13} />{m.count}</span>
              {:else if m.kind === 'cost'}
                <span class="flex shrink-0 items-center gap-1"><Icon name="euro" size={13} />{m.text}</span>
              {/if}
            {/each}
          </div>
          {#if categories.length}
            <span class="flex shrink-0 items-center gap-1" aria-label="Kategorien: {categories.map((c) => c.name).join(', ')}" data-testid="card-categories">
              {#each categories as c (c.id)}<i class="h-[9px] w-[9px] rounded-full" style:background="var(--c-{catKey(c.color)}-fg)"></i>{/each}
            </span>
          {/if}
        </div>
      {/if}
    </button>
    <button
      class="flex w-10 shrink-0 items-start justify-center pt-[18px] text-fg2"
      aria-label="Menü für „{card.title}“"
      onclick={() => !suppressClick && openSheet({ type: 'cardMenu', id: card.id })}
    >
      <Icon name="more" size={18} />
    </button>
  </div>
</div>
