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
  class="flex h-[52px] w-full items-center justify-center gap-2 rounded-btn text-[17px] font-semibold disabled:opacity-40 {ghost ? 'bg-surface text-accent-text' : 'bg-accent-grad'}"
  {onclick}
>
  {@render children()}
</button>
