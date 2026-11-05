<script lang="ts">
  import { summaryParts } from '../lib/watcher-flow';
  import type { WatcherForm } from '../lib/watchers';

  /**
   * Der Wächter als ein Satz („Wenn die Waschmaschine unter 5 W liegt, bekommt …"): die Zusammenfassung in Schritt 4 und oben im Ablauf.
   * Nur zum Lesen; geändert wird in den Schritten und Karten. Entität, Schwelle, wer und Karte stehen fett.
   */
  let { form, personName }: { form: WatcherForm; personName: (id: string) => string } = $props();
  const parts = $derived(summaryParts(form, personName));
</script>

<p
  class="rounded-row border px-4 py-3.5 text-[14.5px] leading-[1.5]"
  style="background-image: var(--banner-warm); border-color: var(--banner-warm-line); color: var(--banner-warm-sub)"
  data-testid="watcher-sentence"
>
  {#each parts as p, i (i)}{#if p.bold}<b class="text-on-banner">{p.text}</b>{:else}{p.text}{/if}{/each}
</p>
