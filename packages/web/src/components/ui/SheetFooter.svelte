<script lang="ts">
  import type { Snippet } from 'svelte';

  // Fuß eines Sheets: der große Knopf auf einem Verlauf, der den Inhalt dahinter ausblendet
  let { children }: { children: Snippet } = $props();
</script>

<div class="pointer-events-none sticky bottom-0 -mx-4 px-3 pt-5 pb-[max(16px,var(--safe-bottom))]" style="background-image: linear-gradient(to bottom, transparent, var(--bg) 34%)">
  <div class="pointer-events-auto">{@render children()}</div>
</div>
