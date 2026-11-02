<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { QuickResult } from '../lib/quickadd';
  import { chipLabel } from '../lib/quickadd/labels';
  import Icon from './Icon.svelte';

  /** Vorschau unter der Schnell-Zeile: was erkannt wurde. Ein Tipp auf einen Chip nimmt ihn zurück (der Text bleibt dann im Titel). */
  let { result, tz, ondrop }: { result: QuickResult; tz: string; ondrop: (id: string) => void } = $props();
</script>

{#if result.tokens.length > 0}
  <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('Erkannt')} data-testid="quick-chips">
    {#each result.tokens as tok (tok.id + ':' + tok.start)}
      {@const label = chipLabel(tok, result, tz)}
      {@const warn = tok.status === 'unknown' || tok.status === 'ambiguous'}
      <button
        type="button"
        class="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold {warn ? 'bg-danger-bg text-danger' : 'bg-accent/20 text-accent-text'}"
        data-testid="quick-chip"
        data-kind={tok.kind}
        data-status={tok.status}
        aria-label={t('{label}: zurücknehmen', { label })}
        title={t('Antippen nimmt es zurück')}
        onclick={() => ondrop(tok.id)}
      >
        {label}<Icon name="x" size={12} stroke={2.8} />
      </button>
    {/each}
  </div>
{/if}
