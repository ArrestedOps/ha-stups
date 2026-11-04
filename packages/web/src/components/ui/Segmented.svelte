<script lang="ts" module>
  export interface SegmentItem {
    id: string;
    label: string;
  }
</script>

<script lang="ts">
  import { scrollStrip } from '../../lib/scrollStrip';

  // Umschalter: aktives Segment mit Verlauf. `tabs` für Spalten und Reiter (role="tab"), sonst eine Auswahl (role="radio").
  // `scroll` für viele Einträge: sie bleiben lesbar und die Leiste wischt seitlich (statt gleich breiter Spalten).
  let {
    items,
    value,
    label,
    kind = 'choice',
    small = false,
    scroll = false,
    onchange,
  }: {
    items: SegmentItem[];
    value: string | null;
    label: string;
    kind?: 'choice' | 'tabs';
    small?: boolean;
    scroll?: boolean;
    onchange: (id: string) => void;
  } = $props();
</script>

<div
  class="no-scrollbar gap-0.5 rounded-row border border-line bg-surface p-1 {small ? 'h-11' : 'h-[52px]'} {scroll ? 'flex overflow-x-auto' : 'grid grid-flow-col auto-cols-fr'}"
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
      class="inline-flex min-h-0 items-center justify-center gap-1.5 rounded-[12px] px-3 text-[14px] whitespace-nowrap {scroll ? 'shrink-0 flex-1' : ''} {on ? 'bg-accent-grad font-bold' : 'text-fg2'}"
      onclick={() => onchange(item.id)}
    >
      {item.label}
    </button>
  {/each}
</div>
