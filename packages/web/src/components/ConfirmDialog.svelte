<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { fade } from 'svelte/transition';
  import { ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Tile from './ui/Tile.svelte';

  const c = $derived(ui.confirm);
  const close = () => (ui.confirm = null);
  /** Eine Warnung (Standard) ist rot mit Papierkorb; eine freundliche Frage (`tone: 'primary'`) trägt die Farbe der App */
  const danger = $derived(c?.tone !== 'primary');
  const cancelLabel = $derived(c?.cancelLabel ?? t('Abbrechen'));

  /** Beim Öffnen springt der Fokus in den Dialog: bei einer Warnung auf „Abbrechen“ (sicher), bei einer Frage auf „Ja“ */
  function focusFirst(node: HTMLElement, preferred: boolean) {
    if (preferred) node.focus();
  }

  async function ok() {
    const run = c?.run;
    close();
    await run?.();
  }

  // Escape schließt nur die Rückfrage, nicht auch noch die Aufgabe dahinter
  function key(e: KeyboardEvent) {
    if (c && e.key === 'Escape') {
      e.stopImmediatePropagation();
      close();
    }
  }
</script>

<svelte:window onkeydowncapture={key} />

{#if c}
  <div class="fixed inset-0 z-[70] flex items-center justify-center px-6" transition:fade={{ duration: 120 }}>
    <button class="absolute inset-0 bg-(--scrim)" aria-label={cancelLabel} tabindex="-1" onclick={close}></button>
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={c.title}
      aria-describedby="confirm-text"
      class="border-line-chip relative flex w-full max-w-[342px] flex-col items-center gap-2.5 rounded-3xl border bg-surface px-[18px] pt-[22px] pb-4 text-center shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
    >
      {#if danger}
        <Tile color="red" size="lg" radius={16}><Icon name="trash" size={28} stroke={1.8} /></Tile>
      {:else}
        <Tile color="orange" size="lg" radius={16}><Icon name="robot" size={28} stroke={1.8} /></Tile>
      {/if}
      <h2 class="mt-1 text-[19px] font-extrabold">{c.title}</h2>
      <p id="confirm-text" class="text-[14px] leading-[1.5] text-fg2">{c.text}</p>
      <div class="mt-2 grid w-full grid-cols-2 gap-2">
        <button class="border-line-chip min-h-[50px] rounded-[14px] border bg-surface2 px-2 text-[15px] leading-tight font-bold" onclick={close} use:focusFirst={danger}>{cancelLabel}</button>
        {#if danger}
          <button class="bg-danger-grad min-h-[50px] rounded-[14px] px-2 text-[15px] leading-tight font-bold shadow-[0_6px_20px_color-mix(in_srgb,var(--danger)_35%,transparent)]" onclick={ok}>{c.label}</button>
        {:else}
          <button class="bg-accent-grad glow-cta min-h-[50px] rounded-[14px] px-2 text-[15px] leading-tight font-bold" onclick={ok} use:focusFirst={true}>{c.label}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
