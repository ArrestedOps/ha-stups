<script lang="ts">
  import type { Snippet } from 'svelte';

  // Auswahl-Chip: normal, aktiv (Verlauf) oder Umriss (orange Rand). Nur mit Symbol: aria-label setzen.
  let {
    active = false,
    outline = false,
    small = false,
    photo = false,
    square = false,
    count,
    pressed,
    label,
    onclick,
    children,
  }: {
    active?: boolean;
    outline?: boolean;
    small?: boolean;
    /** der Chip beginnt mit einem Bild (32 px): weniger Rand links */
    photo?: boolean;
    /** nur ein Symbol: quadratisch (40 × 40, klein 34 × 34) */
    square?: boolean;
    /** Zähler hinter dem Text (zum Beispiel Karten dieser Person) */
    count?: number;
    /** für Chips, die sich ein- und ausschalten lassen (aria-pressed); ohne Angabe ein einfacher Knopf */
    pressed?: boolean;
    /** Beschriftung für Screenreader, wenn der Chip nur ein Symbol zeigt */
    label?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  class="inline-flex shrink-0 items-center gap-[7px] rounded-full border font-semibold whitespace-nowrap {small ? 'h-[34px] px-3 text-[13px]' : 'h-10 px-4 text-[15px]'} {photo ? 'pl-1' : ''} {square ? (small ? 'w-[34px] !px-0 justify-center' : 'w-10 !px-0 justify-center') : ''}
    {active ? 'bg-accent-grad glow-chip border-transparent' : outline ? 'border-accent bg-surface text-fg' : 'border-line-chip bg-surface text-text-soft'}"
  aria-label={label}
  aria-pressed={pressed}
  {onclick}
>
  {@render children()}
  {#if count !== undefined}
    <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 text-[11px] font-extrabold {active ? 'bg-(--count-on)' : 'bg-surface2 text-fg2'}">{count}</span>
  {/if}
</button>
