<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { deviceMet, deviceValue } from '../lib/watcher-devices';
  import Chip from './ui/Chip.svelte';

  /**
   * Gemeinsam einrichten: die Leiste oben in den Schritten Wenn, Dann und Feinschliff. „Alle“ zeigt den Überblick, ein Gerät zeigt, was für dieses
   * Gerät gilt (Verlauf, Aufgabentitel, Probelauf). Die Werte des Auslösers gelten für alle; die Leiste ändert nur, was man sieht.
   * Chips der Geräte, die gerade nicht gewählt sind, fehlen (abwählen geht im Überblick des ersten Schritts).
   */
  let { ed, values = false }: { ed: WatcherEditor; /** den aktuellen Wert und, ob er jetzt auslöst, an den Chips zeigen (Schritt Wenn) */ values?: boolean } = $props();
  const rule = $derived({ kind: ed.form.kind, to: ed.form.to, value: ed.form.value });
  const dot = (id: string): string => {
    const m = deviceMet(rule, ed.deviceHistory[id] ?? null);
    return m === null ? 'bg-track' : m ? 'bg-danger' : 'bg-ok';
  };
</script>

<section class="rounded-row bg-surface px-3 pt-3 pb-3" aria-label={t('Geräte')} data-testid="devices">
  <h2 class="px-0.5 pb-2 text-[15px] font-extrabold tracking-tight" data-testid="devices-title">{tn('{n} Gerät', '{n} Geräte', ed.selectedDevices.length)}{ed.form.baseName ? ` · ${ed.form.baseName}` : ''}</h2>
  <div class="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label={t('Gerät zeigen')} data-testid="device-strip">
    <Chip small active={ed.focus === 'all'} pressed={ed.focus === 'all'} onclick={() => (ed.focus = 'all')}>{tn('Alle {n}', 'Alle {n}', ed.selectedDevices.length)}</Chip>
    {#each ed.selectedDevices as d (d.entityId)}
      <Chip small active={ed.focus === d.entityId} pressed={ed.focus === d.entityId} onclick={() => (ed.focus = d.entityId)}>
        {#if values}<span class="h-2 w-2 shrink-0 rounded-full {dot(d.entityId)}" aria-hidden="true"></span>{/if}
        <span class="max-w-[11rem] truncate">{d.name}</span>
        {#if values}<span class="text-[12px] font-bold opacity-75">{deviceValue(ed.deviceHistory[d.entityId] ?? null, d.unit)}</span>{/if}
      </Chip>
    {/each}
  </div>
</section>
