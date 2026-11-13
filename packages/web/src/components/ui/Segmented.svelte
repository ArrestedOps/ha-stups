<script lang="ts" module>
  export interface SegmentItem {
    id: string;
    label: string;
    /** Symbol vor dem Text (Name aus Icon.svelte) */
    icon?: string;
  }
</script>

<script lang="ts">
  import { scrollStrip } from '../../lib/scrollStrip';
  import Icon from '../Icon.svelte';

  // Umschalter: aktives Segment mit Verlauf. `tabs` für Spalten und Reiter (role="tab"), sonst eine Auswahl (role="radio").
  // `scroll` für viele Einträge: sie bleiben lesbar und die Leiste wischt seitlich (statt gleich breiter Spalten).
  let {
    items,
    value,
    label,
    kind = 'choice',
    small = false,
    scroll = false,
    large = false,
    disabled = false,
    onchange,
  }: {
    items: SegmentItem[];
    value: string | null;
    label: string;
    kind?: 'choice' | 'tabs';
    small?: boolean;
    scroll?: boolean;
    /** Schrift 15 statt 14 px (Neue Aufgabe: Priorität) */
    large?: boolean;
    disabled?: boolean;
    onchange: (id: string) => void;
  } = $props();
</script>

<div
  class="no-scrollbar gap-0.5 rounded-[10px] bg-surface2 p-0.5 {small ? 'h-9' : 'h-11'} {scroll ? 'flex overflow-x-auto' : 'grid grid-flow-col auto-cols-fr'}"
  role={kind === 'tabs' ? 'tablist' : 'radiogroup'}
  aria-label={label}
  use:scrollStrip={value}
>
  {#each items as item (item.id)}
    {@const on = item.id === value}
    <button
      type="button"
      role={kind === 'tabs' ? 'tab' : 'radio'}
      aria-selected={kind === 'tabs' ? on : undefined}
      aria-checked={kind === 'choice' ? on : undefined}
      class="inline-flex min-h-0 items-center justify-center gap-1.5 rounded-[8px] {large ? 'text-[15px]' : 'text-[13px]'} whitespace-nowrap {scroll ? 'px-3' : 'px-0.5'} {scroll ? 'shrink-0 flex-1' : ''} {on ? 'seg-on font-semibold' : 'text-fg'} {disabled ? 'opacity-60' : ''}"
      {disabled}
      onclick={() => onchange(item.id)}
    >
      {#if item.icon}<Icon name={item.icon} size={16} stroke={2} />{/if}{item.label}
    </button>
  {/each}
</div>
