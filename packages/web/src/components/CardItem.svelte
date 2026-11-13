<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { Card } from '../lib/api';
  import { waitingForConfirmation } from '../lib/confirm';
  import { isOverdue } from '../lib/datetime';
  import { nudgeBadge } from '../lib/nudge';
  import { swipeDirection, swipeTarget } from '../lib/swipe';
  import { completeCard, openSheet, personById, swipeCard, ui } from '../lib/store.svelte';
  import AvatarStack from './AvatarStack.svelte';
  import CardMeta from './CardMeta.svelte';
  import Icon from './Icon.svelte';
  import ListRow from './ui/ListRow.svelte';
  import CardTile from './CardTile.svelte';

  let { card }: { card: Card } = $props();

  const categories = $derived((ui.view?.categories ?? []).filter((c) => card.categoryIds.includes(c.id)));
  const assignees = $derived(card.assigneeIds.map(personById).filter((p) => p !== undefined));
  const overdue = $derived(isOverdue(card.dueAt));
  // Stupse: deutlich, wenn ich gestupst wurde, dezent, wenn ich jemanden gestupst habe
  const nudge = $derived(nudgeBadge(card, ui.me?.id ?? null));
  const names = (ids: string[]) => [...new Set(ids.map((id) => personById(id)?.displayName ?? t('Jemand')))].join(', ');
  const isDoneColumn = $derived(ui.view?.columns.find((c) => c.id === card.columnId)?.isDone ?? false);

  // ---------- Wischen: Finger nach rechts in den nächsten Status, Finger nach links in den vorigen ----------
  const THRESHOLD = 96;
  const columns = $derived(ui.view?.columns ?? []);
  // Ein Kind verschiebt keine Aufgaben (auch nicht durch Wischen); es hakt nur eigene ab
  const rightTarget = $derived(ui.isChild ? null : swipeTarget(columns, card.columnId, 'right'));
  const leftTarget = $derived(ui.isChild ? null : swipeTarget(columns, card.columnId, 'left'));
  const waiting = $derived(waitingForConfirmation(card));
  // Erwachsene dürfen eine wartende Aufgabe auch gleich erledigen; ein Kind wartet auf die Antwort
  const canTick = $derived(!isDoneColumn && (!ui.isChild || (!waiting && !!ui.me && card.assigneeIds.includes(ui.me.id))));

  let dx = $state(0);
  let animating = $state(false);
  let mode: 'idle' | 'h' | 'v' = 'idle';
  let startX = 0;
  let startY = 0;
  let width = 300;
  let pointer = -1;
  let suppressClick = false;

  // Finger nach rechts = weiter in den nächsten Status, Finger nach links = zurück in den vorigen
  const target = $derived(dx > 0 ? rightTarget : dx < 0 ? leftTarget : null);
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
      const t = mx > 0 ? rightTarget : leftTarget;
      // ohne Ziel gibt die Aufgabe nur ein wenig nach (Gummiband)
      dx = t ? Math.max(-width * 0.7, Math.min(width * 0.7, mx)) : mx * 0.2;
    }
  }

  function settle(fire: 'left' | 'right' | null) {
    animating = true;
    if (fire) {
      dx = (fire === 'right' ? 1 : -1) * width; // 'right' = nächster Status = Aufgabe fliegt nach rechts raus
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
    settle(armed ? swipeDirection(dx) : null);
  }

  function cancel(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (mode === 'h') settle(null);
  }
</script>

<div class="relative overflow-hidden rounded-row {ui.hop === card.id ? 'hop' : ''}">
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
        {target.isDone ? t('Erledigt') : target.name}
        {#if dx > 0 && !target.isDone}<Icon name="arrow-right" size={20} stroke={2.6} />{/if}
      </span>
    </div>
  {/if}

  <!-- Wischen und Ziehen hängen an dieser Hülle, die Zeile darin ist der Baustein ListRow -->
  <div
    class="relative touch-pan-y select-none [-webkit-touch-callout:none] {isDoneColumn ? 'opacity-70' : ''}"
    style:transform={dx ? `translateX(${dx}px)` : undefined}
    style:transition={animating ? 'transform 150ms ease-out' : 'none'}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={cancel}
    oncontextmenu={(e) => {
      if (!ui.desktop || ui.isChild) return;
      e.preventDefault();
      ui.ctx = { x: e.clientX, y: e.clientY, card };
    }}
    role="presentation"
  >
    {#if ui.desktop}
      <!-- Desktop (Kanban, schmale Spalten): Kachel und Titel (bis zu drei Zeilen), darunter Erledigt-Kreis, Meta-Zeile (bricht um) und Zuständige -->
      <div class="row-hover flex flex-col gap-2.5 rounded-row border bg-surface p-3 text-fg {nudge.toMe.length ? 'row-new' : 'border-line'}" data-variant="task">
        <div class="flex items-start gap-2.5">
          <button type="button" data-row-open class="flex min-w-0 flex-1 items-start gap-2.5 text-left" onclick={() => !suppressClick && openSheet({ type: 'card', id: card.id })}>
            <CardTile {card} size="sm" />
            <span class="min-w-0 flex-1 pt-1 text-[15px] leading-snug font-bold tracking-tight wrap-anywhere hyphens-auto {isDoneColumn ? 'text-hint line-through' : ''}">{card.title}</span>
          </button>
          {#if !ui.isChild}
            <button
              class="-mt-0.5 -mr-1 flex h-9 w-7 shrink-0 items-center justify-center text-text-soft2 hover:text-fg"
              aria-label={t('Menü für „{title}“', { title: card.title })}
              onclick={() => !suppressClick && openSheet({ type: 'cardMenu', id: card.id })}
            >
              <Icon name="more" size={20} stroke={2.6} />
            </button>
          {/if}
        </div>
        <div class="flex items-center gap-2.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={isDoneColumn}
            aria-label={isDoneColumn ? t('Bereits erledigt') : waiting && ui.isChild ? t('Wartet auf Bestätigung') : t('„{title}“ erledigen', { title: card.title })}
            disabled={!canTick}
            class="-my-1.5 -ml-1 flex h-9 w-7 shrink-0 items-center justify-center"
            onclick={() => !suppressClick && completeCard(card)}
          >
            {#if isDoneColumn}
              <span class="bg-accent-grad flex h-[22px] w-[22px] items-center justify-center rounded-full !shadow-none"><Icon name="check" size={14} /></span>
            {:else if waiting}
              <span class="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-accent text-accent-text"><Icon name="clock" size={12} stroke={2.6} /></span>
            {:else}
              <span class="h-[22px] w-[22px] rounded-full border-2 border-ring"></span>
            {/if}
          </button>
          <span class="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-fg2">
            {#if waiting}
              <span class="flex items-center gap-1 font-semibold text-accent-text" data-testid="card-waiting"><Icon name="clock" size={13} />{t('Wartet auf Bestätigung')}</span>
            {/if}
            {#if nudge.toMe.length}
              <span class="flex items-center gap-1 font-bold text-accent-text" data-testid="nudge-to-me">
                <Icon name="hand" size={13} />{t('{names} stupst dich', { names: names(nudge.toMe.map((n) => n.fromId)) })}
              </span>
            {:else if nudge.fromMe.length}
              <span class="flex items-center gap-1" data-testid="nudge-from-me">
                <Icon name="hand" size={12} />{t('Du hast {names} gestupst', { names: names(nudge.fromMe.map((n) => n.toId)) })}
              </span>
            {/if}
            <CardMeta {card} done={isDoneColumn} {overdue} {categories} wrap />
          </span>
          <AvatarStack people={assignees} size={26} />
        </div>
      </div>
    {:else}
      {#snippet symbol()}<CardTile {card} />{/snippet}
      <ListRow
        variant="task"
        tile={card.icon ? symbol : undefined}
        title={card.title}
        strike={isDoneColumn}
        check={{
          done: isDoneColumn,
          label: isDoneColumn ? t('Bereits erledigt') : waiting && ui.isChild ? t('Wartet auf Bestätigung') : t('„{title}“ erledigen', { title: card.title }),
          onchange: () => !suppressClick && completeCard(card),
          state: waiting ? 'waiting' : overdue && !isDoneColumn ? 'overdue' : undefined,
          disabled: !canTick,
        }}
        onclick={() => !suppressClick && openSheet({ type: 'card', id: card.id })}
      >
        {#snippet meta()}
          <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0">
            {#if waiting}
              <span class="flex shrink-0 items-center gap-1 font-semibold text-accent-text" data-testid="card-waiting"><Icon name="clock" size={13} />{t('Wartet auf Bestätigung')}</span>
            {/if}
            {#if nudge.toMe.length}
              <span class="flex shrink-0 items-center gap-1 font-bold text-accent-text" data-testid="nudge-to-me">
                <Icon name="hand" size={13} />{t('{names} stupst dich', { names: names(nudge.toMe.map((n) => n.fromId)) })}
              </span>
            {:else if nudge.fromMe.length}
              <span class="flex shrink-0 items-center gap-1" data-testid="nudge-from-me">
                <Icon name="hand" size={12} />{t('Du hast {names} gestupst', { names: names(nudge.fromMe.map((n) => n.toId)) })}
              </span>
            {/if}
            <CardMeta {card} done={isDoneColumn} {overdue} {categories} showBoard={false} people={assignees} />
          </span>
        {/snippet}
        {#snippet right()}
          <AvatarStack people={assignees} />
          {#if !ui.isChild}
            <button
              class="flex h-11 w-7 shrink-0 items-center justify-center text-text-soft2"
              aria-label={t('Menü für „{title}“', { title: card.title })}
              onclick={() => !suppressClick && openSheet({ type: 'cardMenu', id: card.id })}
            >
              <Icon name="more" size={20} stroke={2.6} />
            </button>
          {/if}
        {/snippet}
      </ListRow>
    {/if}
  </div>
</div>
