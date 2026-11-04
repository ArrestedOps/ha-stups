<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { dayNumber, weekdayShort } from '../lib/calendar';
  import { dayOfMonth } from '../lib/i18n/names';
  import type { WeekDay } from '../lib/week';
  import Icon from './Icon.svelte';

  /**
   * „Diese Woche" wie im Mockup: Titel, rechts „Monatsansicht" und der Monat („Jan 2025 ⌄"), darunter sieben Tage mit bis zu drei
   * Punkten und ein Knopf zum Kalender. Ein Tipp auf einen Tag öffnet die Tagesansicht, „Monatsansicht" und der Monat die Monatsansicht.
   */
  let { days, title, onday, onweek, onmonth }: { days: WeekDay[]; title: string; onday: (key: string) => void; onweek: () => void; onmonth: () => void } = $props();

  const dot: Record<string, string> = { overdue: 'bg-sig-red', today: 'bg-sig-orange', upcoming: 'bg-sig-blue', done: 'bg-sig-green' };
</script>

<section class="flex flex-col gap-1" aria-label={t('Woche')} data-testid="week-strip">
  <div class="flex h-11 items-center px-1">
    <h2 class="min-w-0 flex-1 truncate text-[19px] font-extrabold tracking-tight">{t('Diese Woche')}</h2>
    <button class="inline-flex h-11 shrink-0 items-center gap-[5px] px-0.5 text-[13px] font-medium text-text-soft" onclick={onmonth}><Icon name="calendar" size={16} />{t('Monatsansicht')}</button>
    <button class="ml-2.5 inline-flex h-11 shrink-0 items-center gap-[5px] px-0.5 text-[13px] font-semibold text-text-soft" aria-label={t('Monat {month}', { month: title })} onclick={onmonth}>{title}<Icon name="chevron-down" size={16} stroke={2} /></button>
  </div>
  <div class="grid grid-cols-8 gap-1.5">
    {#each days as d (d.key)}
      <button
        class="flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-[12px] border text-text-soft {d.today ? 'bg-accent-grad border-transparent !text-on-accent' : 'border-stat-line bg-surface'}"
        aria-label={`${weekdayShort(d.key)} ${d.number}.${d.today ? `, ${t('Heute')}` : ''}${d.dots.length ? `, ${tn('{n} Karte', '{n} Karten', d.dots.length)}` : ''}`}
        aria-current={d.today ? 'date' : undefined}
        onclick={() => onday(d.key)}
      >
        <span class="text-[13px] font-medium">{weekdayShort(d.key)}</span>
        <span class="text-[14px] font-semibold">{dayOfMonth(dayNumber(d.key))}</span>
        <span class="mt-0.5 flex h-1.5 gap-[3px]" aria-hidden="true">
          {#each d.dots as k, i (i)}<i class="h-1.5 w-1.5 rounded-full {dot[k]}"></i>{/each}
        </span>
      </button>
    {/each}
    <button class="flex h-[60px] items-center justify-center rounded-[12px] border border-stat-line bg-surface text-text-soft" aria-label={t('Kalender öffnen')} onclick={onweek}>
      <Icon name="calendar" size={22} />
    </button>
  </div>
</section>
