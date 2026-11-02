<script lang="ts">
  import type { QuickResult } from '../lib/quickadd';
  import { chipLabel } from '../lib/quickadd/labels';
  import Icon from './Icon.svelte';

  /** Vorschau unter der Schnell-Zeile: was erkannt wurde. Ein Tipp auf einen Chip nimmt ihn zurück (der Text bleibt dann im Titel). */
  let { result, tz, ondrop }: { result: QuickResult; tz: string; ondrop: (id: string) => void } = $props();
</script>

{#if result.tokens.length > 0}
  <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Erkannt" data-testid="quick-chips">
    {#each result.tokens as t (t.id + ':' + t.start)}
      {@const label = chipLabel(t, result, tz)}
      {@const warn = t.status === 'unknown' || t.status === 'ambiguous'}
      <button
        type="button"
        class="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold {warn ? 'bg-danger-bg text-danger' : 'bg-accent/20 text-accent-text'}"
        data-testid="quick-chip"
        data-kind={t.kind}
        data-status={t.status}
        aria-label="{label}: zurücknehmen"
        title="Antippen nimmt es zurück"
        onclick={() => ondrop(t.id)}
      >
        {label}<Icon name="x" size={12} stroke={2.8} />
      </button>
    {/each}
  </div>
{/if}
