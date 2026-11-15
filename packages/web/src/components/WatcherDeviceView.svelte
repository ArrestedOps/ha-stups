<script lang="ts">
  import { cardTitleWithEntity } from '../lib/cardTitle';
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { deviceMet, deviceValue } from '../lib/watcher-devices';
  import DeviceSpark from './DeviceSpark.svelte';
  import EntityGraph from './EntityGraph.svelte';
  import Icon from './Icon.svelte';
  import SelectBox from './ui/SelectBox.svelte';

  /**
   * Gemeinsam einrichten: was die Geräteleiste darunter zeigt. `value` (Wenn): im Überblick je Gerät Wert, kleine Kurve und „löst jetzt aus“
   * (mit Kästchen zum Abwählen), bei einem Gerät sein Verlauf; `title` (Dann): der Titel der Aufgabe je Gerät, wie ihn Stups setzt;
   * `probe` (Feinschliff): der Probelauf über 7 Tage je Gerät. Nichts davon ist je Gerät einstellbar: Titel und Zuständige legt der Wächter fest.
   */
  let { ed, mode }: { ed: WatcherEditor; mode: 'value' | 'title' | 'probe' } = $props();
  const f = $derived(ed.form);
  const rule = $derived({ kind: f.kind, to: f.to, value: f.value });
  const numeric = $derived(f.kind === 'below' || f.kind === 'above');
  const threshold = $derived.by(() => {
    if (!numeric) return null;
    const n = Number(f.value.trim().replace(',', '.'));
    return f.value.trim() === '' || !Number.isFinite(n) ? null : n;
  });
  const thresholdState = $derived(f.kind === 'state' ? f.to.trim() : null);
  const one = $derived(ed.devices.find((d) => d.entityId === ed.focus) ?? null);
  const hist = (id: string) => ed.deviceHistory[id] ?? null;
  const titleOf = (name: string) => cardTitleWithEntity(f.title, f.kind, name) || '…';
  const probeText = (id: string): string => {
    const r = ed.deviceProbe[id];
    if (r === undefined) return ed.probeBusy ? t('Lädt …') : '–';
    if (r === null) return t('nicht abrufbar');
    if (r.noHistory) return t('keine Historie');
    return r.fired.length === 0 ? t('nie ausgelöst') : tn('{n} × ausgelöst', '{n} × ausgelöst', r.fired.length);
  };
</script>

{#snippet pill(id: string)}
  {@const m = deviceMet(rule, hist(id))}
  {#if m !== null}
    <span class="inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-bold {m ? 'bg-danger-bg text-danger' : 'bg-surface2 text-fg2'}" data-testid="device-met" data-met={m ? '' : undefined}>{m ? t('löst jetzt aus') : t('noch nicht')}</span>
  {/if}
{/snippet}

{#if one && mode === 'value'}
  <div class="rounded-[16px] bg-surface px-3.5 pt-3.5 pb-2.5" data-testid="graph-card">
    <div class="flex items-center gap-3">
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="wrap-anywhere text-[15px] font-bold tracking-tight">{one.name}</span>
        <span class="wrap-anywhere text-[13px] text-fg2">{t('letzte 3 Stunden')}</span>
      </span>
      <span class="ml-auto shrink-0 text-right">
        <span class="block text-[24px] leading-none font-extrabold">{deviceValue(hist(one.entityId), one.unit)}</span>
        <span class="block text-[12px] text-fg2">{t('jetzt')}</span>
      </span>
    </div>
    <EntityGraph history={hist(one.entityId)} busy={!(one.entityId in ed.deviceHistory)} name={one.name} unit={one.unit ?? null} {threshold} {thresholdState} />
    <div class="pb-1">{@render pill(one.entityId)}</div>
  </div>
{:else if one && mode === 'title'}
  <div class="flex flex-col gap-2 rounded-[16px] bg-surface px-4 py-3.5" data-testid="device-title-one">
    <span class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('So heißt die Aufgabe für {name}', { name: one.name })}</span>
    <span class="text-[17px] font-bold wrap-anywhere">{titleOf(one.name)}</span>
  </div>
{:else if one && mode === 'probe'}
  <div class="flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3.5" data-testid="device-probe-one">
    <span class="min-w-0 flex-1"><span class="block text-[15px] font-bold wrap-anywhere">{one.name}</span><span class="block text-[13px] text-fg2">{ed.deviceProbe[one.entityId]?.sentence ?? t('Noch nicht getestet')}</span></span>
    <span class="shrink-0 text-[14px] font-bold">{probeText(one.entityId)}</span>
  </div>
{:else}
  <ul class="divide-y divide-line overflow-hidden rounded-row bg-surface" aria-label={t('Geräte')}>
    {#each ed.devices as d (d.entityId)}
      {@const on = !ed.off.includes(d.entityId)}
      {#if mode === 'value' || on}
        <li class="flex items-center gap-1 pr-3.5 pl-1.5 {on ? '' : 'opacity-60'}" data-testid="device-row" data-on={on ? '' : undefined}>
          {#if mode === 'value'}
            <SelectBox checked={on} disabled={on && ed.selectedDevices.length <= 1} label={t('{name} auswählen', { name: d.name })} onchange={() => ed.toggleDevice(d.entityId)} />
          {:else}
            <span class="w-2"></span>
          {/if}
          <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left" aria-label={t('{name} zeigen', { name: d.name })} onclick={() => (ed.focus = d.entityId)}>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="wrap-anywhere text-[14.5px] font-semibold">{d.name}</span>
              <span class="truncate text-[12.5px] text-fg2">{mode === 'title' ? titleOf(d.name) : mode === 'probe' ? (ed.deviceProbe[d.entityId]?.sentence ?? d.entityId) : d.entityId}</span>
              {#if mode === 'value'}
                <span class="mt-1 flex items-center gap-2"><DeviceSpark history={hist(d.entityId)} {threshold} {thresholdState} met={deviceMet(rule, hist(d.entityId))} width={84} height={26} />{@render pill(d.entityId)}</span>
              {/if}
            </span>
            {#if mode === 'value'}
              <span class="shrink-0 self-start pt-1 text-[15px] font-extrabold">{deviceValue(hist(d.entityId), d.unit)}</span>
            {:else if mode === 'probe'}
              <span class="shrink-0 text-[13px] font-bold">{probeText(d.entityId)}</span>
            {/if}
            <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-right" size={16} stroke={2.2} /></span>
          </button>
        </li>
      {/if}
    {/each}
  </ul>
  {#if mode === 'value'}<p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Die Werte unten gelten für alle gewählten Geräte. Name und Titel der Aufgabe setzt Stups je Gerät.')}</p>{/if}
{/if}
