<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { OrderView } from '../lib/watcher-types';
  import { personById } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  /**
   * Die Reihenfolge der Personen („An wen"): Foto oder Initiale, Name darunter, Pfeile dazwischen; wer als Nächstes dran ist, trägt einen
   * orangen Ring, wer nicht zu Hause ist, ist blass und steht als „… unterwegs" rechts. Zeigt nur an, schaltet nichts weiter.
   * `boxed`: eigene gestrichelte Fläche (Assistent), sonst steht die Reihe in der Aufgabe des Ablaufs.
   */
  let { order, boxed = false }: { order: OrderView | null; boxed?: boolean } = $props();

  const people = $derived((order?.circle ?? []).map((e) => ({ ...e, person: personById(e.id) })).filter((e) => e.person));
  const away = $derived(people.filter((e) => e.present === false).map((e) => e.person!.displayName));
</script>

{#if order && people.length > 0}
  <div class="flex items-center {order.ordered ? 'gap-1.5' : 'gap-3.5'} {boxed ? 'rounded-row border border-dashed border-track bg-surface-inset px-3.5 py-3' : ''}" data-testid="assign-order">
    {#each people as e, i (e.id)}
      {#if order.ordered && i > 0}
        <span class="-mt-4 flex shrink-0 text-sep" aria-hidden="true"><Icon name="chevron-right" size={18} stroke={2} /></span>
      {/if}
      <span class="flex flex-col items-center gap-1 text-[11px] {e.next ? 'font-bold text-tok' : 'text-fg2'}" data-next={e.next} data-present={e.present}>
        <span class="rounded-full {e.next ? (boxed ? 'ring-next-inset' : 'ring-next') : ''} {e.present === false ? 'opacity-45' : ''}">
          <Avatar person={e.person!} size={40} />
        </span>
        {e.person!.displayName}
        {#if e.next}<span class="sr-only">{t('als Nächstes dran')}</span>{/if}
      </span>
    {/each}
    {#if away.length > 0}
      <span class="ml-auto inline-flex h-6 shrink-0 items-center rounded-full bg-surface2 px-2.5 text-[12px] font-bold text-text-soft2">{t('{names} unterwegs', { names: away.join(', ') })}</span>
    {/if}
  </div>
{:else if order && order.circle.length === 0}
  <p class="text-[13px] text-fg2">{t('Niemand im Kreis.')}</p>
{/if}
