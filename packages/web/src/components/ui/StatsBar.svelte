<script lang="ts" module>
  export interface Stat {
    id: string;
    label: string;
    value: number;
    icon?: string;
    /** Farbe der Kachel mit dem Symbol; ohne Angabe nach `tone` */
    color?: 'orange' | 'blue' | 'red' | 'green' | 'gray' | 'purple' | 'teal';
    /** Farbe der Zahl (und des Symbols, außer bei „heute": dort bleibt das Symbol hell) */
    tone?: 'accent' | 'danger' | 'ok';
  }
</script>

<script lang="ts">
  import Icon from '../Icon.svelte';

  // Vier Kacheln (zwei mal zwei): links das Symbol in einer Farbfläche, rechts die Zahl, darunter die Bezeichnung.
  // Mit `onselect` ist jede Kachel ein Knopf (Vorlese-Name „Heute fällig, 3"), der das Blatt zur Zahl öffnet.
  let { items, label, onselect }: { items: Stat[]; label: string; onselect?: (id: string) => void } = $props();
  const color = (s: Stat) => s.color ?? (s.tone === 'danger' ? 'red' : s.tone === 'ok' ? 'green' : 'orange');
</script>

{#snippet cell(s: Stat)}
  <span class="flex w-full items-start justify-between">
    <span class="tile tile-{color(s)} h-[30px] w-[30px] rounded-full"><Icon name={s.icon ?? 'list'} size={17} stroke={2} /></span>
    <span class="text-[28px] leading-none font-bold tabular-nums">{s.value}</span>
  </span>
  <span class="block text-[14px] leading-[1.2] font-medium text-fg2">{s.label}</span>
{/snippet}

<div class="grid grid-cols-2 gap-2" role="group" aria-label={label}>
  {#each items as s (s.id)}
    {#if onselect}
      <button
        type="button"
        aria-label="{s.label}, {s.value}"
        data-testid="stat-{s.id}"
        class="flex min-h-[74px] min-w-0 flex-col justify-between gap-2 rounded-row bg-surface p-3 text-left transition-transform active:scale-[0.98]"
        onclick={() => onselect(s.id)}
      >{@render cell(s)}</button>
    {:else}
      <div class="flex min-h-[74px] min-w-0 flex-col justify-between gap-2 rounded-row bg-surface p-3" data-testid="stat-{s.id}">{@render cell(s)}</div>
    {/if}
  {/each}
</div>
