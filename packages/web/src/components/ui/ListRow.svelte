<script lang="ts" module>
  export type RowVariant = 'task' | 'setting' | 'danger';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  /**
   * Die eine Zeile für Aufgaben, Board-Karten, Wächter und Einstellungen: 68 px hoch, links optional der
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
    /** der Antippbereich klappt etwas auf (aria-expanded) */
    expanded?: boolean;
    /** der Antippbereich ist eine Auswahl (aria-pressed): die gewählte Zeile */
    pressed?: boolean;
    /** Zeile in einer Karte (Ablauf im Wächter-Editor): dunkler Grund, 64 px hoch statt 68 */
    inset?: boolean;
    onclick?: (e: MouseEvent) => void;
    href?: string;
  } = $props();
</script>

<div
  class="flex w-full items-center rounded-row border text-fg {inset ? (wrap ? 'min-h-16 bg-bg py-2' : 'h-16 bg-bg') : wrap ? `min-h-row py-2.5 ${current ? '' : 'bg-surface'}` : current ? 'h-row' : 'h-row bg-surface'} {highlight ? 'row-new' : current ? 'row-current' : 'border-line'} {dashed ? 'border-dashed' : ''} {onclick || href ? 'row-hover' : ''} {check ? 'gap-2.5 pr-2 pl-0.5' : 'gap-3 pr-2.5 pl-3'}"
  data-variant={variant}
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
    {#if tile}{@render tile()}{/if}
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="{wrap ? 'wrap-anywhere' : 'truncate'} text-[15px] font-bold tracking-tight {variant === 'danger' ? 'text-danger' : ''} {strike ? 'text-hint line-through' : ''}">{title}</span>
      {#if meta}<span class="flex items-center gap-1.5 text-[13px] text-fg2 {wrap ? 'flex-wrap' : 'truncate'}">{@render meta()}</span>{/if}
    </span>
  {/snippet}

  {#if href}
    <a {href} aria-label={label} aria-current={current ? 'true' : undefined} data-row-open class="flex h-full min-w-0 flex-1 items-center {check ? 'gap-2.5' : 'gap-3'} text-left">{@render body()}</a>
  {:else if onclick}
    <button type="button" aria-label={label} aria-current={current ? 'true' : undefined} aria-expanded={expanded} aria-pressed={pressed} data-row-open class="flex h-full min-w-0 flex-1 items-center {check ? 'gap-2.5' : 'gap-3'} text-left" {onclick}>{@render body()}</button>
  {:else}
    <div class="flex h-full min-w-0 flex-1 items-center {check ? 'gap-2.5' : 'gap-3'}">{@render body()}</div>
  {/if}

  {#if right}<span class="flex shrink-0 items-center {rightFull ? 'self-stretch' : ''} {check ? 'gap-2.5' : 'gap-3'}">{@render right()}</span>{/if}
</div>
