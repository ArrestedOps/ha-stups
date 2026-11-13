<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import type { ConditionKind } from '../lib/watcher-types';
  import { conditionItems } from '../lib/watcher-flow';
  import EntityPicker from './EntityPicker.svelte';
  import EntityRow from './EntityRow.svelte';
  import Segmented from './ui/Segmented.svelte';

  /** „Erledigt sich selbst, wenn …": die Entität und die Bedingung, bei der die offene Aufgabe dieses Wächters von selbst erledigt wird */
  let { ed }: { ed: WatcherEditor } = $props();
  const f = $derived(ed.form);
  const KINDS = $derived(conditionItems());
</script>

<div class="flex flex-col gap-3.5 rounded-row border border-line bg-surface px-3.5 py-3.5" data-testid="done-editor">
  <p class="text-[13px] text-fg2">{t('Zum Beispiel: Die Tür der Waschmaschine geht auf. Die offene Aufgabe dieses Wächters wird dann erledigt.')}</p>
  {#if ed.selfNote}<p class="text-[14px] text-fg2" data-testid="self-note">{ed.selfNote}</p>{/if}
  {#if ed.picking === 'done'}
    <EntityPicker {ed} />
  {:else}
    <EntityRow name={f.doneEntityName} id={f.doneEntityId} empty={t('Noch keine Entität gewählt')} testid="done-entity" onchange={() => ed.startPicking('done')} />
  {/if}
  <Segmented small items={KINDS} value={f.doneKind} label={t('Bedingung zum Erledigen')} onchange={(id) => (f.doneKind = id as ConditionKind)} />
  <div class="flex items-center justify-between gap-3">
    <span class="text-[15px] font-bold">{f.doneKind === 'state' ? t('Zustand') : t('Wert')}</span>
    {#if f.doneKind === 'state'}
      <input class="h-10 w-32 rounded-xl border border-track bg-bg px-2 text-center text-[15px] font-bold placeholder:text-dim" bind:value={f.doneTo} placeholder={t('z. B. on')} aria-label={t('Zustand zum Erledigen')} />
    {:else}
      <input class="h-10 w-28 rounded-xl border border-track bg-bg px-2 text-center text-[15px] font-bold placeholder:text-dim" inputmode="decimal" bind:value={f.doneValue} aria-label={t('Schwellwert zum Erledigen')} />
    {/if}
  </div>
</div>
