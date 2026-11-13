<script lang="ts" module>
  export type RowVariant = 'task' | 'setting' | 'danger';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import { arrowOnly, probeRight } from '../../lib/rowTap';

  /**
   * Die eine Zeile für Aufgaben, Board-Aufgaben, Wächter und Einstellungen: 68 px hoch, links optional der
   * Erledigt-Kreis und die Symbol-Kachel, Titel einzeilig, darunter die Meta-Zeile, rechts **genau ein** Element
   * (`right`: Foto, Stupsen, Pfeil, Zähler, Schalter, Wert oder kleiner Knopf).
   * Der Antippbereich (Kachel, Titel, Meta) ist ein Knopf, wenn `onclick` gesetzt ist, ein Link bei `href`.
   */
  let {
    title,
    variant = 'setting',
    strike = false,
    tile,
    meta,
    right,
    check,
    label,
    highlight = false,
    current = false,
    dashed = false,
    wrap = false,
    rightFull = false,
    dim = false,
    problem = false,
    expanded,
    pressed,
    inset = false,
    onclick,
    href,
  }: {
    title: string;
    variant?: RowVariant;
    /** durchgestrichener Titel: erledigt */
    strike?: boolean;
    tile?: Snippet;
    meta?: Snippet;
    right?: Snippet;
    /** Erledigt-Kreis links (Tippfläche 32 × 44) */
    check?: { done: boolean; label: string; onchange: () => void; state?: 'overdue' | 'waiting'; disabled?: boolean };
    /** Beschriftung des Antippbereichs für Screenreader, wenn der sichtbare Text nicht reicht (zum Beispiel „Wächter Waschmaschine öffnen“) */
    label?: string;
    /** neu und noch offen (Mitteilungen): oranger Rand */
    highlight?: boolean;
    /** die gerade geöffnete Zeile (Board wechseln): orange Rand, Schein */
    current?: boolean;
    /** gestrichelter Rand: wartet auf etwas (Freigabe) */
    dashed?: boolean;
    /** Titel und Meta dürfen umbrechen, die Zeile wächst mit (Wächter-Editor); sonst einzeilig mit „…“ wie in den Listen */
    wrap?: boolean;
    /** der rechte Bereich ist so hoch wie die Zeile (ein Wert oben rechts, der Pfeil in der Mitte) */
    rightFull?: boolean;
    /** Problem (zum Beispiel ein Wächter ohne Zuständige): roter Rand in der Farbe Gefahr, nicht Orange */
    problem?: boolean;
    /** gedämpft: ein ausgeschalteter Wächter (Kachel und Text blasser, der Rest der Zeile nicht) */
    dim?: boolean;
    /** der Antippbereich klappt etwas auf (aria-expanded) */
    expanded?: boolean;
    /** der Antippbereich ist eine Auswahl (aria-pressed): die gewählte Zeile */
    pressed?: boolean;
    /** Zeile in einer Aufgabe (Ablauf im Wächter-Editor): dunkler Grund, 64 px hoch statt 68 */
    inset?: boolean;
    onclick?: (e: MouseEvent) => void;
    href?: string;
  } = $props();

  // Steht rechts allein ein Pfeil, gehört er zum Antippbereich: Tippen darauf ist dasselbe wie Tippen auf die Zeile (zentral hier, nicht
  // bei jedem Aufrufer). Schalter, Zahlenfeld, Foto, Wert oder Knopf rechts bleiben unberührt.
  let rightEl = $state<HTMLElement>();
  let arrow = $state(false);
  $effect(() => {
    if (!rightEl) return;
    const el = rightEl;
    const update = () => (arrow = !!(onclick || href) && arrowOnly(probeRight(el)));
    update();
    const watch = new MutationObserver(update);
    watch.observe(el, { childList: true, subtree: true });
    return () => watch.disconnect();
  });

  function tapRight(e: MouseEvent) {
    if (!arrow) return;
    const el = e.currentTarget as HTMLElement;
    (el.parentElement?.querySelector('[data-row-open]') as HTMLElement | null)?.click();
  }
</script>

<div
  class="flex w-full items-center rounded-row border text-fg {inset ? (wrap ? 'min-h-16 bg-bg py-2' : 'h-16 bg-bg') : wrap ? `min-h-row py-2.5 ${current ? '' : 'bg-surface'}` : current ? 'h-row' : 'h-row bg-surface'} {highlight ? 'row-new' : current ? 'row-current' : problem ? 'row-problem' : 'border-line'} {dashed ? 'border-dashed' : ''} {onclick || href ? 'row-hover' : ''} {check ? 'gap-2.5 pr-2 pl-0.5' : 'gap-3 pr-2.5 pl-3'}"
  data-variant={variant}
  data-problem={problem ? '' : undefined}
>
  {#if check}
    <button
      type="button"
      role="checkbox"
      aria-checked={check.done}
      aria-label={check.label}
      disabled={check.disabled}
      class="-mr-0.5 flex h-11 w-8 shrink-0 items-center justify-center"
      onclick={check.onchange}
    >
      {#if check.done}
        <span class="bg-accent-grad flex h-[22px] w-[22px] items-center justify-center rounded-full !shadow-none"><Icon name="check" size={14} /></span>
      {:else if check.state === 'waiting'}
        <span class="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-accent text-accent-text"><Icon name="clock" size={12} stroke={2.6} /></span>
      {:else if check.state === 'overdue'}
        <span class="h-[22px] w-[22px] rounded-full border-2 border-ring"></span>
      {:else}
        <span class="h-[22px] w-[22px] rounded-full border-2 border-ring"></span>
      {/if}
    </button>
  {/if}

  {#snippet body()}
    {#if tile}{#if dim}<span class="flex shrink-0 opacity-60">{@render tile()}</span>{:else}{@render tile()}{/if}{/if}
    <span class="flex min-w-0 flex-1 flex-col gap-1 {dim ? 'opacity-70' : ''}">
      <span class="{wrap ? 'wrap-anywhere' : 'truncate'} text-[15px] font-bold tracking-tight {variant === 'danger' ? 'text-danger' : ''} {strike ? 'text-hint line-through' : ''}">{title}</span>
      {#if meta}<span class="flex items-center gap-1.5 text-[13px] text-fg2 {wrap ? 'flex-wrap' : 'truncate'}">{@render meta()}</span>{/if}
    </span>
  {/snippet}

  {#if href}
    <a {href} target={/^(https?|geo|tel|mailto):/i.test(href) ? '_blank' : undefined} rel="noopener noreferrer" aria-label={label} aria-current={current ? 'true' : undefined} data-row-open class="flex h-full min-w-0 flex-1 items-center {check ? 'gap-2.5' : 'gap-3'} text-left">{@render body()}</a>
  {:else if onclick}
    <button type="button" aria-label={label} aria-current={current ? 'true' : undefined} aria-expanded={expanded} aria-pressed={pressed} data-row-open class="flex h-full min-w-0 flex-1 items-center {check ? 'gap-2.5' : 'gap-3'} text-left" {onclick}>{@render body()}</button>
  {:else}
    <div class="flex h-full min-w-0 flex-1 items-center {check ? 'gap-2.5' : 'gap-3'}">{@render body()}</div>
  {/if}

  {#if right}
    <!-- Der Pfeil allein ist Teil des Antippbereichs (Tastatur und Screenreader nutzen den Knopf der Zeile) -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span
      bind:this={rightEl}
      class="flex shrink-0 items-center {rightFull ? 'self-stretch' : ''} {check ? 'gap-2.5' : 'gap-3'} {arrow ? 'cursor-pointer' : ''}"
      onclick={tapRight}>{@render right()}</span
    >
  {/if}
</div>
