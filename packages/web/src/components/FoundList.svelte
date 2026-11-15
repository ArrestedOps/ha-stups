<script lang="ts">
  import { onMount } from 'svelte';
  import { FoundModel } from '../lib/found-model.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import { ui } from '../lib/store.svelte';
  import FoundHits from './FoundHits.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import SelectField from './SelectField.svelte';

  /**
   * Der Inhalt von „Gefunden", im Fenster der App (FoundSheet) und im Schritt „Dein erster Wächter" der Einrichtung: Stups hat in Home Assistant
   * nachgesehen und zeigt, wozu ein Wächter passen würde (Waschmaschine, Trockner, Abfallkalender …), dazu „Auch ohne Gerät" (wiederkehrende
   * Aufgaben aus Vorlage) und alle Vorlagen. Nur für Administratoren. Daten und Auswahl gehören dem `FoundModel` (der Desktop nutzt dasselbe).
   * `onsetup`: „Einrichten" bei einem Treffer; `ontemplate`: eine Vorlage ohne Gerät aus „Alle Vorlagen ansehen".
   */
  let {
    onsetup,
    ontemplate,
    onsetupmany,
  }: {
    onsetup: (s: WatcherSuggestion) => void;
    ontemplate: (tpl: WatcherTemplate) => void;
    /** Mehrere Treffer derselben Art gemeinsam einrichten; ohne diese Angabe (Einrichtung beim ersten Start) gibt es kein Auswählen */
    onsetupmany?: (hits: WatcherSuggestion[]) => void;
  } = $props();
  const m = new FoundModel();
  let showHidden = $state(false);
  let showAll = $state(false);
  let boardId = $state(ui.boardId ?? ui.boards[0]?.id ?? '');

  const bulkActions = $derived([
    { id: 'setup', label: t('Einrichten'), run: () => (m.selectedHits.length === 1 ? onsetup(m.selectedHits[0]!) : onsetupmany?.(m.selectedHits)) },
    { id: 'hide', label: t('Ausblenden'), run: () => void m.hideSelected() },
  ]);
  /** Gibt es Treffer, die zur Auswahl nicht passen? Dann erklärt ein Hinweis die grauen Zeilen */
  const hasBlocked = $derived(m.selectedHits.length > 0 && (m.suggestions ?? []).some((s) => m.blocked(s)));

  onMount(() => void m.load());
</script>

{#if m.suggestions === null}
  <p class="py-10 text-center text-fg2">{t('Stups sieht in Home Assistant nach …')}</p>
{:else}
  {#if m.error}
    <p class="mt-4 rounded-2xl bg-danger-bg px-4 py-3 text-[15px] text-danger" data-testid="found-error">{m.error}</p>
  {:else}
    <p class="mt-3 px-1 text-[12.5px] leading-[1.45] text-hint">{t('Stups hat in Home Assistant Geräte gefunden, zu denen ein Wächter passt. Tippe auf „Einrichten“: der Satz ist schon ausgefüllt.')}</p>
    {#if m.suggestions.length > 0}
      <FoundHits
        suggestions={m.suggestions}
        templates={m.device}
        {onsetup}
        onhide={(s) => m.hide(s)}
        selectable={!!onsetupmany}
        selected={m.selectedHits}
        blockedReason={m.blocked}
        onpick={m.pick}
        onpickgroup={m.pickGroup}
        onreplace={m.replaceWith}
      />
      {#if hasBlocked}
        <p class="mt-3 flex flex-wrap items-center gap-x-2 px-1 text-[12.5px] leading-[1.45] text-hint" data-testid="found-lock-hint">
          <span>{t('Nur Treffer einer Art lassen sich zusammen einrichten. Graue Treffer haben einen anderen Auslöser.')}</span>
          <button type="button" class="font-bold text-accent-text" onclick={m.clear}>{t('Auswahl ändern')}</button>
        </p>
      {/if}
      {#if m.selectedHits.length > 0}<SelectionBar inSheet count={m.selectedHits.length} actions={bulkActions} ondone={m.clear} doneLabel={t('Auswahl aufheben')} />{/if}
    {:else}
      <p class="mt-3 rounded-row border border-line bg-surface px-4 py-4 text-[15px] text-fg2">{t('Stups hat nichts gefunden, das zu einer Vorlage passt. Unten gibt es alle Vorlagen zum Einrichten von Hand.')}</p>
    {/if}
  {/if}

  {#if m.hidden.length > 0}
    <button class="mt-4 flex min-h-12 w-full items-center justify-between rounded-2xl border border-line px-4 text-[16px] font-semibold" aria-expanded={showHidden} data-testid="found-hidden-toggle" onclick={() => (showHidden = !showHidden)}>
      {t('Ausgeblendet ({n})', { n: m.hidden.length })}<Icon name={showHidden ? 'chevron-up' : 'chevron-down'} size={18} />
    </button>
    {#if showHidden}
      <div class="mt-2">
        <Group hint={t('Diese Treffer schlägt Stups nicht mehr vor. Mit „Wieder anzeigen“ kommen sie zurück.')}>
          {#each m.hidden as s (s.templateId + s.entityId)}
            <div class="flex items-center gap-3 px-4 py-3" data-testid="found-hidden">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[16px] font-semibold">{m.titleOf(s.templateId)}</span>
                <span class="block text-[13px] text-fg2">{s.name}</span>
              </span>
              <button class="min-h-10 shrink-0 rounded-xl bg-surface2 px-4 font-semibold" aria-label={t('{name} wieder anzeigen', { name: s.name })} onclick={() => m.unhide(s)}>{t('Wieder anzeigen')}</button>
            </div>
          {/each}
        </Group>
      </div>
    {/if}
  {/if}

  {#if m.recurring.length > 0}
    <Group title={t('Auch ohne Gerät')} hint={t('Kein Gerät nötig: eine Aufgabe, die sich in diesem Rhythmus von selbst wiederholt. Sie wird auf dem gewählten Board angelegt.')}>
      {#if ui.boards.length > 1}
        <div class="flex items-center justify-between gap-3 px-4 py-2">
          <span class="text-[15px]">{t('Auf Board')}</span>
          <SelectField bind:value={boardId} label={t('Board')}>
            {#each ui.boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
          </SelectField>
        </div>
      {/if}
      {#each m.recurring as tpl (tpl.id)}
        <div class="flex items-center gap-3 px-4 py-3">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[16px] font-semibold">{tpl.title}</span>
            <span class="block text-[13px] text-fg2">{tpl.hint}</span>
          </span>
          <button class="min-h-10 shrink-0 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={m.busy !== null || !boardId} onclick={() => m.createRecurring(tpl, boardId)}>{t('Anlegen')}</button>
        </div>
      {/each}
    </Group>
  {/if}

  <button class="mt-5 flex min-h-12 w-full items-center justify-between rounded-2xl border border-line px-4 text-[16px] font-semibold" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
    {t('Alle Vorlagen ansehen')}<Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={18} />
  </button>
  {#if showAll}
    <div class="mt-2 divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-surface">
      {#each m.device as tpl (tpl.id)}
        <button class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left" onclick={() => ontemplate(tpl)}>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[16px] font-semibold">{tpl.title}</span>
            <span class="block text-[13px] text-fg2">{tpl.hint}</span>
          </span>
          <Icon name="chevron-right" size={18} />
        </button>
      {/each}
    </div>
  {/if}
{/if}
