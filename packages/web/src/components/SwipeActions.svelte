<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import Icon from './Icon.svelte';

  /**
   * Wischen an einer Zeile wie im Entwurf: nach rechts „Erledigt“ (ab etwa einem Drittel der Breite löst es aus), nach links bleiben die Knöpfe
   * „Später“ und „Löschen“ offen. Senkrechtes Wischen scrollt die Liste; ein Tipp auf die geöffnete Zeile schließt sie.
   */
  let {
    onlead,
    onlater,
    ondelete,
    children,
  }: { onlead?: () => void; onlater?: () => void; ondelete?: () => void; children: Snippet } = $props();

  const TRAIL = 176; // zwei Knöpfe à 88 px
  let dx = $state(0);
  let animating = $state(false);
  let open = $state(false);
  let width = 360;
  let startX = 0;
  let startY = 0;
  let base = 0;
  let pointer = -1;
  let mode: 'idle' | 'h' | 'v' = 'idle';
  let suppress = false;
  let host: HTMLElement | undefined = $state();

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    base = open ? -TRAIL : 0;
    mode = 'idle';
    width = host?.offsetWidth ?? 360;
    animating = false;
  }
  function move(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (mode === 'idle') {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) {
        mode = 'h';
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* funktioniert auch ohne Capture */
        }
      } else if (Math.abs(my) > 10) mode = 'v';
    }
    if (mode === 'h') {
      const next = base + mx;
      dx = Math.max(-TRAIL - 24, Math.min(next, onlead ? width * 0.7 : 0));
    }
  }
  function settle() {
    animating = true;
    if (dx > width * 0.33 && onlead) {
      dx = width;
      setTimeout(() => {
        onlead?.();
        dx = 0;
        animating = false;
      }, 160);
      return;
    }
    open = dx < -TRAIL * 0.4;
    dx = open ? -TRAIL : 0;
    setTimeout(() => (animating = false), 380);
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (mode !== 'h') return;
    suppress = true;
    setTimeout(() => (suppress = false), 350);
    settle();
  }
  function cancel(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (mode === 'h') settle();
  }
  // Ein Tipp auf die geöffnete Zeile schließt sie, statt die Aufgabe zu öffnen
  function click(e: MouseEvent) {
    if (suppress || open) {
      e.preventDefault();
      e.stopPropagation();
      if (open && !suppress) {
        open = false;
        animating = true;
        dx = 0;
        setTimeout(() => (animating = false), 380);
      }
    }
  }
  function fire(fn?: () => void) {
    open = false;
    animating = true;
    dx = 0;
    setTimeout(() => (animating = false), 380);
    fn?.();
  }
</script>

<div bind:this={host} class="relative overflow-hidden">
  {#if dx > 4 && onlead}
    <div class="absolute inset-0 flex items-center bg-(--c-green-fg) px-5 text-white" aria-hidden="true">
      <span class="flex items-center gap-2 text-[16px] font-semibold"><Icon name="check" size={20} stroke={3} />{t('Erledigt')}</span>
    </div>
  {/if}
  {#if dx < -4}
    <div class="absolute inset-y-0 right-0 flex" style:width="{TRAIL}px">
      <button class="flex w-1/2 flex-col items-center justify-center gap-1 bg-(--c-orange-fg) text-[14px] font-semibold text-white" tabindex={open ? 0 : -1} onclick={() => fire(onlater)}>
        <Icon name="clock" size={20} stroke={2} />{t('Später')}
      </button>
      <button class="flex w-1/2 flex-col items-center justify-center gap-1 bg-(--c-red-fg) text-[14px] font-semibold text-white" tabindex={open ? 0 : -1} onclick={() => fire(ondelete)}>
        <Icon name="trash" size={20} stroke={2} />{t('Löschen')}
      </button>
    </div>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative bg-surface"
    style:transform="translateX({dx}px)"
    style:transition={animating ? 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)' : 'none'}
    style:touch-action="pan-y"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={cancel}
    onclickcapture={click}
  >
    {@render children()}
  </div>
</div>
