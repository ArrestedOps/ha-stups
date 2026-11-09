<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';

  /**
   * Der Rahmen eines Schritts der Einrichtung: ein Gedanke (Überschrift, ein kurzer Satz), der Inhalt scrollt, der Fuß mit dem
   * Hauptknopf bleibt stehen. Die Überschrift bekommt beim Öffnen den Fokus, damit Screenreader den neuen Schritt ansagen.
   */
  let { title, lead, children, footer }: { title: string; lead?: string; children: Snippet; footer?: Snippet } = $props();
  let heading = $state<HTMLElement | null>(null);
  onMount(() => heading?.focus({ preventScroll: true }));
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-4 lg:px-10 lg:pt-6">
    <h1 bind:this={heading} tabindex="-1" class="text-[26px] leading-[1.15] font-extrabold outline-none lg:text-[30px]">{title}</h1>
    {#if lead}<p class="mt-2 text-[15px] leading-[1.45] text-fg2">{lead}</p>{/if}
    <div class="mt-5">{@render children()}</div>
  </div>
  {#if footer}
    <div class="flex shrink-0 flex-col gap-2 px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] lg:px-10 lg:pb-8">{@render footer()}</div>
  {/if}
</div>
