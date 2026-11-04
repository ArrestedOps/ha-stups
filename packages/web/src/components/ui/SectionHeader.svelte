<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  // Abschnittskopf: Symbol, Titel, Zähler; auf Wunsch einklappbar (der Aufrufer hält `open`)
  let {
    title,
    count,
    icon,
    open,
    large = false,
    tone,
    ontoggle,
    children,
  }: {
    title: string;
    count?: number;
    icon?: string;
    /** gesetzt: der Kopf ist ein Knopf zum Ein- und Ausklappen */
    open?: boolean;
    large?: boolean;
    /** Farbe der Überschrift: Gefahr (überfällig) oder Haus (Türkis, immer mit Wort oder Zeichen dazu) */
    tone?: 'danger' | 'house';
    ontoggle?: () => void;
    /** Platz rechts, zum Beispiel ein kleiner Knopf */
    children?: Snippet;
  } = $props();
  const collapsible = $derived(open !== undefined);
  const toneClass = $derived(tone === 'danger' ? 'text-danger' : tone === 'house' ? 'text-house' : '');
</script>

<div class="flex h-[34px] items-center gap-2 px-1 {toneClass}">
  {#if collapsible}
    <button type="button" class="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} onclick={ontoggle}>
      {#if icon}<Icon name={icon} size={18} />{/if}
      <h2 class="truncate font-extrabold tracking-tight {large ? 'text-[19px]' : 'text-[17px]'}">{title}</h2>
      {#if count !== undefined}<span class="inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-surface2 px-2 text-[12px] font-bold">{count}</span>{/if}
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
    </button>
  {:else}
    <div class="flex min-w-0 flex-1 items-center gap-2">
      {#if icon}<Icon name={icon} size={18} />{/if}
      <h2 class="truncate font-extrabold tracking-tight {large ? 'text-[19px]' : 'text-[17px]'}">{title}</h2>
      {#if count !== undefined}<span class="inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-surface2 px-2 text-[12px] font-bold">{count}</span>{/if}
    </div>
  {/if}
  {@render children?.()}
</div>
