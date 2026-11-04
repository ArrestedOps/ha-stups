<script lang="ts" module>
  export type RowVariant = 'task' | 'setting' | 'danger';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  /**
   * Die eine Zeile für Aufgaben, Board-Karten, Wächter und Einstellungen: 68 px hoch, links optional der
   * Erledigt-Kreis und die Symbol-Kachel, Titel einzeilig, darunter die Meta-Zeile, rechts **genau ein** Element
   * (`right`: Foto, Stupsen, Pfeil, Zähler, Schalter, Wert oder kleiner Knopf).
   * Der Antippbereich (Kachel, Titel, Meta) ist ein Knopf, wenn `onclick` gesetzt ist, ein Link bei `href`.
   */
  let {
    title,
    variant = 'setting',
    strike = false,
    tile,
    meta,
    right,
    check,
    onclick,
    href,
  }: {
    title: string;
    variant?: RowVariant;
    /** durchgestrichener Titel: erledigt */
    strike?: boolean;
    tile?: Snippet;
    meta?: Snippet;
    right?: Snippet;
    /** Erledigt-Kreis links (Tippfläche 32 × 44) */
    check?: { done: boolean; label: string; onchange: () => void };
    onclick?: (e: MouseEvent) => void;
    href?: string;
  } = $props();
</script>

<div
  class="flex h-row w-full items-center gap-3 rounded-row border border-line bg-surface text-fg {check ? 'gap-2.5 pr-2 pl-0.5' : 'pr-2.5 pl-3'}"
  data-variant={variant}
>
  {#if check}
    <button type="button" role="checkbox" aria-checked={check.done} aria-label={check.label} class="-mr-0.5 flex h-11 w-8 shrink-0 items-center justify-center" onclick={check.onchange}>
      {#if check.done}
        <span class="bg-accent-grad flex h-[22px] w-[22px] items-center justify-center rounded-full !shadow-none"><Icon name="check" size={14} /></span>
      {:else}
        <span class="h-[22px] w-[22px] rounded-full border-2 border-hint"></span>
      {/if}
    </button>
  {/if}

  {#snippet body()}
    {#if tile}{@render tile()}{/if}
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate text-[15px] font-bold tracking-tight {variant === 'danger' ? 'text-danger' : ''} {strike ? 'text-hint line-through' : ''}">{title}</span>
      {#if meta}<span class="flex items-center gap-1.5 truncate text-[13px] text-fg2">{@render meta()}</span>{/if}
    </span>
  {/snippet}

  {#if href}
    <a {href} class="flex h-full min-w-0 flex-1 items-center gap-3 text-left">{@render body()}</a>
  {:else if onclick}
    <button type="button" class="flex h-full min-w-0 flex-1 items-center gap-3 text-left" {onclick}>{@render body()}</button>
  {:else}
    <div class="flex h-full min-w-0 flex-1 items-center gap-3">{@render body()}</div>
  {/if}

  {#if right}<span class="flex shrink-0 items-center">{@render right()}</span>{/if}
</div>
