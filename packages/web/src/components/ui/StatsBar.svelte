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
  // Desktop (`desk`): vier Kacheln nebeneinander, Bezeichnung über der Zahl, ohne Symbol; die Zahl der Überfälligen ist rot. `selected` markiert die
  // Kachel, die gerade die Liste filtert (ein Klick darauf hebt den Filter wieder auf).
  let { items, label, onselect, desk = false, selected = null }: { items: Stat[]; label: string; onselect?: (id: string) => void; desk?: boolean; selected?: string | null } = $props();
  const color = (s: Stat) => s.color ?? (s.tone === 'danger' ? 'red' : s.tone === 'ok' ? 'green' : 'orange');
</script>

{#snippet cell(s: Stat)}
  <span class="flex w-full items-start justify-between">
    <span class="tile tile-{color(s)} h-[30px] w-[30px] rounded-full"><Icon name={s.icon ?? 'list'} size={17} stroke={2} /></span>
    <span class="text-[28px] leading-none font-bold tabular-nums">{s.value}</span>
  </span>
  <span class="block text-[14px] leading-[1.2] font-medium text-fg2">{s.label}</span>
{/snippet}

{#snippet deskCell(s: Stat)}
  <span class="flex items-center justify-between text-[13px] leading-tight font-semibold text-fg2">{s.label}{#if selected === s.id}<Icon name="x" size={14} stroke={2.4} />{/if}</span>
  <span class="text-[30px] leading-[1.1] font-extrabold tracking-tight tabular-nums {s.tone === 'danger' && s.value > 0 ? 'text-danger' : ''}">{s.value}</span>
{/snippet}

<div class="grid gap-2 {desk ? 'grid-cols-4 !gap-3' : 'grid-cols-2'}" role="group" aria-label={label}>
  {#each items as s (s.id)}
    {#if desk}
      <button
        type="button"
        aria-label="{s.label}, {s.value}"
        aria-pressed={selected === s.id}
        data-testid="desk-stat-{s.id}"
        class="flex min-h-[76px] min-w-0 flex-col gap-0.5 rounded-row bg-surface px-4 py-3 text-left shadow-[0_0_0_0.5px_var(--sep)] hover:shadow-[0_0_0_1px_var(--sep)] {selected === s.id ? '!shadow-[0_0_0_2px_var(--accent)]' : ''}"
        onclick={() => onselect?.(s.id)}
      >{@render deskCell(s)}</button>
    {:else if onselect}
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
