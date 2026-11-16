<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/colors';
  import { ageText, sourceLine } from '../lib/today';
  import type { TodayCard } from '../lib/api';
  import { claimCard, completeCard, openCardAnywhere, passCard, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  /**
   * Eine Aufgabe „Vom Haus“ als Tabellenzeile am Desktop: türkis hinterlegt, mit Symbol, Titel, darunter die Quelle (Wächter), das Alter und der Grund
   * („Reihum unter allen, die zu Hause sind“), das Board, und rechts die Aktionen wie am Handy: ohne Zuständigen „Übernehmen“, sonst „Erledigt“ und
   * „Weitergeben“. Die Spalten richten sich nach der Tabelle darüber und darunter (Aufgabe, Board, dann die beiden letzten zusammen für die Knöpfe).
   */
  let { card, nowMs }: { card: TodayCard; nowMs: number } = $props();
  const dot = $derived(`var(--c-${boardColorKey(ui.boards, card.boardId)}-fg)`);
  const sub = $derived([sourceLine(card).text, ageText(card.createdAt, nowMs), card.why].filter(Boolean).join(' · '));
</script>

<div class="grid min-h-[60px] items-center gap-x-4 bg-house-bg px-4 py-1.5" style:grid-template-columns="minmax(0,1fr) 170px 258px" data-testid="house-row">
  <div class="flex min-w-0 items-center gap-3">
    <span class="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[9px] bg-house-bg text-house shadow-[0_0_0_1px_var(--house-line)]"><Icon name="eye" size={15} stroke={2} /></span>
    <button type="button" class="min-w-0 flex-1 rounded-md text-left" data-row-open title={card.title} onclick={() => void openCardAnywhere(card)}>
      <span class="block truncate text-[14.5px] font-semibold">{card.title}</span>
      <span class="block truncate text-[12.5px] text-house">{sub}</span>
    </button>
  </div>
  <span class="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-fg2"><i class="h-2 w-2 shrink-0 rounded-full" style:background={dot}></i><span class="truncate">{card.boardName}</span></span>
  <span class="flex items-center justify-end gap-1.5">
    {#if card.assigneeIds.length === 0}
      <button type="button" class="flex h-8 items-center gap-1.5 rounded-[9px] bg-house px-3 text-[13px] font-bold text-bg hover:brightness-110" onclick={() => void claimCard(card)}><Icon name="hand" size={15} />{t('Übernehmen')}</button>
    {:else}
      <button type="button" class="flex h-8 items-center gap-1.5 rounded-[9px] bg-house px-3 text-[13px] font-bold text-bg hover:brightness-110" onclick={() => void completeCard(card)}><Icon name="check" size={15} stroke={2.8} />{t('Erledigt')}</button>
      <button type="button" class="flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-semibold text-house hover:bg-surface2" onclick={() => void passCard(card)}><Icon name="arrow-right" size={15} />{t('Weitergeben')}</button>
    {/if}
  </span>
</div>
