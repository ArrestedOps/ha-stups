<script lang="ts">
  import type { Snippet } from 'svelte';

  // Auswahl-Chip: normal, aktiv (Verlauf) oder Umriss (orange Rand). Nur mit Symbol: aria-label setzen.
  let {
    active = false,
    outline = false,
    small = false,
    pressed,
    label,
    onclick,
    children,
  }: {
    active?: boolean;
    outline?: boolean;
    small?: boolean;
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
  class="inline-flex shrink-0 items-center gap-[7px] rounded-full border font-semibold whitespace-nowrap {small ? 'h-[34px] px-3 text-[13px]' : 'h-10 px-4 text-[15px]'}
    {active ? 'bg-accent-grad border-transparent' : outline ? 'border-accent bg-surface text-fg' : 'border-line bg-surface text-fg'}"
  aria-label={label}
  aria-pressed={pressed}
  {onclick}
>
  {@render children()}
</button>
