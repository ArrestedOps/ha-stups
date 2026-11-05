<script lang="ts">
  import type { Snippet } from 'svelte';

  // Kleiner Knopf (34 px hoch, Rundung 12) für eine Aktion in einer Zeile oder unter einer Liste („Morgen", „Rückgängig", „Alle auf heute").
  // `primary` ist die hervorgehobene Fassung mit Verlauf; sonst ruhig auf der zweiten Fläche.
  let {
    primary = false,
    disabled = false,
    label,
    onclick,
    children,
  }: { primary?: boolean; disabled?: boolean; label?: string; onclick?: (e: MouseEvent) => void; children: Snippet } = $props();
</script>

<button
  type="button"
  {disabled}
  aria-label={label}
  class="inline-flex h-[34px] shrink-0 items-center gap-[5px] rounded-[12px] px-[11px] text-[13px] font-bold whitespace-nowrap disabled:opacity-40 {primary ? 'bg-accent-grad glow-pill' : 'bg-surface2 text-text-soft'}"
  {onclick}
>
  {@render children()}
</button>
