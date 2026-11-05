<script lang="ts">
  import type { Snippet } from 'svelte';

  // Fuß eines Sheets (wie `.foot` im Mockup): der große Knopf liegt unten fest über dem Inhalt, auf einem Verlauf, der ihn ausblendet.
  // Das Sheet setzt ihn über seinen Bereich `footer` ein (das Sheet ist der Bezugspunkt der Positionierung).
  let { children }: { children: Snippet } = $props();
</script>

<div class="pointer-events-none absolute inset-x-0 bottom-0 px-3 pt-[22px] pb-[var(--pad-bottom)]" style="background-image: linear-gradient(to bottom, transparent, var(--bg) 34%)">
  <div class="pointer-events-auto">{@render children()}</div>
</div>
