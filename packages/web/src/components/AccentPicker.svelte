<script lang="ts">
  import { DEFAULT_HUE, swatch } from '../lib/accent';
  import { t } from '../lib/i18n/index.svelte';
  import { applyAccentHue, changeAccent, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  /**
   * Farbkreis für die Akzentfarbe: Ring antippen oder ziehen, die ganze Oberfläche folgt sofort. Gespeichert wird beim Loslassen.
   * Mit der Tastatur (Pfeile, Shift = große Schritte) lässt sich der Ring als Regler bedienen.
   */
  const SIZE = 232;
  const RING = 40;
  const INNER = SIZE / 2 - RING;
  const MID = SIZE / 2 - RING / 2;

  const saved = $derived(ui.me?.accentHue ?? null);
  let drag = $state<number | null>(null);
  const hue = $derived(drag ?? saved ?? DEFAULT_HUE);

  // Der Kreis zeigt alle Farbtöne in der Helligkeit des Dunkelmodus: so sieht man, was man bekommt
  const stops = Array.from({ length: 37 }, (_, i) => `${swatch(Math.min(i * 10, 359), 'dark')} ${i * 10}deg`).join(', ');
  const ringStyle = `background: conic-gradient(from 0deg, ${stops}); -webkit-mask-image: radial-gradient(farthest-side, transparent ${INNER - 1}px, #000 ${INNER}px); mask-image: radial-gradient(farthest-side, transparent ${INNER - 1}px, #000 ${INNER}px);`;

  const handle = $derived.by(() => {
    const a = (hue * Math.PI) / 180;
    return { x: SIZE / 2 + MID * Math.sin(a), y: SIZE / 2 - MID * Math.cos(a) };
  });

  let wheel: HTMLDivElement | undefined = $state();

  /** Farbton unter dem Finger; null, wenn der Finger weder auf dem Ring noch nahe daran ist */
  function hueAt(e: PointerEvent): number | null {
    const r = wheel!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist < INNER - 10 || dist > SIZE / 2 + 24) return null;
    return Math.round((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  }

  function move(e: PointerEvent) {
    if (drag === null && e.type !== 'pointerdown') return;
    const h = hueAt(e);
    if (h === null) return;
    drag = h;
    applyAccentHue(h);
  }

  function down(e: PointerEvent) {
    if (hueAt(e) === null) return;
    wheel!.setPointerCapture(e.pointerId);
    move(e);
  }

  async function up() {
    if (drag === null) return;
    const h = drag;
    await changeAccent(h);
    drag = null;
  }

  let keyTimer: ReturnType<typeof setTimeout> | undefined;
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 30 : 5;
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    const h = (((hue + delta) % 360) + 360) % 360;
    drag = h;
    applyAccentHue(h);
    // Mehrere Tastendrücke hintereinander werden einmal gespeichert
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => void up(), 400);
  }
</script>

<div class="flex flex-col items-center gap-4 px-4 py-5">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={wheel}
    class="relative touch-none select-none"
    style:width="{SIZE}px"
    style:height="{SIZE}px"
    role="slider"
    tabindex="0"
    aria-label={t('Akzentfarbe')}
    aria-valuemin={0}
    aria-valuemax={359}
    aria-valuenow={hue}
    aria-valuetext={saved === null && drag === null ? t('Orange (Standard)') : `${hue}°`}
    data-testid="accent-wheel"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
  >
    <div class="absolute inset-0 rounded-full" style={ringStyle}></div>
    <!-- Vorschau in der Mitte: der Plus-Knopf in der gewählten Farbe -->
    <div class="bg-accent-grad pointer-events-none absolute top-1/2 left-1/2 flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[28px]">
      <Icon name="plus" size={34} stroke={2.8} />
    </div>
    <div
      class="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
      style:left="{handle.x}px"
      style:top="{handle.y}px"
      style:background={swatch(hue, 'dark')}
    ></div>
  </div>
  <button
    class="min-h-11 rounded-xl border border-line px-4 text-[15px] text-fg disabled:opacity-40"
    disabled={saved === null && drag === null}
    onclick={() => void changeAccent(null)}
  >
    {t('Orange (Standard)')}
  </button>
</div>
