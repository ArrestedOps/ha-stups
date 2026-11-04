<script lang="ts">
  import type { Snippet } from 'svelte';

  // Großer Knopf (56 px, Rundung 18): am Fuß eines Sheets. `ghost` ist die ruhige Fassung ohne Verlauf.
  let {
    ghost = false,
    disabled = false,
    type = 'button',
    onclick,
    children,
  }: { ghost?: boolean; disabled?: boolean; type?: 'button' | 'submit'; onclick?: (e: MouseEvent) => void; children: Snippet } = $props();
</script>

<button
  {type}
  {disabled}
  class="flex h-14 w-full items-center justify-center gap-2 rounded-btn text-[17px] font-extrabold disabled:opacity-40 {ghost ? 'border border-line bg-surface text-fg' : 'bg-accent-grad glow-cta'}"
  {onclick}
>
  {@render children()}
</button>
