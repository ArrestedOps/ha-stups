<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';

  /**
   * Die Leiste unten, solange Einträge ausgewählt werden (Wächter-Liste, „Gefunden“): „{n} ausgewählt“, die Aktionen als Knöpfe und
   * „Fertig“ zum Beenden. Ohne Auswahl sind die Aktionen aus. Sie liegt über der Tab-Leiste und lässt sich per `bottom` verschieben, wenn
   * sie in einem Fenster steht (dort ohne Tab-Leiste).
   */
  let {
    count,
    actions,
    ondone,
    inSheet = false,
  }: {
    count: number;
    actions: { id: string; label: string; run: () => void; tone?: 'danger'; disabled?: boolean }[];
    ondone: () => void;
    /** in einem Fenster (Gefunden): am unteren Rand des Fensters, nicht über der Tab-Leiste */
    inSheet?: boolean;
  } = $props();
</script>

<div
  class="pointer-events-none {inSheet ? 'sticky bottom-0 z-20 -mx-1 px-1 pt-2 pb-[var(--pad-bottom)]' : 'fixed inset-x-0 bottom-[calc(var(--nav-h)+10px)] z-30 px-3 lg:bottom-4 lg:left-auto lg:px-0 lg:right-6'}"
  data-testid="selection-bar"
>
  <div
    class="pointer-events-auto mx-auto flex max-w-[720px] flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[20px] border border-line bg-surface px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.35)] lg:max-w-none"
    role="toolbar"
    aria-label={t('Sammelaktionen')}
  >
    <span class="mr-auto min-w-0 px-1 text-[15px] font-extrabold" aria-live="polite" data-testid="selection-count">{tn('{n} ausgewählt', '{n} ausgewählt', count)}</span>
    {#each actions as a (a.id)}
      <button
        type="button"
        class="flex h-11 items-center rounded-row border px-3.5 text-[14px] font-bold disabled:opacity-40 {a.tone === 'danger' ? 'border-danger text-danger' : 'border-line bg-surface2 text-fg'}"
        disabled={count === 0 || a.disabled}
        data-testid="selection-{a.id}"
        onclick={a.run}
      >
        {a.label}
      </button>
    {/each}
    <button type="button" class="flex h-11 items-center rounded-row px-3 text-[14px] font-bold text-accent-text" data-testid="selection-done" onclick={ondone}>{t('Fertig')}</button>
  </div>
</div>
