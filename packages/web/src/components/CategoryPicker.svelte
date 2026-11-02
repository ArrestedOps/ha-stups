<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api } from '../lib/api';
  import { CATEGORY_COLORS, catClass, findCategory, nextColor } from '../lib/colors';
  import { act, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  let { selected, onchange }: { selected: string[]; onchange: (ids: string[]) => void } = $props();

  const categories = $derived(ui.view?.categories ?? []);

  let name = $state('');
  let color = $state<string | null>(null);
  let busy = $state(false);
  // Farbe, solange nichts gewählt wurde: die erste, die im Board noch nicht vorkommt
  const shownColor = $derived(color ?? nextColor(categories.map((c) => c.color)));

  function toggle(id: string) {
    onchange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function cycleColor() {
    color = CATEGORY_COLORS[(CATEGORY_COLORS.indexOf(shownColor as never) + 1) % CATEGORY_COLORS.length]!;
  }

  /** Neue Kategorie direkt anlegen und gleich für diese Karte wählen; gibt es den Namen schon, wird die vorhandene gewählt */
  async function create(e: Event) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy || !ui.boardId) return;
    const existing = findCategory(categories, n);
    if (existing) {
      if (!selected.includes(existing.id)) onchange([...selected, existing.id]);
      name = '';
      return;
    }
    busy = true;
    // act meldet Fehler selbst als Hinweis
    const made = await act(() => api.addCategory(ui.boardId!, n, shownColor));
    if (made) {
      onchange([...selected, made.id]);
      name = '';
      color = null;
    }
    busy = false;
  }
</script>

{#if categories.length > 0}
  <div class="flex flex-wrap gap-2">
    {#each categories as c (c.id)}
      <button
        type="button"
        aria-pressed={selected.includes(c.id)}
        class="{catClass(c.color)} min-h-9 !px-3 !text-[14px] {selected.includes(c.id) ? 'ring-2 ring-accent' : 'opacity-60'}"
        onclick={() => toggle(c.id)}
      >
        {c.name}
      </button>
    {/each}
  </div>
{/if}

<form onsubmit={create} class="flex min-h-11 items-center gap-2 {categories.length > 0 ? 'mt-3' : ''}">
  <button type="button" class="{catClass(shownColor)} h-9 w-9 shrink-0 !p-0" aria-label={t('Farbe wechseln')} onclick={cycleColor}>●</button>
  <input
    bind:value={name}
    placeholder={t('Neue Kategorie')}
    maxlength="40"
    enterkeyhint="done"
    class="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface2 px-3 text-[16px]"
    aria-label={t('Name der neuen Kategorie')}
  />
  <button
    type="submit"
    class="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-accent px-3.5 text-[15px] font-bold text-on-accent disabled:opacity-40"
    disabled={!name.trim() || busy}
  >
    <Icon name="plus" size={16} stroke={2.8} />Erstellen
  </button>
</form>
