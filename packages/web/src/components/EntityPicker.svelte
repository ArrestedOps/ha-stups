<script lang="ts">
  import { api, ApiError, type HaEntity } from '../lib/api';
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import Icon from './Icon.svelte';

  /**
   * Suche in den Entitäten von Home Assistant (nur Administratoren), ein Feld und eine Liste: Name, Kennung, aktueller Wert.
   * Welche Suche offen ist (Auslöser oder „erledigt sich selbst"), steht im Editor; ein Tipp auf einen Treffer übernimmt ihn.
   */
  let { ed }: { ed: WatcherEditor } = $props();

  let results = $state<HaEntity[]>([]);
  let error = $state('');

  $effect(() => {
    if (!ed.picking) return;
    const q = ed.query;
    const domain = ed.searchDomain;
    const timer = setTimeout(async () => {
      try {
        results = await api.haEntities(q, domain || undefined);
        error = '';
      } catch (e) {
        error = e instanceof ApiError ? e.message : t('Home Assistant antwortet nicht');
        results = [];
      }
    }, 250);
    return () => clearTimeout(timer);
  });
</script>

<div class="flex flex-col gap-2" data-testid="entity-picker">
  <label class="flex h-12 items-center gap-2.5 rounded-row border border-line bg-surface px-3.5 focus-ring-in">
    <span class="flex shrink-0 text-text-soft2"><Icon name="search" size={18} stroke={2} /></span>
    <input class="min-w-0 flex-1 bg-transparent text-[16px] font-semibold placeholder:text-dim" bind:value={ed.query} placeholder={t('Entität suchen, z. B. waschmaschine')} aria-label={t('Entität suchen')} />
  </label>
  {#if error}<p class="px-1 text-[14px] text-danger">{error}</p>{/if}
  <ul class="flex max-h-64 flex-col gap-2 overflow-y-auto">
    {#each results as e (e.entityId)}
      <li>
        <button type="button" class="flex min-h-12 w-full items-center gap-2 rounded-row border border-line bg-surface px-3.5 py-1.5 text-left" onclick={() => ed.pick(e)}>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-bold">{e.name}</span>
            <span class="block truncate text-[12px] text-fg2">{e.entityId}</span>
          </span>
          <span class="shrink-0 text-[13px] text-fg2">{e.state}{e.unit ? ` ${e.unit}` : ''}</span>
        </button>
      </li>
    {:else}
      <li class="px-1 py-2 text-[14px] text-fg2">{t('Nichts gefunden.')}</li>
    {/each}
  </ul>
  <button type="button" class="min-h-11 self-start px-1 text-[15px] font-semibold text-accent-text" onclick={() => (ed.picking = null)}>{t('Suche schließen')}</button>
</div>
