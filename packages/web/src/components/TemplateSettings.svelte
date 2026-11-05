<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type TemplateInfo } from '../lib/api';
  import { t } from '../lib/i18n/index.svelte';
  import { toast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Field from './ui/Field.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';
  import SubmitPill from './SubmitPill.svelte';

  /** Dieses Board als eigene Vorlage speichern und die eigenen Vorlagen verwalten (Board-Einstellungen) */
  let name = $state('');
  let busy = $state(false);
  let templates = $state<TemplateInfo[]>([]);
  let confirmDelete = $state<string | null>(null);
  const own = $derived(templates.filter((x) => !x.builtin));

  async function load() {
    templates = await api.templates().catch(() => templates);
  }
  onMount(() => {
    name = ui.view?.board.name ?? '';
    void load();
  });

  async function save(e: Event) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy || !ui.boardId) return;
    busy = true;
    try {
      await api.saveAsTemplate(ui.boardId, n);
      toast(t('Vorlage gespeichert'));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Etwas ist schiefgelaufen'), { tone: 'error' });
    } finally {
      busy = false;
    }
  }

  async function remove(id: string) {
    confirmDelete = null;
    try {
      await api.deleteTemplate(id);
      toast(t('Vorlage gelöscht'));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Etwas ist schiefgelaufen'), { tone: 'error' });
    }
  }
</script>

<div>
  <SectionHeader title={t('Vorlagen')} />
  <p class="px-1 pt-1 pb-2 text-[12.5px] leading-[1.45] text-hint">{t('Speichert Spalten, Kategorien und offene Karten dieses Boards, ohne Zuweisungen, Anhänge und Kommentare. Daraus lassen sich neue Boards anlegen.')}</p>
  <form onsubmit={save} class="flex items-end gap-2">
    <div class="min-w-0 flex-1"><Field id="template-name" label={t('Name der Vorlage')} bind:value={name} maxlength={60} enterkeyhint="done" /></div>
    <SubmitPill show={!!name.trim()} {busy} label={t('Speichern')} />
  </form>
  <div class="mt-2 flex flex-col gap-2">
    {#each own as tpl (tpl.id)}
      <div data-testid="own-template-{tpl.id}">
        <ListRow title={tpl.name}>
          {#snippet tile()}<Tile color="gray"><Icon name="columns" size={22} stroke={1.8} /></Tile>{/snippet}
          {#snippet right()}
            {#if confirmDelete === tpl.id}
              <button type="button" class="h-9 rounded-xl bg-danger-bg px-3 text-[13px] font-bold text-danger" onclick={() => remove(tpl.id)}>{t('Ja, entfernen')}</button>
              <button type="button" class="h-9 rounded-xl bg-surface2 px-3 text-[13px] font-bold" onclick={() => (confirmDelete = null)}>{t('Abbrechen')}</button>
            {:else}
              <button type="button" class="h-9 rounded-xl px-2 text-[13px] font-bold text-danger" aria-label={t('Vorlage {name} löschen', { name: tpl.name })} onclick={() => (confirmDelete = tpl.id)}>{t('Löschen')}</button>
            {/if}
          {/snippet}
        </ListRow>
      </div>
    {/each}
  </div>
</div>
