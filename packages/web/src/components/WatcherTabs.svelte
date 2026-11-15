<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { categoryTabs, type CatTab } from '../lib/watcherList';
  import { matchesQuery } from '../lib/search';
  import Icon from './Icon.svelte';

  /**
   * Reiter der Wächter am Desktop: „Alle“, „Pausiert“ und die Kategorien. Bis sechs Kategorien stehen alle da; bei mehr die vier größten, dazu
   * „Weitere“ mit einem Menü (Suche, A bis Z, Anzahl, rote Zahl bei Problemen). Wählt man dort eine, rückt sie als Reiter nach vorn.
   * `scope` ist `all`, `paused` oder `cat:<Schlüssel>`.
   */
  let { groups, total, paused, scope, onpick }: { groups: CatTab[]; total: number; paused: number; scope: string; onpick: (scope: string) => void } = $props();

  const activeKey = $derived(scope.startsWith('cat:') ? scope.slice(4) : null);
  const tabs = $derived(categoryTabs(groups, activeKey));
  const label = (g: CatTab) => g.name ?? t('Ohne Kategorie');
  let open = $state(false);
  let q = $state('');
  let field = $state<HTMLInputElement>();
  const list = $derived(
    [...groups]
      .sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })))
      .filter((g) => !q.trim() || matchesQuery(q.trim(), label(g))),
  );
  async function toggle() {
    open = !open;
    q = '';
    if (open) {
      await tick();
      field?.focus();
    }
  }
  const pick = (key: string) => {
    open = false;
    onpick(`cat:${key}`);
  };
</script>

{#snippet tab(id: string, text: string, n: number, testid?: string)}
  <button
    class="-mb-px inline-flex items-center gap-1.5 border-b-2 pt-2 pb-2.5 text-[14px] whitespace-nowrap {scope === id ? 'border-accent font-bold text-fg' : 'border-transparent font-semibold text-text-soft hover:text-fg'}"
    role="tab"
    aria-selected={scope === id}
    data-testid={testid ?? 'watcher-tab'}
    onclick={() => onpick(id)}
  >{text}<span class="text-[13px] font-medium text-hint tabular-nums">{n}</span></button>
{/snippet}

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') open = false; }} />

<div class="flex items-end gap-5 border-b border-line" role="tablist" aria-label={t('Kategorien')} data-testid="watcher-tabs">
  {@render tab('all', t('Alle'), total, 'watcher-tab-all')}
  {@render tab('paused', t('Pausiert'), paused, 'watcher-tab-paused')}
  {#each tabs.shown as g (g.key)}{@render tab(`cat:${g.key}`, label(g), g.n)}{/each}
  {#if tabs.rest.length > 0}
    <span class="relative inline-flex">
      <button
        class="-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent pt-2 pb-2.5 text-[14px] font-semibold whitespace-nowrap text-fg"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="watcher-more"
        onclick={() => void toggle()}
      >{t('Weitere')}<span class="inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-full bg-surface2 px-1.5 text-[12px] font-medium text-hint tabular-nums">{tabs.rest.length}</span><Icon name="chevron-down" size={14} stroke={2.4} /></button>
      {#if open}
        <button class="fixed inset-0 z-40 cursor-default" aria-label={t('Schließen')} tabindex="-1" onclick={() => (open = false)}></button>
        <div class="absolute top-10 left-0 z-50 w-[290px] rounded-[14px] bg-surface p-2 shadow-[0_10px_30px_rgba(0,0,0,0.22)]" role="menu" aria-label={t('Kategorien')} data-testid="watcher-more-menu">
          <label class="mb-1.5 flex h-9 items-center gap-2 rounded-[10px] bg-surface2 px-2.5 text-text-soft">
            <Icon name="search" size={15} stroke={2} />
            <input bind:this={field} class="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-text-soft" type="search" placeholder={t('Kategorie suchen')} aria-label={t('Kategorie suchen')} autocomplete="off" bind:value={q} />
          </label>
          <div class="max-h-[300px] overflow-y-auto">
            {#each list as g (g.key)}
              <button class="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[14px] hover:bg-surface2 {scope === `cat:${g.key}` ? 'font-bold' : 'font-medium'}" role="menuitem" onclick={() => pick(g.key)}>
                <span class="min-w-0 flex-1 truncate">{label(g)}</span>
                {#if g.problems > 0}<span class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-on-danger" aria-label={t('{n} mit Problem', { n: g.problems })}>{g.problems}</span>{/if}
                <span class="text-[13px] text-hint tabular-nums">{g.n}</span>
              </button>
            {:else}
              <p class="px-3 py-3 text-center text-[14px] text-text-soft">{t('Keine Kategorie gefunden')}</p>
            {/each}
          </div>
        </div>
      {/if}
    </span>
  {/if}
</div>
