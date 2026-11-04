<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { weekdayShort } from '../lib/calendar';
  import type { WeekDay } from '../lib/week';
  import Icon from './Icon.svelte';

  /** Die Woche als Leiste: sieben Tage mit Punkten (Dringlichkeit) und ein Knopf zum Kalender. Ein Tipp auf einen Tag öffnet die Tagesansicht. */
  let { days, title, onday, onweek, onmonth }: { days: WeekDay[]; title: string; onday: (key: string) => void; onweek: () => void; onmonth: () => void } = $props();

  const dot: Record<string, string> = { overdue: 'bg-danger', today: 'bg-accent-text', upcoming: 'bg-(--c-blue-fg)', done: 'bg-(--c-green-fg)' };
</script>

<section class="flex flex-col gap-1" aria-label={t('Woche')} data-testid="week-strip">
  <div class="flex h-11 items-center gap-2 px-1">
    <h2 class="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight">{title}</h2>
    <button class="flex h-11 items-center gap-1.5 px-1 text-[13px] font-medium text-fg" onclick={onmonth}><Icon name="calendar" size={16} />{t('Monatsansicht')}</button>
  </div>
  <div class="grid grid-cols-8 gap-1.5">
    {#each days as d (d.key)}
      <button
        class="flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-[12px] border {d.today ? 'bg-accent-grad border-transparent' : 'border-line bg-surface'}"
        aria-label={`${weekdayShort(d.key)} ${d.number}.${d.today ? `, ${t('Heute')}` : ''}${d.dots.length ? `, ${tn('{n} Karte', '{n} Karten', d.dots.length)}` : ''}`}
        aria-current={d.today ? 'date' : undefined}
        onclick={() => onday(d.key)}
      >
        <span class="text-[13px] font-medium">{weekdayShort(d.key)}</span>
        <span class="text-[14px] font-semibold">{d.number}</span>
        <span class="mt-0.5 flex h-1.5 gap-[3px]" aria-hidden="true">
          {#each d.dots as k, i (i)}<i class="h-1.5 w-1.5 rounded-full {d.today ? 'bg-on-accent' : dot[k]}"></i>{/each}
        </span>
      </button>
    {/each}
    <button class="flex h-[60px] items-center justify-center rounded-[12px] border border-line bg-surface" aria-label={t('Kalender öffnen')} onclick={onweek}>
      <Icon name="calendar" size={20} />
    </button>
  </div>
</section>
