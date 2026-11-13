<script lang="ts">
  import { api, type CardPatch } from '../../lib/api';
  import { findCategory } from '../../lib/colors';
  import { t } from '../../lib/i18n/index.svelte';
  import { catDot, categoryColors, nextCategoryColor } from '../../lib/newCard';
  import { act, ui } from '../../lib/store.svelte';
  import type { CardFields } from '../CardProps.svelte';
  import Icon from '../Icon.svelte';
  import Chip from '../ui/Chip.svelte';

  /** Kategorien der neuen Aufgabe wählen, oder gleich hier eine anlegen */
  let { fields, onsave }: { fields: CardFields; onsave: (patch: CardPatch) => unknown } = $props();

  function toggleCategory(id: string) {
    void onsave({ categoryIds: fields.categoryIds.includes(id) ? fields.categoryIds.filter((x) => x !== id) : [...fields.categoryIds, id] });
  }

  let newCat = $state(false);
  let catName = $state('');
  let catColor = $state<string | null>(null);
  let catBusy = $state(false);
  const shownCatColor = $derived(catColor ?? nextCategoryColor((ui.view?.categories ?? []).map((c) => c.color)));

  /** Anlegen und gleich für diese Aufgabe wählen; gibt es den Namen schon, wird die vorhandene gewählt */
  async function addCategory(e: Event) {
    e.preventDefault();
    const n = catName.trim();
    if (!n || catBusy || !ui.boardId) return;
    const existing = findCategory(ui.view?.categories ?? [], n);
    if (existing) {
      if (!fields.categoryIds.includes(existing.id)) void onsave({ categoryIds: [...fields.categoryIds, existing.id] });
      catName = '';
      newCat = false;
      return;
    }
    catBusy = true;
    const made = await act(() => api.addCategory(ui.boardId!, n, shownCatColor));
    catBusy = false;
    if (made) {
      void onsave({ categoryIds: [...fields.categoryIds, made.id] });
      catName = '';
      catColor = null;
      newCat = false;
    }
  }
</script>

<div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Kategorie')}>
  {#each ui.view?.categories ?? [] as c (c.id)}
    <Chip active={fields.categoryIds.includes(c.id)} pressed={fields.categoryIds.includes(c.id)} onclick={() => toggleCategory(c.id)}>
      <span class="h-[9px] w-[9px] shrink-0 rounded-full" style:background={catDot(c.color)}></span>{c.name}
    </Chip>
  {/each}
  <Chip active={newCat} pressed={newCat} onclick={() => (newCat = !newCat)}><Icon name="plus" size={18} stroke={2} />{t('Neue Kategorie')}</Chip>
</div>
{#if newCat}
  <div class="focus-ring-in flex flex-col gap-2.5 rounded-row border border-line bg-surface px-3.5 py-3" role="group" aria-label={t('Neue Kategorie')}>
    <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="nc">{t('Neue Kategorie')}</label>
    <div class="flex items-center gap-2">
      <input
        id="nc"
        bind:value={catName}
        placeholder={t('Name, z. B. Garten')}
        maxlength="40"
        enterkeyhint="done"
        class="h-11 min-w-0 flex-1 rounded-xl border border-track bg-bg px-3 text-[15px] font-semibold outline-none placeholder:text-dim"
        onkeydown={(e) => e.key === 'Enter' && addCategory(e)}
      />
      <button
        type="button"
        class="bg-accent-grad glow-pill h-11 shrink-0 rounded-xl px-4 text-[14px] font-bold disabled:opacity-40"
        disabled={!catName.trim() || catBusy}
        onclick={addCategory}
      >{t('Anlegen')}</button>
    </div>
    <div class="flex gap-2.5" role="radiogroup" aria-label={t('Farbe der Kategorie')}>
      {#each categoryColors() as [key, label] (key)}
        <button
          type="button"
          role="radio"
          aria-checked={shownCatColor === key}
          aria-label={label}
          class="h-[30px] w-[30px] rounded-full border-2 p-0 shadow-[inset_0_0_0_2px_var(--surface)] {shownCatColor === key ? 'border-fg' : 'border-transparent'}"
          style:background={catDot(key)}
          onclick={() => (catColor = key)}
        ></button>
      {/each}
    </div>
  </div>
{/if}
