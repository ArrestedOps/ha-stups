<script lang="ts">
  import { cardTitleWithEntity } from '../lib/cardTitle';
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { deviceMet, deviceValue } from '../lib/watcher-devices';
  import DeviceSpark from './DeviceSpark.svelte';
  import EntityGraph from './EntityGraph.svelte';

  /**
   * „Das entsteht“ im Formular am Desktop, wenn mehrere Geräte gemeinsam eingerichtet werden: eine Zeile je Gerät mit Verlauf, aktuellem Wert,
   * dem Titel der Aufgabe, wie ihn Stups setzt, und ob die Bedingung jetzt gilt; nach dem Probelauf auch, wie oft es ausgelöst hätte. Eine Zeile
   * wählen zeigt darunter den Verlauf groß. Nur zum Lesen: Titel und Zuständige legt der Wächter für alle fest.
   */
  let { ed }: { ed: WatcherEditor } = $props();
  const f = $derived(ed.form);
  const rule = $derived({ kind: f.kind, to: f.to, value: f.value });
  const threshold = $derived.by(() => {
    if (f.kind !== 'below' && f.kind !== 'above') return null;
    const n = Number(f.value.trim().replace(',', '.'));
    return f.value.trim() === '' || !Number.isFinite(n) ? null : n;
  });
  const thresholdState = $derived(f.kind === 'state' ? f.to.trim() : null);
  const hist = (id: string) => ed.deviceHistory[id] ?? null;
  /** Das gezeigte Gerät: das gewählte, sonst das erste (am Desktop gibt es keinen Überblick „Alle“, die Tabelle ist er) */
  const shown = $derived(ed.selectedDevices.find((d) => d.entityId === ed.focus) ?? ed.selectedDevices[0]);
  const hitting = $derived(ed.selectedDevices.filter((d) => deviceMet(rule, hist(d.entityId)) === true).length);
  const probeText = (id: string): string | null => {
    const r = ed.deviceProbe[id];
    if (r === undefined) return null;
    if (r === null) return t('nicht abrufbar');
    if (r.noHistory) return t('keine Historie');
    return r.fired.length === 0 ? t('nie ausgelöst') : tn('{n} × ausgelöst', '{n} × ausgelöst', r.fired.length);
  };
</script>

<section class="flex min-w-0 flex-col overflow-hidden rounded-[16px] bg-surface" aria-labelledby="desk-devices-t" data-testid="desk-devices-table">
  <h3 id="desk-devices-t" class="flex items-baseline gap-2 px-4 pt-3.5 pb-2 text-[15px] font-extrabold">
    {t('Das entsteht')}<span class="text-[12.5px] font-medium text-fg2">{hitting > 0 ? tn('{n} löst jetzt aus', '{n} lösen jetzt aus', hitting) : tn('{n} Wächter', '{n} Wächter', ed.selectedDevices.length)}</span>
  </h3>
  <ul>
    {#each ed.selectedDevices as d (d.entityId)}
      {@const m = deviceMet(rule, hist(d.entityId))}
      {@const probe = probeText(d.entityId)}
      <li class="border-t border-line">
        <button type="button" class="grid w-full grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-surface2 {shown?.entityId === d.entityId ? 'bg-accent/10' : ''}" aria-pressed={shown?.entityId === d.entityId} data-testid="device-row" onclick={() => (ed.focus = d.entityId)}>
          <span class="flex h-[34px] w-24 items-center"><DeviceSpark history={hist(d.entityId)} {threshold} {thresholdState} met={m} /></span>
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-[14px] font-semibold">{d.name}</span>
            <span class="truncate text-[12.5px] text-fg2">{cardTitleWithEntity(f.title, f.kind, d.name) || '…'}</span>
          </span>
          <span class="flex shrink-0 flex-col items-end gap-1">
            <span class="text-[14px] font-extrabold">{deviceValue(hist(d.entityId), d.unit)}</span>
            {#if probe}
              <span class="text-[12px] font-bold text-fg2" data-testid="device-probe">{probe}</span>
            {:else if m !== null}
              <span class="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold {m ? 'bg-danger-bg text-danger' : 'bg-surface2 text-fg2'}" data-testid="device-met" data-met={m ? '' : undefined}>{m ? t('löst jetzt aus') : t('noch nicht')}</span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
  {#if shown}
    <div class="border-t border-line px-4 pt-3 pb-2.5" data-testid="graph-card">
      <div class="flex items-baseline justify-between gap-3">
        <span class="min-w-0 truncate text-[14px] font-bold">{shown.name}</span>
        <span class="shrink-0 text-[12px] text-fg2">{t('letzte 3 Stunden')}</span>
      </div>
      <EntityGraph history={hist(shown.entityId)} busy={!(shown.entityId in ed.deviceHistory)} name={shown.name} unit={shown.unit ?? null} {threshold} {thresholdState} />
    </div>
  {/if}
</section>
