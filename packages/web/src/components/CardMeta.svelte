<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { Card } from '../lib/api';
  import { catKey } from '../lib/colors';
  import { cardMeta } from '../lib/cardMeta';
  import { formatCost, formatDue } from '../lib/datetime';
  import { describeRecurrence } from '../lib/recurrence';
  import Icon from './Icon.svelte';

  /**
   * Die Meta-Zeile unter dem Titel einer Karte (Termin, Wächter, Wiederholung, Priorität, Checkliste, Kommentare, Links, Anhänge, Kosten
   * und Kategoriepunkte): eine Zeile, was nicht passt, wird hinten abgeschnitten. Alles Weitere steht im Karten-Fenster.
   */
  let {
    card,
    done = false,
    overdue = false,
    categories = [],
    nowMs = Date.now(),
  }: {
    card: Card;
    done?: boolean;
    overdue?: boolean;
    categories?: { id: string; name: string; color: string }[];
    nowMs?: number;
  } = $props();

  const meta = $derived(cardMeta(card, { overdue, isDone: done }, { due: (iso) => formatDue(iso, nowMs), cost: formatCost, recurrence: describeRecurrence }));
</script>

{#if meta.length || categories.length}
  <span class="flex min-w-0 items-center gap-2" data-testid="card-meta">
    <span class="flex min-w-0 flex-1 items-center gap-3 overflow-hidden whitespace-nowrap">
      {#each meta as m (m.kind)}
        {#if m.kind === 'done'}
          <span class="flex shrink-0 items-center gap-1 text-fg" data-testid="card-done-at"><Icon name="check" size={13} stroke={2.6} />{t('Erledigt {when}', { when: m.text })}</span>
        {:else if m.kind === 'due'}
          <span
            class="flex shrink-0 items-center gap-1 font-medium {m.overdue ? 'text-danger' : 'text-fg'}"
            data-testid="card-due"
            data-overdue={m.overdue}
            aria-label={m.overdue ? t('Überfällig, {text}', { text: m.text }) : undefined}
          >
            <Icon name="clock" size={13} />{m.text}
          </span>
        {:else if m.kind === 'watcher'}
          <span class="shrink-0 text-house" title={t('Von einem Wächter angelegt')} aria-label={t('Von einem Wächter angelegt')} data-testid="card-watcher"><Icon name="eye" size={13} /></span>
        {:else if m.kind === 'recurrence'}
          <span class="shrink-0" title={m.label} aria-label={t('Wiederholt: {label}', { label: m.label })}><Icon name="repeat" size={13} /></span>
        {:else if m.kind === 'priority'}
          <span
            class="shrink-0"
            style:color={m.level === 'high' ? 'var(--c-red-fg)' : 'var(--c-orange-fg)'}
            aria-label={m.level === 'high' ? t('Priorität hoch') : t('Priorität mittel')}
            data-testid="card-priority"
            data-level={m.level}
          >
            <Icon name="flag" size={13} stroke={2.4} />
          </span>
        {:else if m.kind === 'checklist'}
          <span class="flex shrink-0 items-center gap-1" aria-label={t('Checkliste {done} von {total}', { done: m.done, total: m.total })}><Icon name="checklist" size={13} />{m.done}/{m.total}</span>
        {:else if m.kind === 'comments'}
          <span class="flex shrink-0 items-center gap-1" aria-label={tn('{n} Kommentar', '{n} Kommentare', m.count)}><Icon name="message" size={13} />{m.count}</span>
        {:else if m.kind === 'links'}
          <span class="flex shrink-0 items-center gap-1" aria-label={tn('{n} Link', '{n} Links', m.count)}><Icon name="link" size={13} />{m.count}</span>
        {:else if m.kind === 'attachments'}
          <span class="flex shrink-0 items-center gap-1" aria-label={tn('{n} Anhang', '{n} Anhänge', m.count)}><Icon name="paperclip" size={13} />{m.count}</span>
        {:else if m.kind === 'cost'}
          <span class="flex shrink-0 items-center gap-1"><Icon name="euro" size={13} />{m.text}</span>
        {/if}
      {/each}
    </span>
    {#if categories.length}
      <span class="flex shrink-0 items-center gap-1" aria-label={t('Kategorien: {names}', { names: categories.map((c) => c.name).join(', ') })} data-testid="card-categories">
        {#each categories as c (c.id)}<i class="h-[9px] w-[9px] rounded-full" style:background="var(--c-{catKey(c.color)}-fg)"></i>{/each}
      </span>
    {/if}
  </span>
{/if}
