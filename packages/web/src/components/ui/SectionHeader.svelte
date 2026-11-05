<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  // Abschnittskopf: Symbol, Titel, Zähler; auf Wunsch einklappbar (der Aufrufer hält `open`), der Pfeil steht dann ganz rechts
  let {
    title,
    count,
    icon,
    iconTone,
    open,
    large = false,
    tone,
    ontoggle,
    children,
  }: {
    title: string;
    count?: number | string;
    icon?: string;
    /** Farbe des Symbols (heute orange, überfällig rot, diese Woche blau, später hell); ohne Angabe wie die Überschrift */
    iconTone?: 'orange' | 'red' | 'blue' | 'green' | 'soft';
    /** gesetzt: der Kopf ist ein Knopf zum Ein- und Ausklappen */
    open?: boolean;
    /** Aufgaben: Titel 19 px und Kopf 36 px hoch, sonst 17 und 34 */
    large?: boolean;
    /** Farbe der Überschrift: Gefahr (überfällig) oder Haus (Türkis, immer mit Wort oder Zeichen dazu) */
    tone?: 'danger' | 'house';
    ontoggle?: () => void;
    /** Platz rechts, zum Beispiel ein kleiner Knopf */
    children?: Snippet;
  } = $props();
  const collapsible = $derived(open !== undefined);
  const toneClass = $derived(tone === 'danger' ? 'text-danger' : tone === 'house' ? 'text-house' : '');
  const iconClass = $derived(
    iconTone === 'orange' ? 'text-sig-orange' : iconTone === 'red' ? 'text-sig-red' : iconTone === 'blue' ? 'text-sig-blue' : iconTone === 'green' ? 'text-sig-green' : iconTone === 'soft' ? 'text-text-soft' : '',
  );
</script>

{#snippet head()}
  {#if icon}<span class="inline-flex shrink-0 {iconClass}"><Icon name={icon} size={22} stroke={1.9} /></span>{/if}
  <h2 class="truncate font-extrabold tracking-tight {large ? 'text-[19px]' : 'text-[17px]'}">{title}</h2>
  {#if count !== undefined}<span class="inline-flex h-[22px] min-w-6 shrink-0 items-center justify-center rounded-full bg-count px-2 text-text-soft font-bold {large ? 'text-[13px]' : 'text-[12px]'}">{count}</span>{/if}
{/snippet}

<div class="flex items-center gap-2 px-1 {large ? 'h-9' : 'h-[34px]'} {toneClass}">
  {#if collapsible}
    <button type="button" class="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} onclick={ontoggle}>
      {@render head()}
      <span class="flex-1"></span>
      <span class="flex h-11 w-7 shrink-0 items-center justify-center text-text-soft2"><Icon name={open ? 'chevron-down' : 'chevron-up'} size={20} stroke={2} /></span>
    </button>
  {:else}
    <div class="flex min-w-0 flex-1 items-center gap-2">{@render head()}</div>
  {/if}
  {@render children?.()}
</div>
