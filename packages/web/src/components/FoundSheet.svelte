<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import { startOfTomorrow } from '../lib/datetime';
  import { t } from '../lib/i18n/index.svelte';
  import type { Recurrence } from '../lib/recurrence';
  import type { WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import { closeSheet, openSheet, refresh, toast, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import SelectField from './SelectField.svelte';
  import Sheet from './Sheet.svelte';

  /**
   * Gefunden: Stups hat in Home Assistant nachgesehen und zeigt, wozu ein Wächter passen würde (Waschmaschine, Trockner, Abfallkalender …),
   * dazu „Auch ohne Gerät" (wiederkehrende Karten aus Vorlage) und alle Vorlagen. Nur für Administratoren.
   */
  let suggestions = $state<WatcherSuggestion[] | null>(null);
  /** Ausgeblendet: nicht mehr vorgeschlagen, hier wieder einblendbar */
  let hidden = $state<WatcherSuggestion[]>([]);
  let showHidden = $state(false);
  let templates = $state<WatcherTemplate[]>([]);
  let error = $state('');
  let showAll = $state(false);
  let boardId = $state(ui.boardId ?? ui.boards[0]?.id ?? '');
  let busy = $state<string | null>(null);

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
  }

  const titleOf = (id: string) => templates.find((x) => x.id === id)?.title ?? id;
  const device = $derived(templates.filter((x) => x.kind === 'watcher'));
  const recurring = $derived(templates.filter((x) => x.kind === 'recurring'));

  function setup(s: WatcherSuggestion) {
    openSheet({ type: 'watcher', id: null, template: s.templateId, from: 'found', hit: { entityId: s.entityId, name: s.name, ...(s.label ? { label: s.label } : {}), ...(s.unit ? { unit: s.unit } : {}), ...(s.draft ? { draft: s.draft } : {}) } });
  }

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

  /** Eine wiederkehrende Karte aus der Vorlage: morgen zur Standard-Uhrzeit, danach wie die Wiederholung es sagt */
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
      toast(t('Karte „{title}“ angelegt', { title: tpl.recurring.title }));
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Anlegen fehlgeschlagen'), { tone: 'error' });
    }
    busy = null;
  }
</script>

<Sheet title={t('Gefunden')} onclose={closeSheet}>
  {#if suggestions === null}
    <p class="py-10 text-center text-fg2">{t('Stups sieht in Home Assistant nach …')}</p>
  {:else}
    {#if error}
      <p class="mt-4 rounded-2xl bg-danger-bg px-4 py-3 text-[15px] text-danger" data-testid="found-error">{error}</p>
    {:else}
      <Group title={t('Gefunden')} hint={t('Stups hat in Home Assistant Geräte gefunden, zu denen ein Wächter passt. Tippe auf „Einrichten“: der Satz ist schon ausgefüllt.')}>
        {#each suggestions as s (s.templateId + s.entityId)}
          <div class="flex items-center gap-3 px-4 py-3" data-testid="found-hit">
            <span class="shrink-0 text-house"><Icon name="eye" size={20} /></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[16px] font-semibold">{titleOf(s.templateId)}</span>
              <span class="block text-[13px] text-fg2">{s.reason}</span>
            </span>
            <span class="flex shrink-0 flex-col items-stretch gap-1">
              <button class="min-h-10 rounded-xl bg-house px-4 font-semibold text-bg" onclick={() => setup(s)}>{t('Einrichten')}</button>
              <button class="min-h-9 rounded-xl px-4 text-[14px] font-semibold text-fg2" aria-label={t('{name} ausblenden', { name: s.name })} data-testid="found-hide" onclick={() => hide(s)}>{t('Ausblenden')}</button>
            </span>
          </div>
        {:else}
          <p class="px-4 py-4 text-[15px] text-fg2">{t('Stups hat nichts gefunden, das zu einer Vorlage passt. Unten gibt es alle Vorlagen zum Einrichten von Hand.')}</p>
        {/each}
      </Group>
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
      <Group title={t('Auch ohne Gerät')} hint={t('Kein Gerät nötig: eine Karte, die sich in diesem Rhythmus von selbst wiederholt. Sie wird auf dem gewählten Board angelegt.')}>
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
          <button class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left" onclick={() => openSheet({ type: 'watcher', id: null, template: tpl.id, from: 'found' })}>
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
</Sheet>
