<script lang="ts">
  import type { Snippet } from 'svelte';

  let { label, children, stack = false }: { label?: string; children: Snippet; stack?: boolean } = $props();
</script>

<div class="flex min-h-[46px] gap-3 px-4 py-1.5 {stack ? 'flex-col py-3' : 'items-center justify-between'}">
  {#if label}<span class="shrink-0 text-[17px]">{label}</span>{/if}
  <div class="min-w-0 {stack ? '' : 'flex justify-end text-right'}">{@render children()}</div>
</div>
