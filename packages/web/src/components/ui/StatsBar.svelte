<script lang="ts" module>
  export interface Stat {
    id: string;
    label: string;
    value: number;
    icon?: string;
    /** Farbe der Zahl */
    tone?: 'accent' | 'danger' | 'ok';
  }
</script>

<script lang="ts">
  import Icon from '../Icon.svelte';

  // Leiste mit drei Zahlen (zum Beispiel heute fällig, überfällig, erledigt). Die Bezeichnung bleibt einzeilig.
  let { items, label }: { items: Stat[]; label: string } = $props();
</script>

<div class="grid grid-flow-col auto-cols-fr divide-x divide-line rounded-row border border-line bg-surface" role="group" aria-label={label}>
  {#each items as s (s.id)}
    <div class="flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <span class="flex items-center gap-1.5 text-[12px] font-semibold text-fg2">
        {#if s.icon}<Icon name={s.icon} size={14} />{/if}
        <span class="truncate">{s.label}</span>
      </span>
      <span class="text-[22px] leading-none font-extrabold tracking-tight {s.tone === 'accent' ? 'text-accent-text' : s.tone === 'danger' ? 'text-danger' : s.tone === 'ok' ? 'text-(--c-green-fg)' : ''}">{s.value}</span>
    </div>
  {/each}
</div>
