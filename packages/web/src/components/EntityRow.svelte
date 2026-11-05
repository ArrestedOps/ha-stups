<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';

  /**
   * Die gewählte Entität als Zeile mit Ändern rechts (so auch in Feinschliff bei Erledigt sich selbst): Name und Kennung, der Knopf hat
   * ein 44-px-Ziel und eine Beschriftung mit dem Namen. Ohne `onchange` (nur lesen) steht kein Knopf da.
   */
  let { name, id, empty, testid, onchange }: { name: string; id?: string; empty?: string; testid?: string; onchange?: () => void } = $props();
</script>

<div class="flex items-center gap-3" data-testid={testid}>
  <span class="min-w-0 flex-1">
    <span class="block text-[15px] font-bold wrap-anywhere">{name || empty || ''}</span>
    {#if id}<span class="block text-[12px] break-all text-fg2">{id}</span>{/if}
  </span>
  {#if onchange}
    <button type="button" class="-my-[5px] inline-flex h-11 shrink-0 items-center" aria-label={name ? t('Entität ändern: {name}', { name }) : t('Entität wählen')} onclick={onchange}>
      <span class="inline-flex h-[34px] items-center rounded-xl bg-surface2 px-3 text-[13px] font-bold text-text-soft" aria-hidden="true">{name ? t('Ändern') : t('Wählen')}</span>
    </button>
  {/if}
</div>
