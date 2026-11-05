<script lang="ts">
  import { untrack } from 'svelte';
  import { compose, defaultPick, localParts, minuteOptions, monthCells, shiftMonth, stepWheel, summaryFull, summaryTitle, todayOf, wheelWindow, ymdKey, type Pick, type Ymd } from '../lib/dateSheet';
  import { deviceTz } from '../lib/datetime';
  import { t } from '../lib/i18n/index.svelte';
  import { dayOfMonth, names } from '../lib/i18n/names';
  import { ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Termin“: Monatskalender und Uhrzeit-Rad (zwei Listen). „Übernehmen“ gibt den Termin als UTC-Zeit zurück, „Kein Termin“ null.
   * Zeitzone: die des Geräts (wie lib/datetime.ts). Bedienbar mit Zeiger und Tastatur.
   */
  let {
    value,
    onpick,
    onclose,
    now = Date.now(),
  }: {
    /** der bisherige Termin (UTC-ISO) oder null */
    value: string | null;
    onpick: (iso: string | null) => void;
    onclose: () => void;
    /** die Uhr (für Tests); sonst jetzt */
    now?: number;
  } = $props();

  const tz = deviceTz();
  const start: Pick = untrack(() => localParts(value, tz) ?? defaultPick(now, tz, ui.settings?.defaultDueTime ?? '09:00'));
  let ymd = $state<Ymd>(start.ymd);
  let hour = $state(start.h);
  let minute = $state(start.mi);
  let view = $state({ y: start.ymd.y, m: start.ymd.m });

  const today = $derived(todayOf(now, tz));
  const cells = $derived(monthCells(view.y, view.m));
  const rows = $derived(Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7)));
  const picked = $derived(compose(ymd, hour, minute, tz));
  const weekdays = $derived([1, 2, 3, 4, 5, 6, 0].map((d) => names().weekdaysShort[d]!));
  const monthTitle = $derived(`${names().monthsLong[view.m - 1]} ${view.y}`);

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const minutes = $derived(minuteOptions(untrack(() => start.mi)));
  const pad = (n: number) => String(n).padStart(2, '0');

  function go(delta: number) {
    view = shiftMonth(view.y, view.m, delta);
  }
  /** Einen anderen Tag wählen; liegt er in einem anderen Monat, folgt die Ansicht */
  function choose(v: Ymd) {
    ymd = v;
    view = { y: v.y, m: v.m };
  }
  /** Pfeiltasten im Kalender: Tage links und rechts, Wochen auf und ab, Bild auf und ab ein Monat */
  function dayKey(e: KeyboardEvent) {
    const days = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
    const months = e.key === 'PageUp' ? -1 : e.key === 'PageDown' ? 1 : 0;
    if (!days && !months) return;
    e.preventDefault();
    const d = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    if (days) d.setUTCDate(d.getUTCDate() + days);
    if (months) {
      const s = shiftMonth(ymd.y, ymd.m, months);
      const last = new Date(Date.UTC(s.y, s.m, 0)).getUTCDate();
      d.setTime(Date.UTC(s.y, s.m - 1, Math.min(ymd.d, last)));
    }
    choose({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-day="${ymdKey(ymd)}"]`)?.focus());
  }

  // ---- Uhrzeit-Rad: zwei Listen, fünf Werte sichtbar, der gewählte liegt im Band ----
  const hourIndex = $derived(HOURS.indexOf(hour));
  const minuteIndex = $derived(Math.max(0, minutes.indexOf(minute)));
  function stepHour(delta: number) {
    hour = HOURS[stepWheel(24, hourIndex, delta)]!;
  }
  function stepMinute(delta: number) {
    minute = minutes[stepWheel(minutes.length, minuteIndex, delta)]!;
  }

  let typed = '';
  let typedTimer: ReturnType<typeof setTimeout> | undefined;
  /** Tastatur an einer Liste: auf und ab, Bild auf und ab (größere Schritte), Anfang und Ende, Ziffern tippen */
  function listKey(e: KeyboardEvent, kind: 'h' | 'm') {
    const step = kind === 'h' ? stepHour : stepMinute;
    const size = kind === 'h' ? 3 : 3;
    if (e.key === 'ArrowDown') step(1);
    else if (e.key === 'ArrowUp') step(-1);
    else if (e.key === 'PageDown') step(size);
    else if (e.key === 'PageUp') step(-size);
    else if (e.key === 'Home') {
      if (kind === 'h') hour = 0;
      else minute = minutes[0]!;
    } else if (e.key === 'End') {
      if (kind === 'h') hour = 23;
      else minute = minutes[minutes.length - 1]!;
    }
    else if (/^\d$/.test(e.key)) {
      typed = (typed + e.key).slice(-2);
      clearTimeout(typedTimer);
      typedTimer = setTimeout(() => (typed = ''), 1200);
      const n = Number(typed);
      if (kind === 'h' && n <= 23) hour = n;
      else if (kind === 'm') {
        const hit = minutes.includes(n) ? n : minutes.find((m) => m >= n);
        if (hit !== undefined) minute = hit;
      } else typed = e.key;
    } else return;
    e.preventDefault();
  }

  // Zeiger: ziehen oder das Mausrad verschiebt das Rad um einen Wert je 36 px
  const ROW = 36;
  let drag: { y: number; acc: number; kind: 'h' | 'm'; moved: boolean } | null = null;
  function down(e: PointerEvent, kind: 'h' | 'm') {
    drag = { y: e.clientY, acc: 0, kind, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    drag.acc += e.clientY - drag.y;
    drag.y = e.clientY;
    while (Math.abs(drag.acc) >= ROW) {
      const dir = drag.acc > 0 ? -1 : 1; // nach unten ziehen zeigt frühere Werte
      (drag.kind === 'h' ? stepHour : stepMinute)(dir);
      drag.acc -= ROW * (drag.acc > 0 ? 1 : -1);
      drag.moved = true;
    }
  }
  function up() {
    setTimeout(() => (drag = null));
  }
  function wheel(e: WheelEvent, kind: 'h' | 'm') {
    e.preventDefault();
    (kind === 'h' ? stepHour : stepMinute)(e.deltaY > 0 ? 1 : -1);
  }
  /** Ein Tipp auf einen Nachbarwert springt dorthin (nicht, wenn gerade gezogen wurde) */
  function tapItem(kind: 'h' | 'm', offset: number) {
    if (drag?.moved) return;
    (kind === 'h' ? stepHour : stepMinute)(offset);
  }
</script>

{#snippet foot()}
  <div class="grid grid-cols-[1fr_2fr] gap-2">
    <CtaButton ghost onclick={() => onpick(null)}>{t('Kein Termin')}</CtaButton>
    <CtaButton onclick={() => onpick(picked)}>{t('Übernehmen')}</CtaButton>
  </div>
{/snippet}

{#snippet cancel()}
  <button type="button" class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={onclose}>{t('Abbrechen')}</button>
{/snippet}

{#snippet wheelCol(kind: 'h' | 'm', label: string, values: number[], index: number)}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="relative flex touch-none flex-col items-center outline-offset-4"
    role="listbox"
    tabindex="0"
    aria-label={label}
    aria-orientation="vertical"
    aria-activedescendant="opt-{kind}-{values[index]}"
    onkeydown={(e) => listKey(e, kind)}
    onpointerdown={(e) => down(e, kind)}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onwheel={(e) => wheel(e, kind)}
  >
    {#each wheelWindow(values, index) as v, i (i)}
      {@const off = i - 2}
      <div
        id={off === 0 ? `opt-${kind}-${v}` : undefined}
        role="option"
        aria-selected={off === 0}
        tabindex="-1"
        class="flex items-center {off === 0 ? 'h-11 text-[26px] font-extrabold' : Math.abs(off) === 1 ? 'h-9 text-[18px] font-semibold text-dim' : 'h-9 text-[18px] font-semibold text-ring'}"
        onclick={() => off !== 0 && tapItem(kind, off)}
        onkeydown={() => undefined}
      >{pad(v)}</div>
    {/each}
  </div>
{/snippet}

<Sheet title={t('Termin')} {onclose} left={cancel} footer={foot}>
  <div class="flex flex-col gap-3.5 pt-1">
    <div
      class="flex h-row items-center gap-3 rounded-row border px-3.5"
      style="background-image: var(--banner-warm); border-color: var(--banner-warm-line)"
      aria-live="polite"
    >
      <Tile color="red"><Icon name="calendar" size={22} /></Tile>
      <div class="min-w-0">
        <div class="truncate text-[19px] font-extrabold text-on-banner" data-testid="termin-summary">{summaryTitle(picked, now, tz)}</div>
        <div class="truncate text-[13px]" style="color: var(--banner-warm-sub)">{summaryFull(ymd)}</div>
      </div>
    </div>

    <div class="rounded-row border border-line bg-surface">
      <div class="flex items-center justify-between px-1.5 pt-2.5">
        <button type="button" class="flex h-10 w-10 items-center justify-center rounded-xl bg-(--soft-btn) text-text-soft" aria-label={t('Voriger Monat')} onclick={() => go(-1)}>
          <Icon name="chevron-left" size={18} stroke={2.2} />
        </button>
        <span class="text-[15px] font-extrabold" aria-live="polite">{monthTitle}</span>
        <button type="button" class="flex h-10 w-10 items-center justify-center rounded-xl bg-(--soft-btn) text-text-soft" aria-label={t('Nächster Monat')} onclick={() => go(1)}>
          <Icon name="chevron-right" size={18} stroke={2.2} />
        </button>
      </div>
      <div class="grid grid-cols-7 px-1.5 pt-2.5 text-center text-[12px] font-semibold text-fg2" aria-hidden="true">
        {#each weekdays as wd (wd)}<span>{wd}</span>{/each}
      </div>
      <div class="flex flex-col gap-1 px-1.5 pt-1.5 pb-2.5" role="grid" aria-label={monthTitle} tabindex="-1" onkeydown={dayKey}>
        {#each rows as row, r (r)}
          <div class="grid grid-cols-7 gap-1" role="row">
            {#each row as c (ymdKey(c.ymd))}
              {@const on = ymdKey(c.ymd) === ymdKey(ymd)}
              {@const isToday = ymdKey(c.ymd) === ymdKey(today)}
              <div role="gridcell" aria-selected={on}>
                <button
                  type="button"
                  data-day={ymdKey(c.ymd)}
                  aria-label="{dayOfMonth(c.ymd.d)} {names().monthsLong[c.ymd.m - 1]}{c.ymd.y === today.y ? '' : ` ${c.ymd.y}`}"
                  aria-pressed={on}
                  aria-current={isToday ? 'date' : undefined}
                  tabindex={on ? 0 : -1}
                  class="h-[42px] w-full rounded-xl text-[15px] font-semibold {on ? 'bg-accent-grad glow-day' : isToday ? 'shadow-[inset_0_0_0_1.5px_var(--sep)]' : ''} {!on && !c.inMonth ? 'text-ring' : ''}"
                  onclick={() => choose(c.ymd)}
                >{c.ymd.d}</button>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>

    <SectionHeader title={t('Uhrzeit')} />
    <div
      class="relative grid h-[180px] grid-cols-[1fr_auto_1fr] items-center overflow-hidden rounded-row border border-line bg-surface px-[30px]"
      role="group"
      aria-label={t('Uhrzeit {time}', { time: `${pad(hour)}:${pad(minute)}` })}
    >
      <span class="wheel-band pointer-events-none absolute inset-x-3 top-[68px] h-11 rounded-xl"></span>
      {@render wheelCol('h', t('Stunde'), HOURS, hourIndex)}
      <span class="relative text-[26px] font-extrabold" aria-hidden="true">:</span>
      {@render wheelCol('m', t('Minute'), minutes, minuteIndex)}
    </div>
  </div>
</Sheet>
