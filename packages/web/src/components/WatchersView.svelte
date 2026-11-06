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
  import { categoryKeyOf, COL_LAST, COL_MID, COL_WIDE, groupOpen, loadCollapse, saveCollapse, TABLE_COLS, toggleGroup, uncategorizedCount, watcherLayout } from '../lib/watcherList';
  import { noteText, renameCandidates, RUN_TEXT } from '../lib/watchers';
  import { askRenameWatchers, askSuggestWatcherCategories, can, completeCard, openCardAnywhere, openSettings, openSheet, personById, toast, ui, type NewWatcherRequest } from '../lib/store.svelte';
  import robot from '../assets/waechter-robot.webp';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';
  import WatcherDesk from './WatcherDesk.svelte';
  import WatcherRow from './WatcherRow.svelte';
  import WatcherTableRow from './WatcherTableRow.svelte';
  import Banner from './ui/Banner.svelte';
  import ListRow from './ui/ListRow.svelte';
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
  // Neu laden, wenn sich etwas geändert hat (ui.rev, auch durch Live-Sync) und alle 10 Sekunden: ein Vorgang, der anläuft, ändert keine Karte
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
  /** Desktop: das Suchfeld oben filtert nach Name, Gerät, Kategorie, offener Karte und der Karte, die danach kommt */
  const query = $derived(ui.desktop ? ui.query.trim() : '');
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

  /** Wie viele Wächter noch genau wie ihre Vorlage heißen und das Gerät nicht nennen (Sammelknopf, nur Administratoren) */
  const renamable = $derived(can('watchers') ? renameCandidates(ui.watchers?.items ?? []).length : 0);
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

  /** Läuft etwas in den Bereichen unten (Tabellenkopf nur, wenn es Zeilen gibt) */
  const hasRows = $derived(layout.running.length + layout.soon.length + layout.groups.length > 0);

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
   * Gespeichert: der Bereich klappt zu (die Rückfrage „Soll jetzt eine Karte erstellt werden?“ stellt der Editor), die Liste lädt neu,
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
  onMount(() => () => clearTimeout(freshTimer));
</script>

<!-- Das Gerät unter dem Namen (Friendly Name der Entität), eine Zeile, solange der Name es nicht nennt -->
{#snippet subj(subject: string | null)}
  {#if subject}
    <span class="min-w-0 truncate text-tok" data-testid="watcher-subject">{subject}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span>
  {/if}
{/snippet}

<!-- Die Zeilen eines Bereichs: auf dem Desktop eine Tabelle mit Spalten, auf dem Handy kompakte Zeilen untereinander -->
{#snippet rowList(list: HomeItem[], current: boolean)}
  {#if ui.desktop}
    <ul class="mt-2 divide-y divide-line overflow-hidden rounded-row border border-line bg-surface">
      {#each list as i (i.watcherId)}
        <WatcherTableRow item={i} {nowMs} {canToggle} busy={busy.includes(i.watcherId)} fresh={fresh === i.watcherId} onopen={() => openWatcher(i.watcherId)} ontoggle={(on) => void setActive(i, on)} />
      {/each}
    </ul>
  {:else}
    <ul class="mt-2 flex flex-col gap-2">
      {#each list as i (i.watcherId)}
        <li data-testid="watcher-row"><WatcherRow item={i} {nowMs} {current} {canToggle} busy={busy.includes(i.watcherId)} onopen={() => openWatcher(i.watcherId)} ontoggle={(on) => void setActive(i, on)} /></li>
      {/each}
    </ul>
  {/if}
{/snippet}

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col lg:max-w-none">
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-[calc(var(--safe-top)+8px)] pb-fab lg:-mx-1 lg:px-1 lg:pt-0" data-testid="home">
    <div class="flex flex-col gap-3.5">
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
          <span class="flex-1"></span>
          {#if can('watchers') && found > 0 && data?.available}
            <button
              type="button"
              class="flex h-11 items-center gap-2 rounded-row border border-line bg-surface px-4 text-[15px] font-bold hover:bg-surface2"
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
        <!-- „Deine Wächter": Karte mit dem Roboter (Text echt und übersetzbar, nur der Roboter ist ein Bild) -->
        <div class="relative h-[88px] min-w-0 overflow-hidden rounded-[18px]" style="background-image: var(--banner-warm)" data-testid="watchers-hero">
          <img
            src={robot}
            alt=""
            width="264"
            height="176"
            class="absolute inset-y-0 right-0 h-full w-auto [mask-image:linear-gradient(to_right,transparent,black_45%)]"
            data-testid="watchers-robot"
          />
          <div class="relative flex h-full max-w-[64%] flex-col justify-center gap-0.5 pl-4">
            <h2 class="text-[17px] leading-tight font-extrabold tracking-tight text-on-banner">{t('Deine Wächter')}</h2>
            <p class="text-[12px] leading-[1.3] text-(--banner-warm-sub)">{t('Behalten dein Zuhause im Blick und erstellen automatisch Aufgaben – direkt aus Home Assistant.')}</p>
          </div>
        </div>
      {/if}

      {#if !ui.desktop && can('watchers') && found > 0 && data?.available}
        <div data-testid="home-found">
          <Banner
            wrap
            title={tn('Stups hat {n} weiteres Gerät gefunden', 'Stups hat {n} weitere Geräte gefunden', found)}
            sub={t('Tippe, um passende Wächter anzulegen.')}
            onclick={() => openSheet({ type: 'found' })}
          >
            {#snippet leading()}<span class="text-banner-radio"><Icon name="radio" size={34} stroke={1.9} /></span>{/snippet}
            {#snippet trailing()}<Icon name="chevron-right" size={20} stroke={2} />{/snippet}
          </Banner>
        </div>
      {/if}

      {#if renamable > 0 && data?.available}
        <div data-testid="home-rename">
          <Banner wrap title={t('Namen mit Gerät ergänzen')} sub={tn('{n} Wächter ohne Gerät im Namen', '{n} Wächter ohne Gerät im Namen', renamable)} onclick={() => askRenameWatchers(renamable)}>
            {#snippet leading()}<span class="text-banner-radio"><Icon name="eye" size={30} stroke={1.9} /></span>{/snippet}
            {#snippet trailing()}<Icon name="chevron-right" size={20} stroke={2} />{/snippet}
          </Banner>
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
        <div class="rounded-row border border-line bg-surface p-5 text-center" data-testid="home-offline">
          <Icon name="wifi-off" size={28} />
          <p class="mt-2 text-[17px] font-semibold">
            {data.lostSince ? t('Keine Verbindung zu Home Assistant seit {time}', { time: formatDue(data.lostSince, nowMs) }) : t('Keine Verbindung zu Home Assistant')}
          </p>
          <p class="mt-1 text-[15px] text-fg2">{t('Boards und Karten funktionieren weiter. Sobald die Verbindung steht, erscheint hier wieder, was das Haus tut.')}</p>
        </div>
      {:else if allItems.length === 0}
        <div class="rounded-row border border-line bg-surface p-5" data-testid="home-empty">
          <p class="text-[17px] font-semibold">{t('Noch kein Wächter')}</p>
          <p class="mt-1 text-[15px] text-fg2">
            {t('Ein Wächter beobachtet zum Beispiel die Waschmaschine und legt von selbst die Karte „ausräumen" an, für jemanden, der gerade zu Hause ist.')}
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
        {#if query && items.length === 0}
          <p class="py-10 text-center text-fg2" data-testid="home-no-match">{t('Keine Treffer')}</p>
        {/if}
        {#if layout.waiting.length > 0}
          <section aria-label={t('Wartet auf jemanden')} data-testid="home-waiting">
            <SectionHeader title={t('Wartet auf jemanden')} icon="alert" iconTone="red" count={layout.waiting.length} large open={!closed.includes('waiting')} ontoggle={() => toggle('waiting')} />
            {#if !closed.includes('waiting')}
              <ul class="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
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
                          <button class="bg-accent-grad glow-pill flex h-[34px] shrink-0 items-center gap-[5px] rounded-[12px] pr-3 pl-2.5 text-[13px] font-bold" onclick={() => openSheet({ type: 'nudge', id: card.id })}>
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
          {#if ui.desktop && hasRows}
            <div class="sticky top-0 z-10 -mx-1 bg-bg px-1 pt-1" data-testid="watcher-table-head">
              <div class="grid items-center gap-x-3 rounded-row border border-transparent px-3.5 py-1.5 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase {TABLE_COLS}">
                <span>{t('Wächter')}</span>
                <span class={COL_MID}>{t('Bedingung')}</span>
                <span>{t('Aktuell')}</span>
                <span>{t('Status')}</span>
                <span class={COL_LAST}>{t('Zuletzt')}</span>
                <span class={COL_WIDE}>{t('Nächste Karte')}</span>
                <span class={COL_WIDE}>{t('Zuständig')}</span>
                <span class="flex justify-end"><span class="sr-only">{t('Aktiv')}</span></span>
              </div>
            </div>
          {/if}

          {#each [{ key: 'running', title: t('Läuft gerade'), icon: 'play', tone: 'green', list: layout.running, label: t('Läuft gerade') }, { key: 'soon', title: t('Kommt bald'), icon: 'calendar', tone: 'orange', list: layout.soon, label: t('Kommt bald') }] as sec (sec.key)}
            {#if sec.list.length > 0}
              <section aria-label={sec.label} data-testid="home-{sec.key}">
                <SectionHeader title={sec.title} icon={sec.icon} iconTone={sec.tone as 'green' | 'orange'} count={sec.list.length} large open={!closed.includes(sec.key)} ontoggle={() => toggle(sec.key)} />
                {#if !closed.includes(sec.key)}{@render rowList(sec.list, true)}{/if}
              </section>
            {/if}
          {/each}

          {#if layout.groups.length > 0}
            <section aria-label={t('Kategorien')} class="flex flex-col gap-3" data-testid="watcher-categories">
              {#each layout.groups as g (g.key)}
                <div data-testid="watcher-category" data-category={g.name ?? ''}>
                  <SectionHeader title={g.name ?? t('Ohne Kategorie')} icon="folder" iconTone="soft" count={g.items.length} large open={open(g.key)} ontoggle={() => toggleCategory(g.key)} />
                  {#if open(g.key)}{@render rowList(g.items, false)}{/if}
                </div>
              {/each}
            </section>
          {/if}
        </div>

        {#if activity.length > 0}
          <section aria-label={t('Letzte Aktivität')} data-testid="home-activity">
            <SectionHeader title={t('Letzte Aktivität')} large />
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
      {/if}

      {#if can('watchers')}
        <!-- Verwalten, Gefunden und Vorlagen bleiben in den Einstellungen erreichbar -->
        <ListRow title={t('Alle Wächter verwalten')} onclick={() => openSettings('watchers')}>
          {#snippet tile()}<Tile color="gray"><Icon name="settings" size={24} /></Tile>{/snippet}
          {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>{/snippet}
        </ListRow>
      {/if}
    </div>
  </div>

  {#if !ui.desktop && can('watchers') && data?.available}
    <button
      class="fab-grad fixed right-[max(1rem,calc((100vw-720px)/2+1rem))] bottom-[calc(var(--nav-h)+16px)] z-30 flex h-[58px] w-[58px] items-center justify-center rounded-btn"
      aria-label={t('Neuer Wächter')}
      onclick={() => openSheet({ type: 'watcher', id: null })}
    >
      <Icon name="plus" size={28} stroke={2.4} />
    </button>
  {/if}
</main>
