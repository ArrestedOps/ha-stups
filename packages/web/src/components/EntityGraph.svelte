<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { firedTextLong, graphAlt, graphOf, startText, trendText, WINDOWS, windowLabel, windowText, type EntityHistory } from '../lib/history';

  /**
   * Verlauf der Entität (letzte Stunden) als Diagramm: Linie mit Fläche, grün gestrichelte Schwellen-Linie, grüner Punkt dort, wo die Regel
   * ausgelöst hätte. Darunter links der Anfang des Fensters, in der Mitte, wann ausgelöst wurde, rechts „jetzt". `compact`: kleine Fassung in der
   * Aufgabe des Ablaufs (70 px, eigener Rahmen), sonst die große im Assistenten (120 px; die Aufgabe außen hält den Rahmen).
   * Ohne Verlauf (kein Recorder, keine Verbindung) steht an seiner Stelle ein Hinweis in derselben Höhe.
   */
  let {
    history,
    busy = false,
    name,
    unit = null,
    threshold = null,
    thresholdState = null,
    compact = false,
    onwindow,
  }: {
    history: EntityHistory | null;
    busy?: boolean;
    name: string;
    unit?: string | null;
    threshold?: number | null;
    thresholdState?: string | null;
    compact?: boolean;
    /** Mit dieser Funktion zeigt das Diagramm Knöpfe zum Umschalten des Zeitfensters (3 Std. bis 1 Jahr) */
    onwindow?: (hours: number) => void;
  } = $props();

  const H = $derived(compact ? 70 : 120);
  const graph = $derived(
    history
      ? graphOf(history, compact ? { width: 340, height: 70, top: 11, bottom: 64, threshold, thresholdState } : { width: 340, height: 120, top: 20, bottom: 112, threshold, thresholdState })
      : null,
  );
  const now = $derived(history ? Date.parse(history.to) : 0);
  const alt = $derived(history && graph ? graphAlt(history, { name, unit, threshold, now }) : '');
  const uid = $props.id();
  const gradient = $derived(`fade-${uid}`);
  const message = $derived(
    busy && !history
      ? t('Lädt …')
      : !history || history.status === 'unavailable'
        ? t('Der Verlauf ist gerade nicht abrufbar.')
        : history.needsStatistics
          ? t('Für so lange Zeiträume braucht die Entität eine Langzeitstatistik. Home Assistant behält sonst nur etwa 10 Tage.')
          : history.status === 'no_data'
          ? t('Für diese Entität gibt es keinen Verlauf (Recorder aus oder neue Entität).')
          : t('Zu wenig Daten für ein Diagramm.'),
  );
  const fired = $derived(history?.fired ?? []);
  const trend = $derived(history ? trendText(history, { unit, threshold }) : null);
  // Ohne Langzeitstatistik in Home Assistant gibt es nur die letzten Tage: die langen Fenster sind dann nicht wählbar
  const noLong = $derived(history?.needsStatistics === true);
</script>

<div class={compact ? 'rounded-[14px] border border-line bg-bg px-2.5 pt-2 pb-1.5' : ''} data-testid="entity-graph" data-status={history?.status ?? 'loading'}>
  {#if graph && history}
    <svg viewBox="0 0 340 {H}" preserveAspectRatio="none" class="block w-full {compact ? 'h-[70px]' : 'mt-2.5 h-[120px]'}" role="img" aria-label={alt}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--brand-dot)" stop-opacity="0.35" />
          <stop offset="1" stop-color="var(--brand-dot)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={graph.area} fill="url(#{gradient})" />
      <path d={graph.line} fill="none" stroke="var(--graph-line)" stroke-width={compact ? 2 : 2.4} stroke-linejoin="round" />
      {#if graph.thresholdY !== null}
        <line x1="0" x2="340" y1={graph.thresholdY} y2={graph.thresholdY} stroke="var(--sig-green)" stroke-width={compact ? 1.4 : 1.5} stroke-dasharray="5 4" data-testid="graph-threshold" />
      {/if}
      {#each graph.marks as m (m.at)}
        <circle cx={m.x} cy={m.y} r={compact ? 4.5 : 5} fill="var(--sig-green)" data-testid="graph-mark" />
      {/each}
    </svg>
    <div class="flex justify-between text-[11px] text-dim {compact ? 'mt-1' : 'mt-0.5'}">
      <span data-testid="graph-start">{compact ? windowText(history.hours) : startText(history)}</span>
      <span class={fired.length > 0 ? 'text-ok' : ''} data-testid="graph-fired">{fired.length > 0 ? '● ' : ''}{firedTextLong(history, now)}</span>
      <span>{t('jetzt')}</span>
    </div>
    {#if trend}<p class="mt-1.5 text-[12.5px] leading-[1.4] text-fg2" data-testid="graph-trend">{trend}</p>{/if}
  {:else}
    <div class="flex items-center justify-center rounded-[10px] px-4 text-center text-[13px] text-fg2 {compact ? 'h-[70px]' : 'mt-2.5 h-[120px]'}" role="status" data-testid="graph-empty">{message}</div>
  {/if}
  {#if onwindow && history}
    <div class="mt-2.5 grid grid-cols-5 gap-1.5" role="group" aria-label={t('Zeitraum')} data-testid="graph-windows">
      {#each WINDOWS as w (w)}
        {@const on = history.hours === w}
        {@const off = noLong && w >= 720 && !on}
        <button
          type="button"
          class="h-8 rounded-full px-1 text-[12.5px] font-semibold whitespace-nowrap disabled:opacity-40 {on ? 'chip-on' : 'bg-track text-fg2'}"
          aria-pressed={on}
          disabled={off}
          onclick={() => onwindow(w)}
        >{windowLabel(w)}</button>
      {/each}
    </div>
  {/if}
</div>
