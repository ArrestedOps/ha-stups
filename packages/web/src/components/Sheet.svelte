<script lang="ts" module>
  /** Offene Sheets, das oberste zuletzt: Escape schließt nur das oberste (ein Sheet über einem Sheet, zum Beispiel Symbol wählen über Neue Aufgabe) */
  const stack: symbol[] = [];
</script>

<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { sheetInsets, type SheetInsets } from '../lib/viewport';
  import SheetFooter from './ui/SheetFooter.svelte';

  let {
    title = '',
    onclose,
    left,
    right,
    hideClose = false,
    fit = false,
    bare = false,
    titleClass = 'text-[17px] font-extrabold',
    footer,
    children,
  }: {
    title?: string;
    onclose: () => void;
    /** ersetzt „Schließen" links oben */
    left?: Snippet;
    right?: Snippet;
    hideClose?: boolean;
    /** so hoch wie der Inhalt (Aktionsblatt wie das Karten-Menü); sonst von der Kopfzeile des Geräts bis unten, wie in den Mockups */
    fit?: boolean;
    /** Schrift des Titels (Standard: 17 px, fett); das Karten-Fenster zeigt dort klein „Gespeichert" */
    titleClass?: string;
    /** großer Knopf am Fuß, fest über dem Inhalt (der Inhalt lässt unten Platz dafür) */
    footer?: Snippet;
    /** ohne Kopfzeile (Griff, dann gleich der Inhalt) */
    bare?: boolean;
    children: Snippet;
  } = $props();

  const me = Symbol('sheet');
  $effect(() => {
    stack.push(me);
    return () => {
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
    };
  });

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

<svelte:window onkeydown={(e) => e.key === 'Escape' && stack[stack.length - 1] === me && onclose()} />

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
    class="absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet border-t border-line bg-bg shadow-[0_-10px_40px_rgba(0,0,0,0.6)] {fit ? 'max-h-[calc(100dvh-54px)]' : 'h-[calc(100dvh-54px)]'} lg:h-auto lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[480px] lg:rounded-none lg:border-t-0 lg:border-l"
    style:transform={dy ? `translateY(${dy}px)` : undefined}
    style:transition={dragging ? 'none' : undefined}
    style:bottom={insets.bottom ? `${insets.bottom}px` : undefined}
    style:max-height={insets.maxHeight ? `${insets.maxHeight}px` : undefined}
    transition:fly={{ y: 500, duration: 220 }}
  >
    <div
      class="-mb-2 flex shrink-0 touch-none justify-center pt-2 pb-2 lg:hidden"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      role="presentation"
    >
      <span class="h-[5px] w-10 rounded-full bg-track"></span>
    </div>
    {#if !bare}
      <!-- Kopf: links, Titel in der Mitte, rechts (drei gleich breite Spalten außen, Höhe 52) -->
      <div class="relative z-[1] grid h-[52px] shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center px-2">
        <div class="flex justify-self-start">
          {#if left}
            {@render left()}
          {:else if !hideClose}
            <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={onclose}>{t('Schließen')}</button>
          {/if}
        </div>
        <span class="min-w-0 truncate text-center {titleClass}">{title}</span>
        <div class="flex justify-self-end">{@render right?.()}</div>
      </div>
    {/if}
    <div
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain wrap-anywhere px-3 {footer ? 'pb-[150px]' : bare ? 'pb-[max(34px,var(--safe-bottom))]' : 'pb-[max(40px,var(--safe-bottom))]'}"
      onfocusin={keepFieldVisible}
    >
      {@render children()}
    </div>
    {#if footer}<SheetFooter>{@render footer()}</SheetFooter>{/if}
  </div>
</div>
