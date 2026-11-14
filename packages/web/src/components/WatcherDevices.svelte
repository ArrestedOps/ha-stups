<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import SelectBox from './ui/SelectBox.svelte';

  /**
   * Gemeinsam einrichten, Schritt 1: statt der einen Entität die Liste der gewählten Geräte aus „Gefunden“ mit ihrem aktuellen Wert. Einzelne
   * lassen sich abwählen (mindestens eines bleibt). Die Werte des Auslösers darunter gelten für alle; Name und Aufgabentitel setzt Stups je Gerät.
   */
  let { ed }: { ed: WatcherEditor } = $props();
  const title = $derived(ed.form.baseName ? ` · ${ed.form.baseName}` : '');
</script>

<section class="rounded-row border border-line bg-surface" aria-label={t('Geräte')} data-testid="devices">
  <h2 class="px-3.5 pt-3 pb-1 text-[15px] font-extrabold tracking-tight" data-testid="devices-title">{tn('{n} Gerät', '{n} Geräte', ed.selectedDevices.length)}{title}</h2>
  <ul class="divide-y divide-line">
    {#each ed.devices as d (d.entityId)}
      {@const on = !ed.off.includes(d.entityId)}
      <li class="flex items-center gap-1 pr-3.5 pl-1.5" data-testid="device-row" data-on={on ? '' : undefined}>
        <SelectBox checked={on} disabled={on && ed.selectedDevices.length <= 1} label={t('{name} auswählen', { name: d.name })} onchange={() => ed.toggleDevice(d.entityId)} />
        <span class="flex min-w-0 flex-1 flex-col py-2 {on ? '' : 'opacity-60'}">
          <span class="wrap-anywhere text-[14.5px] font-semibold">{d.reason ?? d.name}</span>
          <span class="truncate text-[12.5px] text-fg2">{d.entityId}</span>
        </span>
      </li>
    {/each}
  </ul>
  <p class="px-3.5 pt-2 pb-3 text-[12.5px] leading-[1.45] text-hint">{t('Die Werte unten gelten für alle gewählten Geräte. Name und Titel der Aufgabe setzt Stups je Gerät.')}</p>
</section>
