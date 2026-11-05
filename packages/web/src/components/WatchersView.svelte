<script lang="ts">
  import { clock } from '../lib/clock.svelte';
  import { onMount } from 'svelte';
  import { api, type HomeState, type WatcherActivity } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { durationText, homeSections, openSinceText } from '../lib/home';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { canNudge } from '../lib/nudge';
  import { matchesQuery } from '../lib/search';
  import { noteText, RUN_TEXT } from '../lib/watchers';
  import { completeCard, openCardAnywhere, openSettings, openSheet, personById, ui } from '../lib/store.svelte';
  import robot from '../assets/waechter-robot.webp';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';
  import Banner from './ui/Banner.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';

  let data = $state<HomeState | null>(null);
  /** Wie viele weitere Geräte Stups in Home Assistant gefunden hat (nur Administratoren) */
  let found = $state(0);
  let failed = $state(false);
  let request = 0;
  /** Was die Wächter zuletzt getan haben (für alle lesbar) */
  let activity = $state<WatcherActivity[]>([]);

  async function load() {
    const mine = ++request;
    if (ui.isAdmin) api.watcherSuggestions().then((r) => (found = r.items.length)).catch(() => (found = 0));
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
  // Neu laden, wenn sich etwas geändert hat (ui.rev, auch durch Live-Sync) und alle 30 Sekunden: ein Vorgang, der anläuft, ändert keine Karte
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
  /** Desktop: das Suchfeld oben filtert nach Name, offener Karte und der Karte, die danach kommt */
  const query = $derived(ui.desktop ? ui.query : '');
  const items = $derived(query ? allItems.filter((i) => matchesQuery(query, i.name, i.openCard?.title, i.nextCard)) : allItems);
  const sections = $derived(homeSections(items));
  const names = (ids: string[]) => ids.map((id) => personById(id)?.displayName ?? '?').join(', ');
  /** Ein Wächter öffnet sich: Administratoren bearbeiten ihn dort, alle anderen sehen Einstellungen und Verlauf lesend */
  const openWatcher = (id: string) => openSheet({ type: 'watcher', id });
  const PHASE_TILE: Record<string, TileColor> = { waiting: 'orange', running: 'green', soon: 'blue', quiet: 'teal' };
  let closed = $state<string[]>([]);
  const toggle = (key: string) => (closed = closed.includes(key) ? closed.filter((k) => k !== key) : [...closed, key]);
  // Ruhig: eine Zusammenfassung („5 Wächter ohne offene Aktion"), die sich auf die einzelnen Wächter aufklappen lässt; fehlt eine Entität, steht dieser Wächter immer einzeln da
  let quietOpen = $state(false);
  const quietFine = $derived(sections.quiet.filter((i) => !i.entityMissing));
  const quietMissing = $derived(sections.quiet.filter((i) => i.entityMissing));
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col lg:max-w-none">
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-[calc(var(--safe-top)+8px)] pb-fab lg:-mx-1 lg:px-1 lg:pt-0" data-testid="home">
    <div class="flex flex-col gap-3.5">
      <TopBar title={t('Wächter')} sub={t('Automatische Aufgaben aus Home Assistant.')} />

      <!-- „Deine Wächter": Karte mit dem Roboter (Text echt und übersetzbar, nur der Roboter ist ein Bild) -->
      <div class="flex items-stretch gap-3">
      <div class="relative h-[88px] min-w-0 flex-1 overflow-hidden rounded-[18px]" style="background-image: var(--banner-warm)" data-testid="watchers-hero">
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
      {#if ui.desktop && ui.isAdmin && data?.available}
        <button class="fab-grad flex w-[200px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[18px] text-[15px] font-extrabold hover:brightness-110" data-testid="new-watcher" onclick={() => openSheet({ type: 'watcher', id: null })}>
          <Icon name="plus" size={26} stroke={2.4} />{t('Neuer Wächter')}
        </button>
      {/if}
      </div>

      {#if ui.isAdmin && found > 0 && data?.available}
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
      {:else if items.length === 0}
        <div class="rounded-row border border-line bg-surface p-5" data-testid="home-empty">
          <p class="text-[17px] font-semibold">{t('Noch kein Wächter')}</p>
          <p class="mt-1 text-[15px] text-fg2">
            {t('Ein Wächter beobachtet zum Beispiel die Waschmaschine und legt von selbst die Karte „ausräumen" an, für jemanden, der gerade zu Hause ist.')}
          </p>
          {#if ui.isAdmin}
            <button class="bg-accent-grad glow-cta mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-btn text-[17px] font-extrabold" onclick={() => openSettings('watchers')}>
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
        {#if sections.waiting.length > 0}
          <section aria-label={t('Wartet auf jemanden')} data-testid="home-waiting">
            <SectionHeader title={t('Wartet auf jemanden')} icon="alert" iconTone="red" count={sections.waiting.length} large open={!closed.includes('waiting')} ontoggle={() => toggle('waiting')} />
            {#if !closed.includes('waiting')}
              <ul class="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {#each sections.waiting as i (i.watcherId)}
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
                      {#snippet tile()}<Tile color={PHASE_TILE.waiting!}><Icon name="eye" size={24} /></Tile>{/snippet}
                      {#snippet meta()}
                        <span class="inline-flex shrink-0 items-center gap-1"><Icon name="user" size={14} stroke={1.9} /><span class="max-w-[7rem] truncate">{card.assigneeIds.length ? names(card.assigneeIds) : t('Noch niemand zuständig')}</span></span>
                        <span class="shrink-0 text-sep" aria-hidden="true">•</span>
                        <span class="inline-flex shrink-0 items-center gap-1"><Icon name="clock" size={14} stroke={1.9} />{openSinceText(card.createdAt, nowMs)}</span>
                        <span class="shrink-0 text-sep" aria-hidden="true">•</span>
                        <span class="min-w-0 truncate text-house">{i.name}</span>
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

        {#if sections.running.length > 0}
          <section aria-label={t('Läuft gerade')} data-testid="home-running">
            <SectionHeader title={t('Läuft gerade')} icon="play" iconTone="green" count={sections.running.length} large open={!closed.includes('running')} ontoggle={() => toggle('running')} />
            {#if !closed.includes('running')}
              <ul class="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {#each sections.running as i (i.watcherId)}
                  <li>
                    <ListRow title={i.name} label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                      {#snippet tile()}<Tile color={PHASE_TILE.running!}><Icon name="eye" size={24} /></Tile>{/snippet}
                      {#snippet meta()}
                        <span class="inline-flex shrink-0 items-center gap-1"><Icon name="play" size={14} stroke={1.9} />{i.since ? durationText(i.since, nowMs) : ''}</span>
                        <span class="shrink-0 text-sep" aria-hidden="true">•</span>
                        <span class="inline-flex min-w-0 items-center gap-1"><Icon name="robot" size={14} stroke={1.9} /><span class="truncate">{t('danach: {title}', { title: i.nextCard })}</span></span>
                      {/snippet}
                      {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>{/snippet}
                    </ListRow>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}

        {#if sections.soon.length > 0}
          <section aria-label={t('Kommt bald')} data-testid="home-soon">
            <SectionHeader title={t('Kommt bald')} icon="calendar" iconTone="orange" count={sections.soon.length} large open={!closed.includes('soon')} ontoggle={() => toggle('soon')} />
            {#if !closed.includes('soon')}
              <ul class="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {#each sections.soon as i (i.watcherId)}
                  <li>
                    <ListRow title={i.name} label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                      {#snippet tile()}<Tile color={PHASE_TILE.soon!}><Icon name="eye" size={24} /></Tile>{/snippet}
                      {#snippet meta()}
                        {#if i.progress}<span class="inline-flex shrink-0 items-center gap-1"><Icon name="robot" size={14} stroke={1.9} />{t('{n} von {total}', { n: i.progress.n, total: i.progress.of })}</span>{/if}
                        {#if i.progress && i.nextEvent}<span class="shrink-0 text-sep" aria-hidden="true">•</span>{/if}
                        {#if i.nextEvent}<span class="inline-flex min-w-0 items-center gap-1"><Icon name="calendar" size={14} stroke={1.9} /><span class="truncate">{i.nextEvent.title} · {formatDue(i.nextEvent.at, nowMs)}</span></span>{/if}
                      {/snippet}
                      {#snippet right()}
                        {#if i.progress}
                          <!-- Zähler mit drei Balken: gefüllt nach Anteil -->
                          {@const filled = Math.round((Math.min(i.progress.n, i.progress.of) / Math.max(i.progress.of, 1)) * 3)}
                          <span class="mr-1 flex items-center gap-1" role="img" aria-label={t('Zähler {n} von {total}', { n: i.progress.n, total: i.progress.of })}>
                            {#each [0, 1, 2] as k (k)}<i class="h-1.5 w-[22px] rounded-[3px] {k < filled ? 'bg-accent-text' : 'bg-track'}"></i>{/each}
                          </span>
                        {:else}
                          <span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>
                        {/if}
                      {/snippet}
                    </ListRow>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}

        {#if sections.quiet.length > 0}
          <section aria-label={t('Ruhig')} data-testid="home-quiet">
            <SectionHeader title={t('Ruhig')} icon="done" iconTone="green" count={sections.quiet.length} large open={!closed.includes('quiet')} ontoggle={() => toggle('quiet')} />
            {#if !closed.includes('quiet')}
              <ul class="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {#each quietMissing as i (i.watcherId)}
                  <li>
                    <ListRow title={i.name} label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                      {#snippet tile()}<Tile color={PHASE_TILE.quiet!}><Icon name="eye" size={24} /></Tile>{/snippet}
                      {#snippet meta()}<span class="text-danger">{t('Entität fehlt')}</span>{/snippet}
                      {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>{/snippet}
                    </ListRow>
                  </li>
                {/each}
                {#if quietFine.length > 0}
                  <li>
                    <ListRow title={tn('{n} Wächter ohne offene Aktion', '{n} Wächter ohne offene Aktion', quietFine.length)} onclick={() => (quietOpen = !quietOpen)}>
                      {#snippet tile()}<Tile color="green"><Icon name="leaf" size={24} /></Tile>{/snippet}
                      {#snippet meta()}<span class="inline-flex items-center gap-1"><Icon name="done" size={14} stroke={1.9} />{t('Alles im grünen Bereich')}</span>{/snippet}
                      {#snippet right()}<span class="flex text-text-soft2"><Icon name={quietOpen ? 'chevron-down' : 'chevron-right'} size={20} stroke={2} /></span>{/snippet}
                    </ListRow>
                  </li>
                  {#if quietOpen}
                    {#each quietFine as i (i.watcherId)}
                      <li>
                        <ListRow title={i.name} label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                          {#snippet tile()}<Tile color={PHASE_TILE.quiet!}><Icon name="eye" size={24} /></Tile>{/snippet}
                          {#snippet meta()}{t('Alles im grünen Bereich')}{/snippet}
                          {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>{/snippet}
                        </ListRow>
                      </li>
                    {/each}
                  {/if}
                {/if}
              </ul>
            {/if}
          </section>
        {/if}

        {#if activity.length > 0}
          <section aria-label={t('Letzte Aktivität')} data-testid="home-activity">
            <SectionHeader title={t('Letzte Aktivität')} large />
            <ul class="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {#each activity as r (r.id)}
                <li>
                  <ListRow title="{r.watcherName} · {RUN_TEXT[r.result] ?? r.result}" label={t('Wächter {name} öffnen', { name: r.watcherName })} onclick={() => openWatcher(r.watcherId)}>
                    {#snippet meta()}<span class="truncate">{formatDue(r.at, nowMs)}{r.assignedTo.length ? ` · ${names(r.assignedTo)}` : ''}{r.note ? ` · ${noteText(r.note)}` : ''}</span>{/snippet}
                  </ListRow>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      {/if}

      {#if ui.isAdmin}
        <!-- Verwalten, Gefunden und Vorlagen bleiben in den Einstellungen erreichbar -->
        <ListRow title={t('Alle Wächter verwalten')} onclick={() => openSettings('watchers')}>
          {#snippet tile()}<Tile color="gray"><Icon name="settings" size={24} /></Tile>{/snippet}
          {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>{/snippet}
        </ListRow>
      {/if}
    </div>
  </div>

  {#if !ui.desktop && ui.isAdmin && data?.available}
    <button
      class="fab-grad fixed right-[max(1rem,calc((100vw-720px)/2+1rem))] bottom-[calc(var(--nav-h)+16px)] z-30 flex h-[58px] w-[58px] items-center justify-center rounded-btn"
      aria-label={t('Neuer Wächter')}
      onclick={() => openSheet({ type: 'watcher', id: null })}
    >
      <Icon name="plus" size={28} stroke={2.4} />
    </button>
  {/if}
</main>
