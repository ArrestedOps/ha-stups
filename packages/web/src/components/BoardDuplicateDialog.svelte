<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api, type Board } from '../lib/api';
  import { copyName } from '../lib/boardAdmin';
  import { actResult, selectBoard, toast } from '../lib/store.svelte';
  import BoardDialog from './BoardDialog.svelte';
  import Field from './ui/Field.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * „Board duplizieren": Name „X (Kopie)", dann was kopiert wird: Spalten und Kategorien (an), offene Aufgaben (aus; ohne Zuständige, ohne
   * Erledigte, Wiederholungen bleiben), Sichtbarkeit wie das Original (an; sonst „Alle"). Wächter werden nie mitkopiert. Besitzer der Kopie bist du.
   */
  let { board, onclose }: { board: Board; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  let name = $state(copyName(board.name));
  let structure = $state(true);
  let openCards = $state(false);
  let keepVisibility = $state(true);
  let busy = $state(false);

  async function submit(e?: Event) {
    e?.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    const r = await actResult(() => api.duplicateBoard(board.id, { name: n, structure, openCards, keepVisibility }));
    busy = false;
    if (r.ok) {
      toast(t('„{name}“ angelegt', { name: n }));
      await selectBoard(r.value.id);
    }
  }
</script>

<BoardDialog title={t('Board duplizieren')} testid="board-duplicate-dialog" {onclose}>
  <form class="flex flex-col gap-3" onsubmit={submit}>
    <Field id="duplicate-name" label={t('Name')} bind:value={name} maxlength={80} enterkeyhint="done" />
    <p class="px-1 text-[12px] font-bold tracking-[0.1em] text-fg2 uppercase">{t('Was wird kopiert?')}</p>
    <div class="flex flex-col gap-2">
      <div class="flex min-h-[52px] items-center gap-3 rounded-row border border-line bg-bg py-1.5 pr-2.5 pl-3.5">
        <span class="min-w-0 flex-1 text-[15px] font-bold">{t('Spalten und Kategorien')}</span>
        <Toggle label={t('Spalten und Kategorien')} checked={structure} onchange={(on) => (structure = on)} />
      </div>
      <div class="flex min-h-[52px] items-center gap-3 rounded-row border border-line bg-bg py-1.5 pr-2.5 pl-3.5">
        <span class="flex min-w-0 flex-1 flex-col"><span class="text-[15px] font-bold">{t('Offene Aufgaben')}</span><span class="text-[13px] text-fg2">{t('ohne Zuständige, ohne Erledigte')}</span></span>
        <Toggle label={t('Offene Aufgaben')} checked={openCards} onchange={(on) => (openCards = on)} />
      </div>
      <div class="flex min-h-[52px] items-center gap-3 rounded-row border border-line bg-bg py-1.5 pr-2.5 pl-3.5">
        <span class="flex min-w-0 flex-1 flex-col"><span class="text-[15px] font-bold">{t('Wer sieht es')}</span><span class="text-[13px] text-fg2">{t('wie beim Original')}</span></span>
        <Toggle label={t('Wer sieht es')} checked={keepVisibility} onchange={(on) => (keepVisibility = on)} />
      </div>
      <div class="flex min-h-[52px] items-center gap-3 rounded-row border border-line bg-bg py-1.5 pr-2.5 pl-3.5">
        <span class="flex min-w-0 flex-1 flex-col"><span class="text-[15px] font-bold">{t('Wächter')}</span><span class="text-[13px] text-fg2">{t('werden nie mitkopiert')}</span></span>
        <Toggle label={t('Wächter')} checked={false} disabled />
      </div>
    </div>
  </form>
  {#snippet footer()}
    <button class="border-line-chip min-h-[50px] rounded-[14px] border bg-surface2 px-2 text-[15px] font-bold" onclick={onclose}>{t('Abbrechen')}</button>
    <button class="bg-accent-grad glow-cta min-h-[50px] rounded-[14px] px-2 text-[15px] font-bold disabled:opacity-40" disabled={busy || !name.trim()} data-testid="duplicate-confirm" onclick={() => submit()}>{t('Duplizieren')}</button>
  {/snippet}
</BoardDialog>
