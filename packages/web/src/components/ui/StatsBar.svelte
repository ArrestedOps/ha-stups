<script lang="ts" module>
  export interface Stat {
    id: string;
    label: string;
    value: number;
    icon?: string;
    /** Farbe der Zahl (und des Symbols, außer bei „heute": dort bleibt das Symbol hell) */
    tone?: 'accent' | 'danger' | 'ok';
  }
</script>

<script lang="ts">
  import Icon from '../Icon.svelte';

  // Leiste mit drei Zahlen (zum Beispiel heute fällig, überfällig, erledigt): je Zelle links das Symbol, rechts Bezeichnung (einzeilig) und Zahl.
  // Mit `onselect` ist jede Zelle ein Knopf (44 px und höher, Vorlese-Name „Heute fällig, 3"), der das Blatt zur Zahl öffnet.
  let { items, label, onselect }: { items: Stat[]; label: string; onselect?: (id: string) => void } = $props();
  const value = (tone: Stat['tone']) => (tone === 'accent' ? 'text-sig-orange' : tone === 'danger' ? 'text-sig-red' : tone === 'ok' ? 'text-sig-green' : '');
  const iconTone = (tone: Stat['tone']) => (tone === 'danger' ? 'text-sig-red' : tone === 'ok' ? 'text-sig-green' : 'text-text-soft');
</script>

{#snippet cell(s: Stat)}
  {#if s.icon}<span class="inline-flex shrink-0 {iconTone(s.tone)}"><Icon name={s.icon} size={20} /></span>{/if}
  <span class="block min-w-0">
    <span class="block text-[12px] leading-[1.2] text-text-soft2">{s.label}</span>
    <span class="block text-[22px] leading-[1.1] font-extrabold {value(s.tone)}">{s.value}</span>
  </span>
{/snippet}

<div class="grid h-16 grid-flow-col auto-cols-fr divide-x divide-stat-line rounded-row border border-line bg-surface" role="group" aria-label={label}>
  {#each items as s (s.id)}
    {#if onselect}
      <button
        type="button"
        aria-label="{s.label}, {s.value}"
        data-testid="stat-{s.id}"
        class="flex h-full min-w-0 items-center gap-1.5 px-2 text-left first:rounded-l-[15px] last:rounded-r-[15px] active:bg-surface2"
        onclick={() => onselect(s.id)}
      >{@render cell(s)}</button>
    {:else}
      <div class="flex min-w-0 items-center gap-1.5 px-2" data-testid="stat-{s.id}">{@render cell(s)}</div>
    {/if}
  {/each}
</div>
