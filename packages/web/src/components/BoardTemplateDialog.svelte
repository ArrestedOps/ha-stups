<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api, type Board } from '../lib/api';
  import { actResult, toast } from '../lib/store.svelte';
  import BoardDialog from './BoardDialog.svelte';
  import Field from './ui/Field.svelte';

  /** „Als Vorlage speichern": speichert Spalten und Kategorien (keine Aufgaben) als eigene Vorlage; sie erscheint bei „Neues Board erstellen" */
  let { board, onclose }: { board: Board; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  let name = $state(board.name);
  let busy = $state(false);

  async function submit(e?: Event) {
    e?.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    const r = await actResult(() => api.saveAsTemplate(board.id, n, false));
    busy = false;
    if (r.ok) {
      toast(t('Vorlage gespeichert'));
      onclose();
    }
  }
</script>

<BoardDialog title={t('Als Vorlage speichern')} testid="board-template-dialog" {onclose}>
  <form class="flex flex-col gap-3" onsubmit={submit}>
    <Field id="template-board-name" label={t('Vorlagenname')} bind:value={name} maxlength={60} enterkeyhint="done" />
    <p class="px-1 text-[13px] leading-[1.45] text-fg2">{t('Speichert Spalten und Kategorien, keine Aufgaben. Erscheint bei „Neues Board erstellen“.')}</p>
  </form>
  {#snippet footer()}
    <button class="border-line-chip min-h-[50px] rounded-[14px] border bg-surface2 px-2 text-[15px] font-bold" onclick={onclose}>{t('Abbrechen')}</button>
    <button class="bg-accent-grad glow-cta min-h-[50px] rounded-[14px] px-2 text-[15px] font-bold disabled:opacity-40" disabled={busy || !name.trim()} data-testid="template-confirm" onclick={() => submit()}>{t('Speichern')}</button>
  {/snippet}
</BoardDialog>
