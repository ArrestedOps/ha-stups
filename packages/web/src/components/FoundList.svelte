<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import { startOfTomorrow } from '../lib/datetime';
  import { hitId } from '../lib/foundGroups';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { clearAll, prune, selectAll, toggle, type Selection } from '../lib/selection';
  import type { Recurrence } from '../lib/recurrence';
  import type { WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import { refresh, toast, ui } from '../lib/store.svelte';
  import FoundHits from './FoundHits.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import SelectField from './SelectField.svelte';

  /**
   * Der Inhalt von „Gefunden", im Fenster der App (FoundSheet) und im Schritt „Dein erster Wächter" der Einrichtung: Stups hat in Home Assistant
   * nachgesehen und zeigt, wozu ein Wächter passen würde (Waschmaschine, Trockner, Abfallkalender …), dazu „Auch ohne Gerät" (wiederkehrende
   * Aufgaben aus Vorlage) und alle Vorlagen. Nur für Administratoren.
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
  let suggestions = $state<WatcherSuggestion[] | null>(null);
  /** Ausgeblendet: nicht mehr vorgeschlagen, hier wieder einblendbar */
  let hidden = $state<WatcherSuggestion[]>([]);
  let showHidden = $state(false);
  let templates = $state<WatcherTemplate[]>([]);
  let error = $state('');
  let showAll = $state(false);
  let boardId = $state(ui.boardId ?? ui.boards[0]?.id ?? '');
  let busy = $state<string | null>(null);

  // Mehrere Treffer auswählen: gemeinsam einrichten oder ausblenden
  let selecting = $state(false);
  let selection = $state<Selection>(clearAll());
  const selectedHits = $derived((suggestions ?? []).filter((s) => selection.has(hitId(s))));
  const endSelecting = () => {
    selecting = false;
    selection = clearAll();
  };
  async function hideMany() {
    const hits = selectedHits.map((s) => ({ templateId: s.templateId, entityId: s.entityId }));
    if (hits.length === 0) return;
    try {
      await api.hideSuggestions(hits);
      toast(tn('{n} Treffer ausgeblendet. Stups schlägt sie nicht mehr vor.', '{n} Treffer ausgeblendet. Stups schlägt sie nicht mehr vor.', hits.length));
      selection = clearAll();
      await loadSuggestions();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Ausblenden fehlgeschlagen'), { tone: 'error' });
    }
  }
  const bulkActions = $derived([
    { id: 'setup', label: t('Einrichten'), run: () => (selectedHits.length === 1 ? onsetup(selectedHits[0]!) : onsetupmany?.(selectedHits)) },
    { id: 'hide', label: t('Ausblenden'), run: () => void hideMany() },
  ]);

  onMount(async () => {
    templates = await api.watcherTemplates().catch(() => []);
    try {
      await loadSuggestions();
    } catch (e) {
      suggestions = [];
      error = e instanceof ApiError ? e.message : t('Keine Verbindung zu Home Assistant');
    }
  });

  async function loadSuggestions() {
    const r = await api.watcherSuggestions();
    suggestions = r.items;
    hidden = r.hidden ?? [];
    // Treffer, die es nicht mehr gibt (eingerichtet, ausgeblendet, in Home Assistant weg), fallen aus der Auswahl
    selection = prune(selection, r.items.map(hitId));
  }

  const titleOf = (id: string) => templates.find((x) => x.id === id)?.title ?? id;
  const device = $derived(templates.filter((x) => x.kind === 'watcher'));
  const recurring = $derived(templates.filter((x) => x.kind === 'recurring'));

  /** Ausblenden gilt für immer (in der Datenbank), bis der Treffer hier wieder eingeblendet wird */
  async function hide(s: WatcherSuggestion) {
    try {
      await api.hideSuggestion(s.templateId, s.entityId);
      toast(t('„{name}“ ausgeblendet. Stups schlägt es nicht mehr vor.', { name: s.name }));
      await loadSuggestions();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Ausblenden fehlgeschlagen'), { tone: 'error' });
    }
  }

  async function unhide(s: WatcherSuggestion) {
    try {
      await api.unhideSuggestion(s.templateId, s.entityId);
      await loadSuggestions();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Einblenden fehlgeschlagen'), { tone: 'error' });
    }
  }

  /** Eine wiederkehrende Aufgabe aus der Vorlage: morgen zur Standard-Uhrzeit, danach wie die Wiederholung es sagt */
  async function createRecurring(tpl: WatcherTemplate) {
    if (!tpl.recurring || !boardId || busy) return;
    busy = tpl.id;
    try {
      const view = await api.board(boardId);
      const column = view.columns.find((c) => !c.isDone && !c.isPlanned) ?? view.columns[0];
      if (!column) throw new Error(t('Das Board hat keine Spalte'));
      const [h, m] = (ui.settings?.defaultDueTime ?? '09:00').split(':').map(Number) as [number, number];
      const due = new Date(startOfTomorrow() + (h * 60 + m) * 60_000);
      await api.createCard(boardId, { columnId: column.id, title: tpl.recurring.title, dueAt: due.toISOString(), recurrence: tpl.recurring.recurrence as unknown as Recurrence });
      toast(t('Aufgabe „{title}“ angelegt', { title: tpl.recurring.title }));
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Anlegen fehlgeschlagen'), { tone: 'error' });
    }
    busy = null;
  }
</script>

  {#if suggestions === null}
  <p class="py-10 text-center text-fg2">{t('Stups sieht in Home Assistant nach …')}</p>
{:else}
  {#if error}
    <p class="mt-4 rounded-2xl bg-danger-bg px-4 py-3 text-[15px] text-danger" data-testid="found-error">{error}</p>
  {:else}
    <p class="mt-3 px-1 text-[12.5px] leading-[1.45] text-hint">{t('Stups hat in Home Assistant Geräte gefunden, zu denen ein Wächter passt. Tippe auf „Einrichten“: der Satz ist schon ausgefüllt.')}</p>
    {#if suggestions.length > 0}
      {#if onsetupmany}
        <div class="mt-3 flex justify-end">
          <button
            type="button"
            class="flex h-11 items-center gap-2 rounded-row border px-4 text-[15px] font-bold {selecting ? 'border-accent text-accent-text' : 'border-line bg-surface'}"
            aria-pressed={selecting}
            data-testid="select-mode"
            onclick={() => (selecting ? endSelecting() : (selecting = true))}
          >
            <Icon name="checklist" size={18} stroke={2} />{t('Auswählen')}
          </button>
        </div>
      {/if}
      <FoundHits
        {suggestions}
        templates={device}
        {onsetup}
        onhide={hide}
        {selecting}
        selected={selectedHits}
        onpick={(s) => (selection = toggle(selection, hitId(s)))}
        onpickgroup={(items) => {
          const ids = items.map(hitId);
          selection = ids.every((id) => selection.has(id)) ? new Set([...selection].filter((id) => !ids.includes(id))) : selectAll(selection, ids);
        }}
      />
      {#if selecting}<SelectionBar inSheet count={selectedHits.length} actions={bulkActions} ondone={endSelecting} />{/if}
    {:else}
      <p class="mt-3 rounded-row border border-line bg-surface px-4 py-4 text-[15px] text-fg2">{t('Stups hat nichts gefunden, das zu einer Vorlage passt. Unten gibt es alle Vorlagen zum Einrichten von Hand.')}</p>
    {/if}
  {/if}

  {#if hidden.length > 0}
    <button class="mt-4 flex min-h-12 w-full items-center justify-between rounded-2xl border border-line px-4 text-[16px] font-semibold" aria-expanded={showHidden} data-testid="found-hidden-toggle" onclick={() => (showHidden = !showHidden)}>
      {t('Ausgeblendet ({n})', { n: hidden.length })}<Icon name={showHidden ? 'chevron-up' : 'chevron-down'} size={18} />
    </button>
    {#if showHidden}
      <div class="mt-2">
        <Group hint={t('Diese Treffer schlägt Stups nicht mehr vor. Mit „Wieder anzeigen“ kommen sie zurück.')}>
          {#each hidden as s (s.templateId + s.entityId)}
            <div class="flex items-center gap-3 px-4 py-3" data-testid="found-hidden">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[16px] font-semibold">{titleOf(s.templateId)}</span>
                <span class="block text-[13px] text-fg2">{s.name}</span>
              </span>
              <button class="min-h-10 shrink-0 rounded-xl bg-surface2 px-4 font-semibold" aria-label={t('{name} wieder anzeigen', { name: s.name })} onclick={() => unhide(s)}>{t('Wieder anzeigen')}</button>
            </div>
          {/each}
        </Group>
      </div>
    {/if}
  {/if}

  {#if recurring.length > 0}
    <Group title={t('Auch ohne Gerät')} hint={t('Kein Gerät nötig: eine Aufgabe, die sich in diesem Rhythmus von selbst wiederholt. Sie wird auf dem gewählten Board angelegt.')}>
      {#if ui.boards.length > 1}
        <div class="flex items-center justify-between gap-3 px-4 py-2">
          <span class="text-[15px]">{t('Auf Board')}</span>
          <SelectField bind:value={boardId} label={t('Board')}>
            {#each ui.boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
          </SelectField>
        </div>
      {/if}
      {#each recurring as tpl (tpl.id)}
        <div class="flex items-center gap-3 px-4 py-3">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[16px] font-semibold">{tpl.title}</span>
            <span class="block text-[13px] text-fg2">{tpl.hint}</span>
          </span>
          <button class="min-h-10 shrink-0 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={busy !== null || !boardId} onclick={() => createRecurring(tpl)}>{t('Anlegen')}</button>
        </div>
      {/each}
    </Group>
  {/if}

  <button class="mt-5 flex min-h-12 w-full items-center justify-between rounded-2xl border border-line px-4 text-[16px] font-semibold" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
    {t('Alle Vorlagen ansehen')}<Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={18} />
  </button>
  {#if showAll}
    <div class="mt-2 divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-surface">
      {#each device as tpl (tpl.id)}
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
