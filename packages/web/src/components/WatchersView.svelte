<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type HomeState, type WatcherActivity } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { durationText, homeSections } from '../lib/home';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { canNudge } from '../lib/nudge';
  import { noteText, RUN_TEXT } from '../lib/watchers';
  import { ageText } from '../lib/today';
  import { openCardAnywhere, openSettings, openSheet, personById, ui } from '../lib/store.svelte';
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

  const nowMs = $derived((void data, Date.now()));
  const items = $derived(data?.items ?? []);
  const sections = $derived(homeSections(items));
  const names = (ids: string[]) => ids.map((id) => personById(id)?.displayName ?? '?').join(', ');
  /** Ein Wächter öffnet sich: Administratoren bearbeiten ihn dort, alle anderen sehen Einstellungen und Verlauf lesend */
  const openWatcher = (id: string) => openSheet({ type: 'watcher', id });
  const PHASE_TILE: Record<string, TileColor> = { waiting: 'orange', running: 'green', soon: 'blue', quiet: 'teal' };
  let closed = $state<string[]>([]);
  const toggle = (key: string) => (closed = closed.includes(key) ? closed.filter((k) => k !== key) : [...closed, key]);
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col px-3 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0">
    <TopBar />
    <div class="mt-1 mb-3 flex items-center gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-[30px] leading-tight font-extrabold tracking-tight">{t('Wächter')}</h1>
        <p class="mt-1 text-[14px] text-fg2">{t('Was das Haus gerade tut')}{items.length > 0 ? ` · ${ui.isAdmin ? t('Tippe auf einen Wächter, um ihn zu bearbeiten.') : t('Tippe auf einen Wächter, um ihn anzusehen.')}` : ''}</p>
      </div>
      <!-- Das Roboter-Bild ist Zierde (alt leer): der Text daneben trägt die Bedeutung -->
      <img src={robot} alt="" width="64" height="44" class="h-11 w-16 shrink-0 rounded-[12px] object-cover" data-testid="watchers-robot" />
    </div>
  </header>

  <div class="-mr-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-3 pb-fab" data-testid="home">
    {#if ui.isAdmin && found > 0 && data?.available}
      <div class="mb-3.5" data-testid="home-found">
        <Banner
          title={tn('Stups hat {n} weiteres Gerät gefunden', 'Stups hat {n} weitere Geräte gefunden', found)}
          sub={t('Tippe, um passende Wächter anzulegen.')}
          onclick={() => openSheet({ type: 'found' })}
        >
          {#snippet leading()}<Icon name="eye" size={24} />{/snippet}
          {#snippet trailing()}<Icon name="chevron-right" size={18} />{/snippet}
        </Banner>
      </div>
    {/if}
    {#if failed && !data}
      <p class="py-10 text-center text-fg2">{t('Die Seite „Wächter“ konnte nicht geladen werden.')}</p>
    {:else if !data}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else if !data.available}
      <div class="mt-4 rounded-row border border-line bg-surface p-5 text-center" data-testid="home-offline">
        <Icon name="wifi-off" size={28} />
        <p class="mt-2 text-[17px] font-semibold">
          {data.lostSince ? t('Keine Verbindung zu Home Assistant seit {time}', { time: formatDue(data.lostSince, nowMs) }) : t('Keine Verbindung zu Home Assistant')}
        </p>
        <p class="mt-1 text-[15px] text-fg2">{t('Boards und Karten funktionieren weiter. Sobald die Verbindung steht, erscheint hier wieder, was das Haus tut.')}</p>
      </div>
    {:else if items.length === 0}
      <div class="mt-2 rounded-row border border-line bg-surface p-5" data-testid="home-empty">
        <img src={robot} alt="" width="160" height="110" class="mx-auto mb-4 h-[110px] w-40 rounded-[16px] object-cover" />
        <p class="text-[17px] font-semibold">{t('Noch kein Wächter')}</p>
        <p class="mt-1 text-[15px] text-fg2">
          {t('Ein Wächter beobachtet zum Beispiel die Waschmaschine und legt von selbst die Karte „ausräumen" an, für jemanden, der gerade zu Hause ist.')}
        </p>
        {#if ui.isAdmin}
          <button class="bg-accent-grad mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-btn text-[17px] font-extrabold" onclick={() => openSettings('watchers')}>
            <Icon name="eye" size={18} />{t('Wächter einrichten')}
          </button>
        {:else}
          <p class="mt-3 text-[15px]" data-testid="watchers-empty-member">{t('Ein Administrator von Home Assistant kann Wächter einrichten. Sobald es welche gibt, siehst du sie hier.')}</p>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3.5">
        {#if sections.waiting.length > 0}
          <section aria-label={t('Wartet auf jemanden')} data-testid="home-waiting">
            <SectionHeader title={t('Wartet auf jemanden')} icon="clock" tone="house" count={sections.waiting.length} large open={!closed.includes('waiting')} ontoggle={() => toggle('waiting')} />
            {#if !closed.includes('waiting')}
              <ul class="mt-2 flex flex-col gap-2">
                {#each sections.waiting as i (i.watcherId)}
                  {@const card = i.openCard!}
                  <li>
                    <ListRow title={card.title} onclick={() => void openCardAnywhere(card)}>
                      {#snippet tile()}<Tile color={PHASE_TILE.waiting!}><Icon name="eye" size={20} /></Tile>{/snippet}
                      {#snippet meta()}<span class="truncate"><span class="text-house">{i.name}</span> · {ageText(card.createdAt, nowMs)} · {card.assigneeIds.length ? names(card.assigneeIds) : t('Noch niemand zuständig')}</span>{/snippet}
                      {#snippet right()}
                        <span class="flex items-center gap-1">
                          {#if canNudge(card, ui.me?.id ?? null)}
                            <button class="bg-accent-grad flex h-9 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-bold" onclick={() => openSheet({ type: 'nudge', id: card.id })}>
                              <Icon name="hand" size={16} />{t('Stupsen')}
                            </button>
                          {/if}
                          <button class="flex h-11 w-8 items-center justify-center text-fg2" aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                            <Icon name="more" size={18} />
                          </button>
                        </span>
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
            <SectionHeader title={t('Läuft gerade')} icon="check" count={sections.running.length} large open={!closed.includes('running')} ontoggle={() => toggle('running')} />
            {#if !closed.includes('running')}
              <ul class="mt-2 flex flex-col gap-2">
                {#each sections.running as i (i.watcherId)}
                  <li>
                    <ListRow title={i.name} label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                      {#snippet tile()}<Tile color={PHASE_TILE.running!}><Icon name="eye" size={20} /></Tile>{/snippet}
                      {#snippet meta()}<span class="truncate">{i.since ? durationText(i.since, nowMs) : ''} · {t('danach: {title}', { title: i.nextCard })}</span>{/snippet}
                      {#snippet right()}<Icon name="chevron-right" size={18} />{/snippet}
                    </ListRow>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}

        {#if sections.soon.length > 0}
          <section aria-label={t('Kommt bald')} data-testid="home-soon">
            <SectionHeader title={t('Kommt bald')} icon="calendar" count={sections.soon.length} large open={!closed.includes('soon')} ontoggle={() => toggle('soon')} />
            {#if !closed.includes('soon')}
              <ul class="mt-2 flex flex-col gap-2">
                {#each sections.soon as i (i.watcherId)}
                  <li>
                    <ListRow title={i.name} label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                      {#snippet tile()}<Tile color={PHASE_TILE.soon!}><Icon name="eye" size={20} /></Tile>{/snippet}
                      {#snippet meta()}
                        <span class="truncate">
                          {#if i.progress}{t('{n} von {total}', { n: i.progress.n, total: i.progress.of })}{/if}
                          {#if i.progress && i.nextEvent} · {/if}
                          {#if i.nextEvent}{i.nextEvent.title} · {formatDue(i.nextEvent.at, nowMs)}{/if}
                        </span>
                      {/snippet}
                      {#snippet right()}
                        {#if i.progress}
                          <!-- Zähler mit höchstens drei Balken: gefüllt nach Anteil -->
                          {@const filled = Math.round((Math.min(i.progress.n, i.progress.of) / Math.max(i.progress.of, 1)) * 3)}
                          <span class="flex items-center gap-1" role="img" aria-label={t('Zähler {n} von {total}', { n: i.progress.n, total: i.progress.of })}>
                            {#each [0, 1, 2] as k (k)}<i class="h-1.5 w-4 rounded-full {k < filled ? 'bg-accent' : 'bg-track'}"></i>{/each}
                          </span>
                        {:else}
                          <Icon name="chevron-right" size={18} />
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
            <SectionHeader title={t('Ruhig')} icon="check" count={sections.quiet.length} large open={!closed.includes('quiet')} ontoggle={() => toggle('quiet')} />
            {#if !closed.includes('quiet')}
              <ul class="mt-2 flex flex-col gap-2">
                {#each sections.quiet as i (i.watcherId)}
                  <li>
                    <ListRow title={i.name} label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                      {#snippet tile()}<Tile color={PHASE_TILE.quiet!}><Icon name="eye" size={20} /></Tile>{/snippet}
                      {#snippet meta()}
                        {#if i.entityMissing}<span class="text-danger">{t('Entität fehlt')}</span>{:else}{t('Alles im grünen Bereich')}{/if}
                      {/snippet}
                      {#snippet right()}<Icon name="chevron-right" size={18} />{/snippet}
                    </ListRow>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}

        {#if activity.length > 0}
          <section aria-label={t('Letzte Aktivität')} data-testid="home-activity">
            <SectionHeader title={t('Letzte Aktivität')} large />
            <ul class="mt-2 flex flex-col gap-2">
              {#each activity as r (r.id)}
                <li>
                  <ListRow title="{r.watcherName} · {RUN_TEXT[r.result] ?? r.result}">
                    {#snippet meta()}<span class="truncate">{formatDue(r.at, nowMs)}{r.assignedTo.length ? ` · ${names(r.assignedTo)}` : ''}{r.note ? ` · ${noteText(r.note)}` : ''}</span>{/snippet}
                  </ListRow>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/if}

    {#if ui.isAdmin}
      <!-- Verwalten, Gefunden und Vorlagen bleiben in den Einstellungen erreichbar -->
      <div class="mt-3.5">
        <ListRow title={t('Alle Wächter verwalten')} onclick={() => openSettings('watchers')}>
          {#snippet tile()}<Tile color="gray"><Icon name="settings" size={20} /></Tile>{/snippet}
          {#snippet right()}<Icon name="chevron-right" size={18} />{/snippet}
        </ListRow>
      </div>
    {/if}
  </div>

  {#if ui.isAdmin && data?.available}
    <button
      class="bg-accent-grad fixed right-5 bottom-[calc(max(10px,var(--safe-bottom))+80px)] z-30 flex h-[58px] w-[58px] items-center justify-center rounded-btn"
      aria-label={t('Neuer Wächter')}
      onclick={() => openSheet({ type: 'watcher', id: null })}
    >
      <Icon name="plus" size={26} stroke={2.8} />
    </button>
  {/if}
</main>
