<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { sheetInsets, type SheetInsets } from '../lib/viewport';

  let {
    title = '',
    onclose,
    left,
    right,
    hideClose = false,
    children,
  }: {
    title?: string;
    onclose: () => void;
    /** ersetzt „Schließen" links oben */
    left?: Snippet;
    right?: Snippet;
    hideClose?: boolean;
    children: Snippet;
  } = $props();

  // Tastatur: das Sheet folgt der sichtbaren Fläche, damit das Feld nicht dahinter verschwindet
  let insets = $state<SheetInsets>({ bottom: 0, maxHeight: null });
  $effect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => (insets = sheetInsets(window.innerHeight, vv.height, vv.offsetTop));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  });

  /** Das angetippte Feld in die Mitte der sichtbaren Fläche holen, sobald die Tastatur steht */
  function keepFieldVisible(e: FocusEvent) {
    const el = e.target as HTMLElement;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  }

  // Wischen am Griff nach unten schließt das Sheet
  let startY = 0;
  let dy = $state(0);
  let dragging = $state(false);

  function down(e: PointerEvent) {
    startY = e.clientY;
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (dragging) dy = Math.max(0, e.clientY - startY);
  }
  function up() {
    dragging = false;
    if (dy > 100) onclose();
    dy = 0;
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-40">
  <button
    class="absolute inset-0 bg-(--scrim)"
    aria-label={t('Schließen')}
    tabindex="-1"
    onclick={onclose}
    transition:fade={{ duration: 150 }}
  ></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title || t('Details')}
    class="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-sheet border-t border-line bg-bg lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[480px] lg:rounded-none lg:border-t-0 lg:border-l"
    style:transform={dy ? `translateY(${dy}px)` : undefined}
    style:transition={dragging ? 'none' : undefined}
    style:bottom={insets.bottom ? `${insets.bottom}px` : undefined}
    style:max-height={insets.maxHeight ? `${insets.maxHeight}px` : undefined}
    transition:fly={{ y: 500, duration: 220 }}
  >
    <div
      class="flex touch-none justify-center pt-2 pb-1 lg:hidden"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      role="presentation"
    >
      <span class="h-[5px] w-10 rounded-full bg-track"></span>
    </div>
    <div class="flex items-center justify-between px-2 pt-1">
      {#if left}
        {@render left()}
      {:else if !hideClose}
        <button class="min-h-11 px-3 text-[16px] font-semibold text-accent-text" onclick={onclose}>{t('Schließen')}</button>
      {:else}
        <span></span>
      {/if}
      {#if title}<span class="truncate text-[17px] font-extrabold">{title}</span>{/if}
      <div class="flex min-w-[88px] justify-end">{@render right?.()}</div>
    </div>
    <div
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(16px,var(--safe-bottom))]"
      onfocusin={keepFieldVisible}
    >
      {@render children()}
    </div>
  </div>
</div>
