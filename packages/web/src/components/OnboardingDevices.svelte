<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { deviceOptions, effectiveDevices, type Candidate } from '../lib/onboarding';
  import { ob, toggleCandidateDevice } from '../lib/onboarding.svelte';
  import { deviceName } from '../lib/pushStand';
  import Icon from './Icon.svelte';

  /**
   * „Handy wählen": alle Geräte der Companion App aus Home Assistant zur Auswahl für eine Person. Die, die zu ihr passen (Zuordnung in Home Assistant,
   * Name), stehen oben; ein Gerät, das schon eine andere Person hat, trägt ihren Namen. Mit vielen Geräten gibt es eine Suche.
   */
  let { c, services }: { c: Candidate; services: string[] } = $props();
  let query = $state('');
  const options = $derived(deviceOptions(c, ob.candidates, services, ob.devices, query));
  const chosen = $derived(effectiveDevices(c, ob.devices));
</script>

<div class="mt-2 rounded-xl bg-surface2 p-2" data-testid="devices-{c.key}">
  {#if services.length > 6}
    <label class="mb-1.5 flex h-10 items-center gap-2 rounded-lg bg-surface px-3 text-fg2">
      <Icon name="search" size={16} stroke={2} />
      <input class="min-w-0 flex-1 bg-transparent p-0 text-[15px] text-fg outline-none placeholder:text-dim" type="search" placeholder={t('Gerät suchen')} aria-label={t('Gerät suchen')} bind:value={query} />
    </label>
  {/if}
  <ul class="flex max-h-[220px] flex-col overflow-y-auto" role="group" aria-label={t('Handys von {name}', { name: c.name })}>
    {#each options as o (o.service)}
      {@const on = chosen.includes(o.service)}
      <li>
        <button type="button" role="checkbox" aria-checked={on} class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left" onclick={() => toggleCandidateDevice(c, o.service)}>
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md {on ? 'bg-accent-grad text-on-accent' : 'border border-line bg-surface'}" aria-hidden="true">
            {#if on}<Icon name="check" size={13} stroke={3} />{/if}
          </span>
          <span class="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{deviceName(o.service)}</span>
          {#if o.takenBy}<span class="shrink-0 text-[12px] text-hint">{t('bei {name}', { name: o.takenBy })}</span>
          {:else if o.assigned}<span class="shrink-0 text-[12px] text-ok">{t('passt')}</span>{/if}
        </button>
      </li>
    {:else}
      <li class="px-2 py-3 text-[13.5px] text-fg2">{t('Kein Gerät gefunden.')}</li>
    {/each}
  </ul>
</div>
