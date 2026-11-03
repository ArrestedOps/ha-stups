<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type TemplateInfo } from '../lib/api';
  import { t } from '../lib/i18n/index.svelte';
  import { toast, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
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

<Group
  title={t('Vorlagen')}
  hint={t('Speichert Spalten, Kategorien und offene Karten dieses Boards, ohne Zuweisungen, Anhänge und Kommentare. Daraus lassen sich neue Boards anlegen.')}
>
  <form onsubmit={save} class="flex min-h-[52px] items-center gap-3 px-4">
    <input bind:value={name} placeholder={t('Name der Vorlage')} maxlength="60" enterkeyhint="done" class="min-w-0 flex-1 bg-transparent py-3" aria-label={t('Name der Vorlage')} />
    <SubmitPill show={!!name.trim()} {busy} />
  </form>
  {#each own as tpl (tpl.id)}
    <div class="flex min-h-[48px] items-center gap-3 px-4 py-2" data-testid="own-template-{tpl.id}">
      <span class="min-w-0 flex-1 truncate">{tpl.name}</span>
      {#if confirmDelete === tpl.id}
        <button type="button" class="min-h-10 rounded-xl bg-danger-bg px-3 text-[15px] font-semibold text-danger" onclick={() => remove(tpl.id)}>{t('Ja, entfernen')}</button>
        <button type="button" class="min-h-10 rounded-xl bg-surface2 px-3 text-[15px]" onclick={() => (confirmDelete = null)}>{t('Abbrechen')}</button>
      {:else}
        <button type="button" class="min-h-10 px-2 text-[15px] text-danger" aria-label={t('Vorlage {name} löschen', { name: tpl.name })} onclick={() => (confirmDelete = tpl.id)}>{t('Löschen')}</button>
      {/if}
    </div>
  {/each}
</Group>
