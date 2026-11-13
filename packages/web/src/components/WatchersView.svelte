<script lang="ts">
  import { clock } from '../lib/clock.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { api, ApiError, type HomeItem, type HomeState, type WatcherActivity } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { openSinceText } from '../lib/home';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { canNudge } from '../lib/nudge';
  import { matchesQuery } from '../lib/search';
  import { listSummary } from '../lib/watcher-desk';
  import { WatcherEditor } from '../lib/watcher-editor.svelte';
  import type { SavedWatcher } from '../lib/watcher-types';
  import { categoryKeyOf, COL_LAST, COL_WIDE, groupOpen, loadCollapse, saveCollapse, TABLE_COLS, toggleGroup, uncategorizedCount, watcherLayout } from '../lib/watcherList';
  import { noteText, RUN_TEXT } from '../lib/watchers';
  import { askSuggestWatcherCategories, can, completeCard, openCardAnywhere, openNewWatcher, openSettings, openSheet, personById, toast, ui, type NewWatcherRequest } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';
  import WatcherDesk from './WatcherDesk.svelte';
  import WatcherRow from './WatcherRow.svelte';
  import WatcherSheet from './WatcherSheet.svelte';
  import WatcherTableRow from './WatcherTableRow.svelte';
  import Segmented from './ui/Segmented.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Banner from './ui/Banner.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';

  let data = $state<HomeState | null>(null);
  /** Wie viele weitere Geräte Stups in Home Assistant gefunden hat (nur Administratoren) */
  let found = $state(0);
  let failed = $state(false);
  let request = 0;
  /** Was die Wächter zuletzt getan haben (für alle lesbar) */
  let activity = $state<WatcherActivity[]>([]);

  async function load() {
    const mine = ++request;
    if (can('watchers')) api.watcherSuggestions().then((r) => (found = r.items.length)).catch(() => (found = 0));
    api.watcherActivity().then((a) => (activity = a)).catch(() => undefined);
    try {
      const d = await api.home();
      if (mine === request) {
        data = d;
        failed = false;
      }
    } catch {
      if (mine === request) failed = true;
    }
  }
  // Neu laden, wenn sich etwas geändert hat (ui.rev, auch durch Live-Sync) und alle 10 Sekunden: ein Vorgang, der anläuft, ändert keine Aufgabe
  $effect(() => {
    void ui.rev;
    void load();
  });
  onMount(() => {
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  });

  const nowMs = $derived((void data, void clock.tick, Date.now()));
  const allItems = $derived(data?.items ?? []);
  /** Desktop: das Suchfeld oben filtert nach Name, Gerät, Kategorie, offener Aufgabe und der Aufgabe, die danach kommt */
  let phoneQuery = $state('');
  const query = $derived((ui.desktop ? ui.query : phoneQuery).trim());
  const items = $derived(query ? allItems.filter((i) => matchesQuery(query, i.name, i.subject, i.entity, i.category, i.openCard?.title, i.nextCard)) : allItems);
  const layout = $derived(watcherLayout(items));
  const names = (ids: string[]) => ids.map((id) => personById(id)?.displayName ?? '?').join(', ');
  /** Ein Wächter öffnet sich: Administratoren bearbeiten ihn dort, alle anderen sehen Einstellungen und Verlauf lesend */
  const openWatcher = (id: string) => openSheet({ type: 'watcher', id });
  let closed = $state<string[]>([]);
  const toggle = (key: string) => (closed = closed.includes(key) ? closed.filter((k) => k !== key) : [...closed, key]);

  // Kategorien: auf- und zuklappbar, der Zustand wird je Gerät gemerkt (Standard: aufgeklappt); bei einer Suche sind Treffer-Gruppen offen
  let memo = $state(loadCollapse());
  const open = (key: string) => groupOpen(key, memo, query !== '');
  function toggleCategory(key: string) {
    memo = toggleGroup(memo, key, open(key));
    saveCollapse(memo);
  }

  // Desktop: die Seitenleiste wählt (ui.watcherScope), was die Tabelle zeigt: alle, ein Zustand oder eine Kategorie; immer nach Kategorie gruppiert
  const scope = $derived(ui.watcherScope);
  const scopeAll = $derived(!ui.desktop);
  const paused = $derived(items.filter((i) => !i.active));
  const scopeItems = $derived.by(() => {
    if (scope === 'problem') return layout.problems;
    if (scope === 'waiting') return layout.waiting;
    if (scope === 'running') return layout.running;
    if (scope === 'soon') return layout.soon;
    if (scope === 'paused') return paused;
    return items;
  });
  const deskGroups = $derived.by(() => {
    const groups = groupItems(scopeItems);
    return scope.startsWith('cat:') ? groups.filter((g) => `cat:${g.key}` === scope) : groups;
  });
  /** Zahlen und Kategorien für die Seitenleiste (die Gruppe „Wächter“ dort) */
  $effect(() => {
    if (!ui.desktop) return;
    ui.watcherNav = {
      counts: { all: allItems.length, problem: layoutAll.problems.length, waiting: layoutAll.waiting.length, running: layoutAll.running.length, soon: layoutAll.soon.length, paused: allItems.filter((i) => !i.active).length },
      cats: groupItems(allItems).map((g) => ({ key: g.key, name: g.name, n: g.items.length })),
    };
  });
  $effect(() => {
    // die gewählte Kategorie gibt es nicht mehr: zurück zu „Alle“
    if (scope.startsWith('cat:') && data && !groupItems(allItems).some((g) => `cat:${g.key}` === scope)) ui.watcherScope = 'all';
  });
  const layoutAll = $derived(watcherLayout(allItems));
  /** Desktop: der aufgeklappte Wächter (Ablauf direkt unter der Zeile) und der Reiter Wächter / Aktivität */
  let openId = $state<string | null>(null);
  let deskTab = $state<'list' | 'activity'>('list');
  const toggleOpen = (id: string) => (openId = openId === id ? null : id);

  // Desktop: Mehrfachauswahl und Sammelaktionen (Pausieren, Aktivieren) für viele gleiche Wächter, zum Beispiel 100 Batterien
  let selected = $state<string[]>([]);
  const toggleSelected = (id: string, on: boolean) => (selected = on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id));
  $effect(() => {
    const ids = new Set(allItems.map((i) => i.watcherId));
    if (selected.some((id) => !ids.has(id))) selected = selected.filter((id) => ids.has(id));
  });
  async function bulkActive(on: boolean) {
    const targets = allItems.filter((i) => selected.includes(i.watcherId) && i.active !== on);
    for (const i of targets) await setActive(i, on);
    selected = [];
  }

  // Handy: eine Kategorie öffnet als eigene Seite (einheitlich für alle, auch mit 100 Batterien): Suche, Filter, „Mehr anzeigen“
  const PAGE_SIZE = 30;
  let page = $state<string | null>(null);
  let pageQuery = $state('');
  let pageFilter = $state<'all' | 'active' | 'off'>('all');
  let pageLimit = $state(PAGE_SIZE);
  /** Handy: alle Wächter einer Kategorie, auch die gerade laufenden oder wartenden (sie stehen oben zusätzlich); so wandert keiner beim Umschalten aus der Seite */
  function groupItems(list: HomeItem[]) {
    const byKey = new Map<string, { key: string; name: string | null; items: HomeItem[] }>();
    for (const i of list) {
      const key = categoryKeyOf(i.category);
      let g = byKey.get(key);
      if (!g) byKey.set(key, (g = { key, name: i.category?.trim() ? i.category.trim().replace(/\s+/g, ' ') : null, items: [] }));
      g.items.push(i);
    }
    for (const g of byKey.values()) g.items.sort((a, b) => a.name.localeCompare(b.name) || (a.subject ?? '').localeCompare(b.subject ?? '') || a.watcherId.localeCompare(b.watcherId));
    return [...byKey.values()].sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
  }
  const phoneGroups = $derived(groupItems(items));
  // Menü „…“ der Kategorie-Seite: alle pausieren oder aktivieren, neuer Wächter in dieser Kategorie
  let pageMenu = $state(false);
  async function pageActive(on: boolean) {
    pageMenu = false;
    for (const i of pageGroup?.items ?? []) if (i.active !== on) await setActive(i, on);
  }
  const pageGroup = $derived(page ? (phoneGroups.find((g) => g.key === page) ?? null) : null);
  function openPage(key: string) {
    page = key;
    pageQuery = '';
    pageFilter = 'all';
    pageLimit = PAGE_SIZE;
  }
  const pageItems = $derived.by(() => {
    const g = pageGroup;
    if (!g) return [];
    const q = pageQuery.trim();
    return g.items.filter((i) => (pageFilter === 'all' || (pageFilter === 'active' ? i.active : !i.active)) && (!q || matchesQuery(q, i.name, i.subject, i.entity, i.openCard?.title, i.nextCard)));
  });
  const pageCounts = $derived({ all: pageGroup?.items.length ?? 0, active: pageGroup?.items.filter((i) => i.active).length ?? 0, off: pageGroup?.items.filter((i) => !i.active).length ?? 0 });
  const groupSummary = (list: HomeItem[]) => {
    const off = list.filter((i) => !i.active).length;
    return [tn('{n} Wächter', '{n} Wächter', list.length), off > 0 ? t('{n} aus', { n: off }) : ''].filter(Boolean).join(' · ');
  };

  /** Wie viele Wächter noch genau wie ihre Vorlage heißen und das Gerät nicht nennen (Sammelknopf, nur Administratoren) */
  /** Wie viele Wächter noch keine Kategorie haben (Sammelknopf „Kategorien vorschlagen", nur mit dem Recht „watchers") */
  const uncategorized = $derived(can('watchers') ? uncategorizedCount(allItems) : 0);

  // Schalter „aktiv/aus": sofort umschalten, der Server entscheidet (ohne Recht 403: dann springt er zurück und eine Meldung sagt warum)
  const canToggle = $derived(can('watchers'));
  let busy = $state<string[]>([]);
  const patchItem = (id: string, patch: Partial<HomeItem>) => {
    if (data) data = { ...data, items: data.items.map((i) => (i.watcherId === id ? { ...i, ...patch } : i)) };
  };
  async function setActive(i: HomeItem, on: boolean) {
    if (busy.includes(i.watcherId)) return;
    busy = [...busy, i.watcherId];
    patchItem(i.watcherId, { active: on });
    try {
      await api.updateWatcher(i.watcherId, { active: on });
      ui.watchers = await api.watchers().catch(() => ui.watchers);
      ui.rev += 1;
    } catch (e) {
      patchItem(i.watcherId, { active: !on });
      toast(e instanceof ApiError ? e.message : t('Änderung fehlgeschlagen'), { tone: 'error' });
    } finally {
      busy = busy.filter((x) => x !== i.watcherId);
    }
  }

  // ---------- Desktop: „Neuer Wächter“ klappt über der Liste auf (statt Fenster mit vier Schritten) ----------

  /** Das offene Formular (null: zu); jedes Aufklappen bekommt einen frischen Editor, der Entwurf geht beim Zuklappen verloren */
  let desk = $state.raw<{ ed: WatcherEditor; init: NewWatcherRequest } | null>(null);
  let deskRef = $state<{ requestClose(): void }>();
  /** Der gerade angelegte Wächter: seine Zeile ist kurz hervorgehoben */
  let fresh = $state<string | null>(null);
  let freshTimer: ReturnType<typeof setTimeout> | undefined;
  const summary = $derived(listSummary(allItems));
  const canCreate = $derived(can('watchers') && !!data?.available);

  function openDesk(init: NewWatcherRequest = {}) {
    desk = { ed: new WatcherEditor(null, { onsaved: created }), init };
  }
  const closeDesk = () => (desk = null);
  const toggleDesk = () => (desk ? deskRef?.requestClose() : openDesk());

  // Anfragen aus „Gefunden“ und den Einstellungen (siehe `openNewWatcher`): aufklappen, mit Vorlage oder Treffer vorbelegt
  $effect(() => {
    const request = ui.newWatcher;
    if (!request) return;
    untrack(() => {
      ui.newWatcher = null;
      if (canCreate) openDesk(request);
    });
  });
  // Auf das Handy verkleinert: der Assistent ist ein Fenster, das Formular gilt nur am Desktop
  $effect(() => {
    if (!ui.desktop) desk = null;
  });

  /**
   * Gespeichert: der Bereich klappt zu (die Rückfrage „Soll jetzt eine Aufgabe erstellt werden?“ stellt der Editor), die Liste lädt neu,
   * die Gruppe des neuen Wächters klappt auf, und seine Zeile wird kurz hervorgehoben und ins Bild gescrollt.
   */
  async function created(saved: SavedWatcher) {
    desk = null;
    ui.watchers = await api.watchers().catch(() => ui.watchers);
    await load();
    ui.rev += 1;
    const item = data?.items.find((i) => i.watcherId === saved.id);
    if (item) {
      const key = categoryKeyOf(item.category);
      if (!open(key)) {
        memo = toggleGroup(memo, key, false);
        saveCollapse(memo);
      }
    }
    fresh = saved.id;
    await tick();
    document.querySelector(`[data-watcher-id="${CSS.escape(saved.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => (fresh = null), 3500);
  }
  /** Ein Wächter im aufgeklappten Ablauf wurde gespeichert oder gelöscht: Liste und Seitenleiste neu laden, die Zeile bleibt offen */
  async function afterInline(): Promise<void> {
    ui.watchers = await api.watchers().catch(() => ui.watchers);
    await load();
    ui.rev += 1;
  }
  onMount(() => () => clearTimeout(freshTimer));
</script>

<!-- Desktop: eine Tabelle für alle Wächter, nach Kategorie gruppiert; ein Klick klappt den Ablauf direkt unter der Zeile auf. Reiter „Aktivität“: dieselbe Tabelle. -->
{#snippet deskBody()}
  <div class="flex min-w-0 flex-col gap-3.5">
    {#if deskTab === 'activity'}
      <section aria-label={t('Letzte Aktivität')} data-testid="home-activity">
        {#if activity.length === 0}
          <p class="rounded-row bg-surface px-4 py-8 text-center text-fg2">{t('Noch keine Aktivität.')}</p>
        {:else}
          <ul class="divide-y divide-line overflow-hidden rounded-row bg-surface">
            <li class="grid grid-cols-[150px_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-x-4 px-4 py-2 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" aria-hidden="true">
              <span>{t('Zeit')}</span><span>{t('Wächter')}</span><span>{t('Ergebnis')}</span><span>{t('Zuständig')}</span>
            </li>
            {#each activity as r (r.id)}
              <li>
                <button type="button" class="grid h-[60px] w-full grid-cols-[150px_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-x-4 px-4 text-left text-[14px] hover:bg-surface2" aria-label={t('Wächter {name} öffnen', { name: r.watcherName })} onclick={() => { deskTab = 'list'; ui.watcherScope = 'all'; openId = r.watcherId; }}>
                  <span class="truncate text-fg2">{formatDue(r.at, nowMs)}</span>
                  <span class="min-w-0"><span class="block truncate font-semibold">{r.watcherName}</span>{#if r.subject}<span class="block truncate text-[12.5px] text-fg2">{r.subject}</span>{/if}</span>
                  <span class="truncate">{RUN_TEXT[r.result] ?? r.result}{r.note ? ` · ${noteText(r.note)}` : ''}</span>
                  <span class="truncate text-fg2">{r.assignedTo.length ? names(r.assignedTo) : '–'}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <div class="@container flex flex-col gap-3.5" data-testid="watcher-list">
        {#if selected.length > 0}
          <div class="flex items-center gap-3 rounded-[12px] bg-surface px-4 py-2.5 text-[14px]" role="toolbar" aria-label={t('Sammelaktionen')} data-testid="watcher-bulk">
            <b>{tn('{n} ausgewählt', '{n} ausgewählt', selected.length)}</b>
            <span class="flex-1"></span>
            <button class="h-9 rounded-full bg-surface2 px-4 font-semibold" onclick={() => void bulkActive(false)}>{t('Pausieren')}</button>
            <button class="h-9 rounded-full bg-surface2 px-4 font-semibold" onclick={() => void bulkActive(true)}>{t('Aktivieren')}</button>
            <button class="h-9 px-2 font-semibold text-accent-text" onclick={() => (selected = [])}>{t('Auswahl aufheben')}</button>
          </div>
        {/if}
        {#if query && items.length === 0}
          <p class="py-10 text-center text-fg2" data-testid="home-no-match">{t('Keine Treffer')}</p>
        {:else if deskGroups.length === 0}
          <p class="rounded-row bg-surface px-4 py-8 text-center text-fg2" data-testid="home-scope-empty">{t('Keine Wächter in dieser Ansicht.')}</p>
        {:else}
          <div class="sticky top-0 z-10 -mx-1 bg-bg px-1 pt-1" data-testid="watcher-table-head">
            <div class="grid items-center gap-x-3 rounded-row border border-transparent px-3.5 py-1.5 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase {TABLE_COLS}">
              <span>{t('Wächter')} · {t('Bedingung')}</span>
              <span>{t('Aktuell')}</span>
              <span>{t('Status')}</span>
              <span class={COL_LAST}>{t('Zuletzt')}</span>
              <span class={COL_WIDE}>{t('Nächste Aufgabe')}</span>
              <span class={COL_WIDE}>{t('Zuständig')}</span>
              <span class="flex justify-end"><span class="sr-only">{t('Aktiv')}</span></span>
            </div>
          </div>
          <section aria-label={t('Kategorien')} class="flex flex-col gap-3" data-testid="watcher-categories">
            {#each deskGroups as g (g.key)}
              <div data-testid="watcher-category" data-category={g.name ?? ''}>
                <SectionHeader title={g.name ?? t('Ohne Kategorie')} count={g.items.length} plain open={open(g.key)} ontoggle={() => toggleCategory(g.key)} />
                {#if open(g.key)}
                  <ul class="mt-2 divide-y divide-line overflow-hidden rounded-row border bg-surface border-line">
                    {#each g.items as i (i.watcherId)}
                      <WatcherTableRow item={i} {nowMs} {canToggle} busy={busy.includes(i.watcherId)} fresh={fresh === i.watcherId} open={openId === i.watcherId} selected={selected.includes(i.watcherId)} onselect={canToggle ? (on) => toggleSelected(i.watcherId, on) : undefined} onopen={() => toggleOpen(i.watcherId)} ontoggle={(on) => void setActive(i, on)} />
                      {#if openId === i.watcherId}
                        <li class="bg-surface px-3.5 pt-1 pb-4" data-testid="watcher-inline" data-watcher-open={i.watcherId}>
                          {#if i.openCard}
                            {@const card = i.openCard}
                            <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] bg-surface2 px-3.5 py-2.5 text-[14px]" data-testid="watcher-open-card">
                              <span class="inline-flex min-w-0 items-center gap-1.5"><Icon name="clock" size={15} stroke={1.9} /><b class="truncate">{card.title}</b></span>
                              <span class="text-fg2">{card.assigneeIds.length ? names(card.assigneeIds) : t('Noch niemand zuständig')} · {openSinceText(card.createdAt, nowMs)}</span>
                              <span class="flex-1"></span>
                              {#if canNudge(card, ui.me?.id ?? null)}
                                <button class="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent/14 px-3.5 font-semibold text-accent-text" onclick={() => openSheet({ type: 'nudge', id: card.id })}><Icon name="burst" size={15} stroke={2.2} />{t('Stupsen')}</button>
                              {/if}
                              <button class="inline-flex h-9 items-center rounded-full bg-surface px-3.5 font-semibold" onclick={() => void openCardAnywhere(card)}>{t('Aufgabe öffnen')}</button>
                            </div>
                          {/if}
                          {#key i.watcherId}<WatcherSheet inline id={i.watcherId} onsaved={afterInline} onback={() => { openId = null; void afterInline(); }} />{/key}
                        </li>
                      {/if}
                    {/each}
                  </ul>
                {/if}
              </div>
            {/each}
          </section>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<!-- Das Gerät unter dem Namen (Friendly Name der Entität), eine Zeile -->
{#snippet subj(subject: string | null)}
  {#if subject}
    <span class="min-w-0 truncate text-tok" data-testid="watcher-subject">{subject}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span>
  {/if}
{/snippet}

<!-- Die Zeilen eines Bereichs: auf dem Desktop eine Tabelle mit Spalten, auf dem Handy kompakte Zeilen untereinander -->
{#snippet rowList(list: HomeItem[], current: boolean, problem = false)}
  <ul class="list-group {problem ? 'ring-1 ring-danger' : ''}">
      {#each list as i (i.watcherId)}
        <li data-testid="watcher-row"><WatcherRow item={i} {nowMs} {current} {canToggle} busy={busy.includes(i.watcherId)} onopen={() => openWatcher(i.watcherId)} ontoggle={(on) => void setActive(i, on)} /></li>
      {/each}
    </ul>
{/snippet}

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col lg:max-w-none">
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-[calc(var(--safe-top)+8px)] pb-fab lg:-mx-1 lg:px-1 lg:pt-0" data-testid="home">
    <div class="flex flex-col gap-3.5">
      {#if !ui.desktop && pageGroup}
        <!-- Kategorie als eigene Seite (Handy) -->
        <div data-testid="watcher-page" class="flex flex-col gap-3">
          <div class="relative">
            <button class="-ml-1 inline-flex h-11 items-center gap-0.5 text-[16px] font-semibold text-accent-text" onclick={() => (page = null)}>
              <Icon name="chevron-left" size={22} stroke={2.2} />{t('Wächter')}
            </button>
            {#if canToggle}
              <div class="absolute top-0 right-0">
                <button class="top-circle flex h-10 w-10 items-center justify-center rounded-full bg-surface2" aria-label={t('Menü der Kategorie')} aria-expanded={pageMenu} data-testid="category-menu" onclick={() => (pageMenu = !pageMenu)}>
                  <Icon name="more" size={20} stroke={2.4} />
                </button>
                {#if pageMenu}
                  <div class="absolute top-11 right-0 z-30 flex w-64 flex-col overflow-hidden rounded-[14px] bg-surface text-[16px] shadow-[0_10px_30px_rgba(0,0,0,0.25)]" role="menu">
                    {#if pageGroup.items.some((i) => i.active)}
                      <button class="flex min-h-12 items-center px-4 text-left" role="menuitem" onclick={() => void pageActive(false)}>{t('Alle pausieren')}</button>
                    {/if}
                    {#if pageGroup.items.some((i) => !i.active)}
                      <button class="flex min-h-12 items-center border-t border-line px-4 text-left" role="menuitem" onclick={() => void pageActive(true)}>{t('Alle aktivieren')}</button>
                    {/if}
                    {#if can('watchers')}
                      <button class="flex min-h-12 items-center border-t border-line px-4 text-left" role="menuitem" onclick={() => { pageMenu = false; openNewWatcher(pageGroup.name ? { category: pageGroup.name } : {}); }}>{pageGroup.name ? t('Neuer Wächter in „{name}“', { name: pageGroup.name }) : t('Neuer Wächter')}</button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
            <h1 class="mt-0.5 text-[30px] leading-[1.1] font-extrabold tracking-tight">{pageGroup.name ?? t('Ohne Kategorie')}</h1>
            <p class="mt-1 text-[14px] text-fg2">{groupSummary(pageGroup.items)}</p>
          </div>
          {#if pageGroup.items.length > 8}
            <label class="flex h-11 items-center gap-2 rounded-[12px] bg-surface2 px-3 text-fg2">
              <Icon name="search" size={18} stroke={2} />
              <input class="h-full min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg2" type="search" enterkeyhint="search" placeholder={t('Wächter suchen')} aria-label={t('Wächter suchen')} bind:value={pageQuery} oninput={() => (pageLimit = PAGE_SIZE)} />
            </label>
            <Segmented
              items={[
                { id: 'all', label: `${t('Alle')} · ${pageCounts.all}` },
                { id: 'active', label: `${t('Aktiv')} · ${pageCounts.active}` },
                { id: 'off', label: `${t('Aus')} · ${pageCounts.off}` },
              ]}
              value={pageFilter}
              label={t('Anzeigen')}
              small
              onchange={(v) => {
                pageFilter = v as typeof pageFilter;
                pageLimit = PAGE_SIZE;
              }}
            />
          {/if}
          {#if pageItems.length === 0}
            <p class="py-8 text-center text-fg2">{t('Keine Treffer')}</p>
          {:else}
            <ul class="list-group">
              {#each pageItems.slice(0, pageLimit) as i (i.watcherId)}
                <li data-testid="watcher-row"><WatcherRow item={i} {nowMs} current={false} {canToggle} busy={busy.includes(i.watcherId)} onopen={() => openWatcher(i.watcherId)} ontoggle={(on) => void setActive(i, on)} /></li>
              {/each}
            </ul>
            {#if pageItems.length > pageLimit}
              <button class="flex h-12 items-center justify-center rounded-[12px] bg-surface text-[15px] font-semibold text-accent-text" onclick={() => (pageLimit += PAGE_SIZE)}>
                {t('Mehr anzeigen ({n})', { n: pageItems.length - pageLimit })}
              </button>
            {/if}
          {/if}
        </div>
      {:else}
      <TopBar title={t('Wächter')} sub={t('Automatische Aufgaben aus Home Assistant.')} />

      {#if ui.desktop}
        <!-- Desktop: Leiste über der Liste: links die Zahlen, rechts „Gefunden“ und „Neuer Wächter“; der Knopf klappt das Formular darunter auf -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="watchers-bar">
          {#if data?.available && allItems.length > 0}
            <p class="flex min-w-0 flex-wrap items-baseline gap-x-2.5" data-testid="watchers-summary">
              <span class="text-[17px] font-extrabold tracking-tight">{tn('{n} Wächter', '{n} Wächter', summary.total)}</span>
              <span class="text-[14px] text-fg2">{[summary.current > 0 ? t('{n} aktuell', { n: summary.current }) : '', summary.off > 0 ? t('{n} aus', { n: summary.off }) : ''].filter(Boolean).join(' · ')}</span>
            </p>
          {/if}
          {#if data?.available && allItems.length > 0}
            <Segmented items={[{ id: 'list', label: t('Wächter') }, { id: 'activity', label: t('Aktivität') }]} value={deskTab} label={t('Ansicht')} small onchange={(v) => (deskTab = v as typeof deskTab)} />
          {/if}
          <span class="flex-1"></span>
          {#if can('watchers') && found > 0 && data?.available}
            <button
              type="button"
              class="flex h-11 items-center gap-2 rounded-row bg-surface px-4 text-[15px] font-bold hover:bg-surface2"
              data-testid="home-found"
              aria-label={tn('Gefunden: {n} weiteres Gerät', 'Gefunden: {n} weitere Geräte', found)}
              onclick={() => openSheet({ type: 'found' })}
            >
              <Icon name="eye" size={18} stroke={2} />{t('Gefunden')}
              <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-count px-1.5 text-[12px] font-extrabold text-tok">{found}</span>
            </button>
          {/if}
          {#if canCreate}
            <button
              type="button"
              class="flex h-11 items-center gap-2 rounded-row px-4 text-[15px] font-extrabold {desk ? 'border border-accent bg-surface text-accent-text hover:bg-surface2' : 'fab-grad hover:brightness-110'}"
              data-testid="new-watcher"
              aria-expanded={desk !== null}
              aria-controls="new-watcher-panel"
              onclick={toggleDesk}
            >
              <Icon name={desk ? 'minus' : 'plus'} size={18} stroke={2.4} />{t('Neuer Wächter')}
            </button>
          {/if}
        </div>
        {#if desk}
          <div id="new-watcher-panel" transition:slide={{ duration: 180 }} data-testid="new-watcher-panel">
            {#key desk.ed}<WatcherDesk bind:this={deskRef} ed={desk.ed} init={desk.init} onclose={closeDesk} />{/key}
          </div>
        {/if}
      {:else}
        <!-- Handy: Suche und die Zahlen („111 Wächter · 10 aktuell · 1 aus“) statt des Banners mit dem Roboter -->
        <label class="flex h-9 items-center gap-1.5 rounded-[10px] bg-surface2 px-2.5 text-text-soft">
          <Icon name="search" size={17} stroke={2} />
          <input class="h-full min-w-0 flex-1 bg-transparent text-[17px] text-fg outline-none placeholder:text-text-soft" type="search" enterkeyhint="search" placeholder={t('Wächter, Geräte und Räume suchen')} aria-label={t('Wächter suchen')} bind:value={phoneQuery} />
        </label>
        {#if data?.available && allItems.length > 0}
          <p class="flex flex-wrap items-baseline gap-x-2.5 px-1" data-testid="watchers-summary">
            <span class="text-[20px] font-bold">{tn('{n} Wächter', '{n} Wächter', summary.total)}</span>
            <span class="text-[15px] text-text-soft">{[summary.current > 0 ? t('{n} aktuell', { n: summary.current }) : '', summary.off > 0 ? t('{n} aus', { n: summary.off }) : ''].filter(Boolean).join(' · ')}</span>
          </p>
        {/if}
      {/if}

      {#if !ui.desktop && can('watchers') && found > 0 && data?.available}
        <div data-testid="home-found">
          <button class="flex w-full items-center gap-3 rounded-[16px] bg-accent/12 p-3.5 text-left" onclick={() => openSheet({ type: 'found' })}>
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-brand-dot text-on-accent"><Icon name="search" size={22} stroke={2} /></span>
            <span class="min-w-0 flex-1">
              <b class="block text-[17px] leading-tight font-semibold">{tn('Stups hat {n} weiteres Gerät gefunden', 'Stups hat {n} weitere Geräte gefunden', found)}</b>
              <span class="mt-0.5 block text-[14px] text-text-soft">{t('Tippe, um passende Wächter anzulegen.')}</span>
            </span>
            <span class="text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>
          </button>
        </div>
      {/if}

      {#if uncategorized > 0 && data?.available}
        <div data-testid="home-categorize">
          <Banner wrap title={t('Kategorien vorschlagen')} sub={tn('{n} Wächter ohne Kategorie', '{n} Wächter ohne Kategorie', uncategorized)} onclick={() => askSuggestWatcherCategories(uncategorized)}>
            {#snippet leading()}<span class="text-banner-radio"><Icon name="folder" size={30} stroke={1.9} /></span>{/snippet}
            {#snippet trailing()}<Icon name="chevron-right" size={20} stroke={2} />{/snippet}
          </Banner>
        </div>
      {/if}

      {#if failed && !data}
        <p class="py-10 text-center text-fg2">{t('Die Seite „Wächter“ konnte nicht geladen werden.')}</p>
      {:else if !data}
        <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
      {:else if !data.available}
        <div class="rounded-row bg-surface p-5 text-center" data-testid="home-offline">
          <Icon name="wifi-off" size={28} />
          <p class="mt-2 text-[17px] font-semibold">
            {data.lostSince ? t('Keine Verbindung zu Home Assistant seit {time}', { time: formatDue(data.lostSince, nowMs) }) : t('Keine Verbindung zu Home Assistant')}
          </p>
          <p class="mt-1 text-[15px] text-fg2">{t('Boards und Aufgaben funktionieren weiter. Sobald die Verbindung steht, erscheint hier wieder, was das Haus tut.')}</p>
        </div>
      {:else if allItems.length === 0}
        <div class="rounded-row bg-surface p-5" data-testid="home-empty">
          <p class="text-[17px] font-semibold">{t('Noch kein Wächter')}</p>
          <p class="mt-1 text-[15px] text-fg2">
            {t('Ein Wächter beobachtet zum Beispiel die Waschmaschine und legt von selbst die Aufgabe „ausräumen" an, für jemanden, der gerade zu Hause ist.')}
          </p>
          {#if can('watchers')}
            <button class="bg-accent-grad glow-cta mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-btn text-[17px] font-extrabold" onclick={() => (ui.desktop ? openDesk() : openSettings('watchers'))}>
              <Icon name="eye" size={18} />{t('Wächter einrichten')}
            </button>
          {:else}
            <p class="mt-3 text-[15px]" data-testid="watchers-empty-member">{t('Ein Administrator von Home Assistant kann Wächter einrichten. Sobald es welche gibt, siehst du sie hier.')}</p>
          {/if}
        </div>
      {:else}
        {#if ui.desktop}
          {@render deskBody()}
        {:else}
        <div class={ui.desktop ? 'flex items-start gap-6' : 'contents'}>
          <div class={ui.desktop ? 'flex min-w-0 flex-1 flex-col gap-3.5' : 'contents'}>
        {#if query && items.length === 0}
          <p class="py-10 text-center text-fg2" data-testid="home-no-match">{t('Keine Treffer')}</p>
        {/if}
        <!-- Wächter mit Problem (keine Zuständigen, Entität oder Ziel fehlt): ganz oben, vor allem anderen, mit rotem Rand und dem Grund als Text -->
        {#if layout.problems.length > 0 && (scopeAll || scope === 'problem')}
          <section class="@container" aria-label={t('Wächter mit Problem')} data-testid="home-problems">
            <SectionHeader title={t('Mit Problem')} count={layout.problems.length} plain tone="danger" />
            {@render rowList(layout.problems, false, true)}
          </section>
        {/if}
        {#if layout.waiting.length > 0 && (scopeAll || scope === 'waiting')}
          <section aria-label={t('Wartet auf jemanden')} data-testid="home-waiting">
            <SectionHeader title={t('Wartet auf jemanden')} count={layout.waiting.length} plain open={!closed.includes('waiting')} ontoggle={() => toggle('waiting')} />
            {#if !closed.includes('waiting')}
              <ul class={ui.desktop ? 'mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3' : 'list-group !mt-0'}>
                {#each layout.waiting as i (i.watcherId)}
                  {@const card = i.openCard!}
                  {@const canStupse = canNudge(card, ui.me?.id ?? null)}
                  <li>
                    <ListRow
                      variant="task"
                      title={card.title}
                      check={{
                        done: false,
                        label: t('„{title}“ erledigen', { title: card.title }),
                        onchange: () => void completeCard(card),
                        disabled: ui.isChild && !card.assigneeIds.includes(ui.me?.id ?? ''),
                      }}
                      onclick={() => void openCardAnywhere(card)}
                    >
                      {#snippet tile()}<Tile color="orange"><Icon name="eye" size={24} /></Tile>{/snippet}
                      {#snippet meta()}
                        <span class="inline-flex shrink-0 items-center gap-1"><Icon name="user" size={14} stroke={1.9} /><span class="max-w-[7rem] truncate">{card.assigneeIds.length ? names(card.assigneeIds) : t('Noch niemand zuständig')}</span></span>
                        <span class="shrink-0 text-sep" aria-hidden="true">•</span>
                        <span class="inline-flex shrink-0 items-center gap-1"><Icon name="clock" size={14} stroke={1.9} />{openSinceText(card.createdAt, nowMs)}</span>
                        <span class="shrink-0 text-sep" aria-hidden="true">•</span>
                        <span class="min-w-0 truncate text-house">{i.name}{i.subject ? ` · ${i.subject}` : ''}</span>
                      {/snippet}
                      {#snippet right()}
                        {#if canStupse}
                          <button class="flex h-[34px] shrink-0 items-center gap-[5px] rounded-full bg-accent/14 pr-3.5 pl-3 text-[14px] font-semibold text-accent-text" onclick={() => openSheet({ type: 'nudge', id: card.id })}>
                            <Icon name="burst" size={15} stroke={2.2} />{t('Stupsen')}
                          </button>
                        {:else}
                          <button class="flex h-11 w-7 shrink-0 items-center justify-center text-text-soft2" aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                            <Icon name="chevron-right" size={20} stroke={2} />
                          </button>
                        {/if}
                      {/snippet}
                    </ListRow>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}

        <!-- Alle übrigen Wächter: Läuft gerade, Kommt bald, dann die Kategorien. Jeder Wächter steht genau einmal da. Die Breite der Liste
             bestimmt auf dem Desktop die Spalten (Container-Abfrage). -->
        <div class="@container flex flex-col gap-3.5" data-testid="watcher-list">
          {#each [{ key: 'running', title: t('Läuft gerade'), icon: 'play', tone: 'green', list: layout.running, label: t('Läuft gerade') }, { key: 'soon', title: t('Kommt bald'), icon: 'calendar', tone: 'orange', list: layout.soon, label: t('Kommt bald') }] as sec (sec.key)}
            {#if sec.list.length > 0 && (scopeAll || scope === sec.key)}
              <section aria-label={sec.label} data-testid="home-{sec.key}">
                <SectionHeader title={sec.title} count={sec.list.length} plain open={!closed.includes(sec.key)} ontoggle={() => toggle(sec.key)} />
                {#if !closed.includes(sec.key)}{@render rowList(sec.list, true)}{/if}
              </section>
            {/if}
          {/each}

          {#if phoneGroups.length > 0}
            <section aria-label={t('Kategorien')} data-testid="watcher-categories">
              <SectionHeader title={t('Kategorien')} count={phoneGroups.length} plain />
              <ul class="list-group">
                {#each phoneGroups as g (g.key)}
                  <li data-testid="watcher-category" data-category={g.name ?? ''}>
                    <ListRow title={g.name ?? t('Ohne Kategorie')} label={t('Kategorie {name} öffnen', { name: g.name ?? t('Ohne Kategorie') })} onclick={() => openPage(g.key)}>
                      {#snippet tile()}<Tile color="gray"><Icon name="folder" size={24} /></Tile>{/snippet}
                      {#snippet meta()}<span class="min-w-0 truncate">{groupSummary(g.items)}</span>{/snippet}
                      {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>{/snippet}
                    </ListRow>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>

        {#if activity.length > 0 && scopeAll}
          <section aria-label={t('Letzte Aktivität')} data-testid="home-activity">
            <SectionHeader title={t('Letzte Aktivität')} plain />
            <ul class="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {#each activity as r (r.id)}
                <li>
                  <ListRow title="{r.watcherName} · {RUN_TEXT[r.result] ?? r.result}" label={t('Wächter {name} öffnen', { name: r.watcherName })} onclick={() => openWatcher(r.watcherId)}>
                    {#snippet meta()}{@render subj(r.subject ?? null)}<span class="min-w-0 truncate">{formatDue(r.at, nowMs)}{r.assignedTo.length ? ` · ${names(r.assignedTo)}` : ''}{r.note ? ` · ${noteText(r.note)}` : ''}</span>{/snippet}
                  </ListRow>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
          </div>
        </div>
        {/if}
      {/if}

      {#if !ui.desktop && can('watchers') && data?.available}
        <div class="list-group !mt-0">
          <button class="flex h-[46px] w-full items-center gap-3 px-3.5 text-left text-[17px] font-medium text-accent-text" onclick={() => openSheet({ type: 'watcher', id: null })}>
            <span class="flex h-[30px] w-[30px] items-center justify-center"><Icon name="plus" size={22} stroke={2.2} /></span>{t('Neuer Wächter')}
          </button>
        </div>
      {/if}

      {#if can('watchers') && !ui.desktop}
        <!-- Verwalten, Gefunden und Vorlagen bleiben in den Einstellungen erreichbar (am Desktop ist die Seite selbst die Verwaltung) -->
        <ListRow title={t('Alle Wächter verwalten')} onclick={() => openSettings('watchers')}>
          {#snippet tile()}<Tile color="gray"><Icon name="settings" size={24} /></Tile>{/snippet}
          {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>{/snippet}
        </ListRow>
      {/if}
      {/if}
    </div>
  </div>

</main>
