<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade } from 'svelte/transition';
  import { t } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';

  /**
   * Der Rahmen der Dialoge zum Board (Löschen, Archivieren, Duplizieren, Vorlage): eine Karte in der Mitte, dahinter der Schleier, unten
   * „Abbrechen" und die eigentliche Aktion. Escape und Tippen auf den Schleier schließen nur den Dialog, nicht das Fenster dahinter.
   */
  let {
    title,
    sub,
    testid,
    onclose,
    wideOnDesktop = false,
    children,
    footer,
  }: {
    title: string;
    sub?: string;
    testid: string;
    onclose: () => void;
    wideOnDesktop?: boolean;
    children?: Snippet;
    footer: Snippet;
  } = $props();

  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onclose();
  }
</script>

<svelte:window onkeydowncapture={key} />

<div class="fixed inset-0 z-[70] flex items-center justify-center px-4" transition:fade={{ duration: 120 }}>
  <button class="absolute inset-0 bg-(--scrim)" aria-label={t('Abbrechen')} tabindex="-1" onclick={onclose}></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    data-testid={testid}
    class="border-line-chip relative flex max-h-[90vh] w-full flex-col gap-3 overflow-y-auto rounded-3xl border bg-surface px-4 pt-5 pb-4 shadow-[0_20px_60px_rgba(0,0,0,0.7)] {ui.desktop && wideOnDesktop ? 'max-w-[560px]' : 'max-w-[420px]'}"
  >
    <div>
      <h2 class="text-[20px] leading-tight font-extrabold wrap-anywhere">{title}</h2>
      {#if sub}<p class="mt-1 text-[14px] leading-[1.45] text-fg2">{sub}</p>{/if}
    </div>
    {@render children?.()}
    <div class="mt-1 grid grid-cols-2 gap-2">{@render footer()}</div>
  </div>
</div>
