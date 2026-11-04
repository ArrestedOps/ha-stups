<script lang="ts">
  import type { Snippet } from 'svelte';

  // Hinweis-Banner in der Höhe der Zeile: lila (Stups, Hinweise) oder warm. Mit `onclick` ein Knopf, sonst eine Fläche.
  let {
    title,
    sub,
    variant = 'purple',
    wrap = false,
    leading,
    trailing,
    onclick,
  }: {
    title: string;
    sub?: string;
    variant?: 'purple' | 'warm';
    /** der Titel darf auf zwei Zeilen umbrechen (lange Hinweise), sonst wird er abgeschnitten */
    wrap?: boolean;
    leading?: Snippet;
    trailing?: Snippet;
    onclick?: (e: MouseEvent) => void;
  } = $props();
  const style = $derived(`background-image: var(--banner-${variant}); border-color: var(--banner-${variant}-line)`);
</script>

{#snippet inner()}
  {#if leading}<span class="flex h-11 w-11 shrink-0 items-center justify-center">{@render leading()}</span>{/if}
  <span class="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
    <span class="text-[15px] leading-tight font-bold {wrap ? 'line-clamp-2' : 'truncate'}">{title}</span>
    {#if sub}<span class="truncate text-[13px]" style:color="var(--banner-{variant}-sub)">{sub}</span>{/if}
  </span>
  {#if trailing}<span class="flex shrink-0 items-center">{@render trailing()}</span>{/if}
{/snippet}

{#if onclick}
  <button type="button" class="flex h-row w-full items-center gap-2.5 rounded-row border pr-2.5 pl-2 text-on-banner" {style} {onclick}>{@render inner()}</button>
{:else}
  <div class="flex h-row w-full items-center gap-2.5 rounded-row border pr-2.5 pl-2 text-on-banner" {style}>{@render inner()}</div>
{/if}
