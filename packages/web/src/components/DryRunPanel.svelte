<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { t } from '../lib/i18n/index.svelte';
  import type { DryRunResult } from '../lib/watcher-types';
  import { toInput, type WatcherForm } from '../lib/watchers';

  /**
   * Probelauf: Stups wendet die Regel auf die Historie der letzten 7 Tage an und zeigt, wann der Wächter ausgelöst hätte. Nichts wird
   * gespeichert. Das gibt Vertrauen, bevor der Wächter wirklich Karten anlegt.
   */
  let { form }: { form: WatcherForm } = $props();

  let result = $state<DryRunResult | null>(null);
  let busy = $state(false);
  let error = $state('');

  const supported = $derived(form.kind === 'state' || form.kind === 'above' || form.kind === 'below');
  const ready = $derived(supported && !!form.entityId && (form.kind === 'state' ? form.to.trim() !== '' : form.value.trim() !== ''));

  // Ändert sich die Regel, ist das alte Ergebnis überholt
  $effect(() => {
    void [form.entityId, form.kind, form.to, form.value, form.forMin, form.count, form.cooldownMin];
    result = null;
    error = '';
  });

  async function run() {
    const input = toInput(form);
    busy = true;
    error = '';
    try {
      result = await api.dryRun({ trigger: input.trigger, cooldownMin: input.cooldownMin });
    } catch (e) {
      result = null;
      error = e instanceof ApiError ? e.message : t('Der Probelauf ist fehlgeschlagen');
    }
    busy = false;
  }

  // Das kleine Diagramm: Linie der Werte, senkrechte Striche bei den Auslösungen
  const W = 300;
  const H = 64;
  const chart = $derived.by(() => {
    const r = result;
    if (!r || r.noHistory || r.points.length < 2) return null;
    const t0 = Date.parse(r.from);
    const span = Math.max(1, Date.parse(r.to) - t0);
    const vs = r.points.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const y = (v: number) => H - 4 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (H - 8);
    const x = (iso: string) => ((Date.parse(iso) - t0) / span) * W;
    return {
      line: r.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '),
      marks: r.fired.map((f) => x(f.at)),
    };
  });
</script>

<section class="mt-3 rounded-2xl border border-line bg-surface p-4" data-testid="dry-run">
  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="text-[15px] font-semibold">{t('Probelauf')}</p>
      <p class="text-[13px] text-fg2">
        {supported ? t('Was hätte der Wächter in den letzten 7 Tagen getan?') : t('Einen Probelauf gibt es nur für Zahlen und Zustände')}
      </p>
    </div>
    <button type="button" class="min-h-11 shrink-0 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={!ready || busy} onclick={run}>
      {busy ? t('Rechnet …') : t('Probelauf')}
    </button>
  </div>

  {#if error}<p class="mt-3 text-[14px] text-danger">{error}</p>{/if}

  {#if result}
    <div class="mt-3" data-testid="dry-run-result">
      <p class="text-[16px] font-semibold">{result.sentence}</p>
      {#if chart}
        <svg viewBox="0 0 {W} {H}" class="mt-2 h-16 w-full" role="img" aria-label={t('Verlauf der letzten 7 Tage')}>
          <path d={chart.line} fill="none" stroke="var(--text2)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          {#each chart.marks as m (m)}
            <line x1={m} x2={m} y1="0" y2={H} stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" />
          {/each}
        </svg>
      {/if}
      {#if result.fired.length > 0}
        <ul class="mt-2 space-y-0.5 text-[13px] text-fg2">
          {#each result.fired.slice(-5).reverse() as f (f.at)}<li>{formatDue(f.at)}</li>{/each}
        </ul>
      {/if}
      {#if result.truncated}<p class="mt-2 text-[13px] text-fg2">{t('Es gab sehr viele Zustände, gelesen wurden nur die ersten 20 000.')}</p>{/if}
    </div>
  {/if}
</section>
