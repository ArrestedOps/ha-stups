<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, hint, children }: { title?: string; hint?: string; children: Snippet } = $props();
</script>

<section class="mt-5">
  {#if title}<h3 class="mb-1.5 px-3 text-[13px] font-semibold tracking-wide text-fg2 uppercase">{title}</h3>{/if}
  <div class="divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-surface">
    {@render children()}
  </div>
  {#if hint}<p class="mt-1.5 px-3 text-[13px] text-fg2">{hint}</p>{/if}
</section>
