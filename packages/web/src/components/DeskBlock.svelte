<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Ein Block im Formular „Neuer Wächter“ am Desktop: Fläche mit Rand, oben eine Nummer in der Akzentfarbe und der Titel („Wenn“, „Dann“,
   * „Wer bekommt die Karte?“), darunter der Inhalt. Der Block ist eine Region mit dem Titel als Namen.
   */
  let { n, title, testid, children }: { n: number; title: string; testid?: string; children: Snippet } = $props();
  const uid = $props.id();
</script>

<section class="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-line bg-surface px-4 py-4" aria-labelledby="{uid}-t" data-testid={testid}>
  <h3 class="flex items-center gap-2.5 text-[17px] font-extrabold tracking-tight" id="{uid}-t">
    <span class="bg-accent-grad flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full !shadow-none text-[13px] font-extrabold" aria-hidden="true">{n}</span>
    {title}
  </h3>
  {@render children()}
</section>
