<script lang="ts">
  import type { Snippet } from 'svelte';

  // Abschnitt der Einstellungen: Titel wie die Abschnittsköpfe (17 px fett), darunter die Zeilen in einer Box, optional ein Hinweis
  let { title, hint, children }: { title?: string; hint?: string; children: Snippet } = $props();
</script>

<section class="mt-3.5">
  {#if title}<h3 class="flex h-[34px] items-center px-1 text-[17px] font-extrabold tracking-tight">{title}</h3>{/if}
  <div class="divide-y divide-line overflow-hidden rounded-row border border-line bg-surface">
    {@render children()}
  </div>
  {#if hint}<p class="mt-1.5 px-1 text-[12.5px] leading-[1.45] text-hint">{hint}</p>{/if}
</section>
