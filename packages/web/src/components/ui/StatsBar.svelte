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

  // Leiste mit drei Zahlen (zum Beispiel heute fällig, überfällig, erledigt): je Zelle links das Symbol, rechts Bezeichnung (einzeilig) und Zahl
  let { items, label }: { items: Stat[]; label: string } = $props();
  const value = (tone: Stat['tone']) => (tone === 'accent' ? 'text-sig-orange' : tone === 'danger' ? 'text-sig-red' : tone === 'ok' ? 'text-sig-green' : '');
  const iconTone = (tone: Stat['tone']) => (tone === 'danger' ? 'text-sig-red' : tone === 'ok' ? 'text-sig-green' : 'text-text-soft');
</script>

<div class="grid h-16 grid-flow-col auto-cols-fr divide-x divide-stat-line rounded-row border border-line bg-surface" role="group" aria-label={label}>
  {#each items as s (s.id)}
    <div class="flex min-w-0 items-center gap-2 px-2.5">
      {#if s.icon}<span class="inline-flex shrink-0 {iconTone(s.tone)}"><Icon name={s.icon} size={20} /></span>{/if}
      <div class="min-w-0">
        <div class="truncate text-[12px] leading-[1.2] whitespace-nowrap text-text-soft2">{s.label}</div>
        <div class="text-[22px] leading-[1.1] font-extrabold {value(s.tone)}">{s.value}</div>
      </div>
    </div>
  {/each}
</div>
