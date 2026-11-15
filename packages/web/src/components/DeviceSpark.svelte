<script lang="ts">
  import { graphOf, type EntityHistory } from '../lib/history';

  /**
   * Der Verlauf eines Geräts als kleine Linie (gemeinsam einrichten: je Gerät eine Zeile): Linie mit Fläche, gestrichelt die Schwelle,
   * ein Punkt am Ende in Rot (löst jetzt aus) oder Grün. Ohne Verlauf bleibt der Platz leer, damit die Zeilen gleich hoch sind.
   */
  let { history, threshold = null, thresholdState = null, met = null, width = 96, height = 34 }: { history: EntityHistory | null; threshold?: number | null; thresholdState?: string | null; met?: boolean | null; width?: number; height?: number } = $props();
  const g = $derived(history ? graphOf(history, { width, height, top: 4, bottom: height - 4, threshold, thresholdState }) : null);
  const last = $derived(g ? [...g.line.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].at(-1) : undefined);
  const uid = $props.id();
</script>

{#if g}
<svg class="shrink-0" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
    <defs>
      <linearGradient id="spark-{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.3" /><stop offset="1" stop-color="var(--accent)" stop-opacity="0" /></linearGradient>
    </defs>
    <path d={g.area} fill="url(#spark-{uid})" />
    {#if g.thresholdY !== null}<line x1="0" x2={width} y1={g.thresholdY} y2={g.thresholdY} stroke="var(--danger)" stroke-width="1" stroke-dasharray="3 3" />{/if}
    <path d={g.line} fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
    {#if last}<circle cx={last[1]} cy={last[2]} r="3" fill={met === null ? 'var(--accent)' : met ? 'var(--danger)' : 'var(--ok-fg)'} />{/if}
</svg>
{/if}
