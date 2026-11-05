<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { Card } from '../lib/api';
  import { cardMeta, categoryFg, priorityTone } from '../lib/cardMeta';
  import { formatCost, formatDue } from '../lib/datetime';
  import { describeRecurrence } from '../lib/recurrence';
  import Icon from './Icon.svelte';

  /**
   * Die Meta-Zeile unter dem Titel einer Karte wie im Mockup: Symbol und Text, getrennt durch „•"
   * („Mo, 27. Jan • Ben • 0/3 • 1"). Eine Zeile; was nicht passt, wird hinten abgeschnitten. Alles Weitere steht im Karten-Fenster.
   * `quietDue`: ein überfälliger Termin wird nicht rot (in Aufgaben sagt das die Gruppe „Überfällig").
   */
  let {
    card,
    done = false,
    overdue = false,
    categories = [],
    quietDue = false,
    nowMs = Date.now(),
  }: {
    card: Card;
    done?: boolean;
    overdue?: boolean;
    /** die Kategorien der Karte: die erste steht mit Farbpunkt in der Zeile, alle als Text für Vorlese-Programme */
    categories?: { id: string; name: string; color: string }[];
    quietDue?: boolean;
    nowMs?: number;
  } = $props();

  const meta = $derived(cardMeta(card, { overdue, isDone: done }, { due: (iso) => formatDue(iso, nowMs), cost: formatCost, recurrence: describeRecurrence }, { categories }));
  const ICON = 14;
</script>

{#if meta.length || categories.length}
  <span class="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap" data-testid="card-meta">
    {#if categories.length}<span class="sr-only" data-testid="card-categories" aria-label={t('Kategorien: {names}', { names: categories.map((c) => c.name).join(', ') })}>{t('Kategorien: {names}', { names: categories.map((c) => c.name).join(', ') })}</span>{/if}
    {#each meta as m, i (m.kind)}
      {#if i > 0}<span class="shrink-0 text-sep" aria-hidden="true">•</span>{/if}
      {#if m.kind === 'done'}
        <span class="inline-flex shrink-0 items-center gap-1 text-fg" data-testid="card-done-at"><Icon name="check" size={ICON} stroke={2.4} />{t('Erledigt {when}', { when: m.text })}</span>
      {:else if m.kind === 'due'}
        <span
          class="inline-flex shrink-0 items-center gap-1 {m.overdue && !quietDue ? 'text-danger' : ''}"
          data-testid="card-due"
          data-overdue={m.overdue}
          aria-label={m.overdue ? t('Überfällig, {text}', { text: m.text }) : undefined}
        >
          <Icon name="calendar" size={ICON} stroke={1.9} />{m.text}
        </span>
      {:else if m.kind === 'watcher'}
        <span class="inline-flex shrink-0 text-house" title={t('Von einem Wächter angelegt')} aria-label={t('Von einem Wächter angelegt')} data-testid="card-watcher"><Icon name="eye" size={ICON} stroke={1.9} /></span>
      {:else if m.kind === 'recurrence'}
        <span class="inline-flex shrink-0" title={m.label} aria-label={t('Wiederholt: {label}', { label: m.label })}><Icon name="repeat" size={ICON} stroke={1.9} /></span>
      {:else if m.kind === 'priority'}
        <span
          class="inline-flex shrink-0 items-center gap-1 {priorityTone(m.level).text} {m.level === 'high' ? 'font-bold' : ''}"
          aria-label={m.level === 'high' ? t('Priorität hoch') : t('Priorität mittel')}
          data-testid="card-priority"
          data-level={m.level}
        >
          <span class={priorityTone(m.level).glow ? 'prio-glow flex' : 'flex'}><Icon name="flag" size={ICON} stroke={1.9} /></span>{m.level === 'high' ? t('Hoch') : t('Mittel')}
        </span>
      {:else if m.kind === 'category'}
        <span class="inline-flex min-w-0 items-center gap-[5px] font-semibold" style:color={categoryFg(m.color)} data-testid="card-category">
          <i class="block h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true"></i><span class="truncate">{m.name}</span>{#if m.more > 0}<span class="shrink-0">+{m.more}</span>{/if}
        </span>
      {:else if m.kind === 'checklist'}
        <span class="inline-flex shrink-0 items-center gap-1" aria-label={t('Checkliste {done} von {total}', { done: m.done, total: m.total })}><Icon name="task-check" size={ICON} stroke={1.9} />{m.done}/{m.total}</span>
      {:else if m.kind === 'comments'}
        <span class="inline-flex shrink-0 items-center gap-1" aria-label={tn('{n} Kommentar', '{n} Kommentare', m.count)}><Icon name="message" size={ICON} stroke={1.9} />{m.count}</span>
      {:else if m.kind === 'links'}
        <span class="inline-flex shrink-0 items-center gap-1" aria-label={tn('{n} Link', '{n} Links', m.count)}><Icon name="link" size={ICON} stroke={1.9} />{m.count}</span>
      {:else if m.kind === 'attachments'}
        <span class="inline-flex shrink-0 items-center gap-1" aria-label={tn('{n} Anhang', '{n} Anhänge', m.count)}><Icon name="paperclip" size={ICON} stroke={1.9} />{m.count}</span>
      {:else if m.kind === 'cost'}
        <span class="inline-flex shrink-0 items-center gap-1"><Icon name="euro" size={ICON} stroke={1.9} />{m.text}</span>
      {/if}
    {/each}
  </span>
{/if}
