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
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';

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
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col px-4 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0">
    <TopBar />
    <h1 class="font-display text-[34px] leading-tight font-bold tracking-tight">{t('Wächter')}</h1>
    <p class="mb-3 text-[15px] text-fg2">{t('Was das Haus gerade tut')}{items.length > 0 ? ` · ${ui.isAdmin ? t('Tippe auf einen Wächter, um ihn zu bearbeiten.') : t('Tippe auf einen Wächter, um ihn anzusehen.')}` : ''}</p>
  </header>

  <div class="-mr-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-tabbar" data-testid="home">
    {#if ui.isAdmin && found > 0 && data?.available}
      <button class="mb-4 flex min-h-12 w-full items-center gap-3 rounded-2xl border border-house-line bg-house-bg px-4 text-left" data-testid="home-found" onclick={() => openSheet({ type: 'found' })}>
        <Icon name="eye" size={20} />
        <span class="flex-1 text-[15px] font-semibold text-house">{tn('Stups hat {n} weiteres Gerät gefunden', 'Stups hat {n} weitere Geräte gefunden', found)}</span>
        <Icon name="chevron-right" size={18} />
      </button>
    {/if}
    {#if failed && !data}
      <p class="py-10 text-center text-fg2">{t('Die Seite „Wächter“ konnte nicht geladen werden.')}</p>
    {:else if !data}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else if !data.available}
      <div class="mt-4 rounded-[20px] border border-line bg-surface p-5 text-center" data-testid="home-offline">
        <Icon name="wifi-off" size={28} />
        <p class="mt-2 text-[17px] font-semibold">
          {data.lostSince ? t('Keine Verbindung zu Home Assistant seit {time}', { time: formatDue(data.lostSince, nowMs) }) : t('Keine Verbindung zu Home Assistant')}
        </p>
        <p class="mt-1 text-[15px] text-fg2">{t('Boards und Karten funktionieren weiter. Sobald die Verbindung steht, erscheint hier wieder, was das Haus tut.')}</p>
      </div>
    {:else if items.length === 0}
      <div class="mt-4 rounded-[20px] border border-line bg-surface p-5" data-testid="home-empty">
        <p class="text-[17px] font-semibold">{t('Noch kein Wächter')}</p>
        <p class="mt-1 text-[15px] text-fg2">
          {t('Ein Wächter beobachtet zum Beispiel die Waschmaschine und legt von selbst die Karte „ausräumen" an, für jemanden, der gerade zu Hause ist.')}
        </p>
        {#if ui.isAdmin}
          <button class="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-house font-semibold text-bg" onclick={() => openSettings('watchers')}>
            <Icon name="eye" size={18} />{t('Wächter einrichten')}
          </button>
        {:else}
          <p class="mt-3 text-[15px]" data-testid="watchers-empty-member">{t('Ein Administrator von Home Assistant kann Wächter einrichten. Sobald es welche gibt, siehst du sie hier.')}</p>
        {/if}
      </div>
    {:else}
      {#if sections.waiting.length > 0}
        <section class="mb-6" aria-label={t('Wartet auf jemanden')} data-testid="home-waiting">
          <h2 class="font-display mb-2 text-[17px] font-bold text-house">{t('Wartet auf jemanden')}</h2>
          <ul class="space-y-2.5">
            {#each sections.waiting as i (i.watcherId)}
              {@const card = i.openCard!}
              <li class="rounded-[20px] border border-house-line bg-house-bg p-4">
                <button class="block w-full text-left text-[13px] font-semibold text-house" aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>{i.name} · {ageText(card.createdAt, nowMs)}</button>
                <button class="mt-1 block w-full text-left text-[17px] leading-snug font-semibold" onclick={() => openCardAnywhere(card)}>{card.title}</button>
                <p class="mt-1 text-[13px] text-fg2">{card.assigneeIds.length ? names(card.assigneeIds) : t('Noch niemand zuständig')}</p>
                {#if canNudge(card, ui.me?.id ?? null)}
                  <button class="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-house-line font-semibold text-house" onclick={() => openSheet({ type: 'nudge', id: card.id })}>
                    <Icon name="hand" size={18} />{t('Stupsen')}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if sections.running.length > 0}
        <section class="mb-6" aria-label={t('Läuft gerade')} data-testid="home-running">
          <h2 class="font-display mb-2 text-[17px] font-bold text-house">{t('Läuft gerade')}</h2>
          <ul class="card-shadow divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
            {#each sections.running as i (i.watcherId)}
              <li>
                <button class="flex w-full items-center gap-3 px-4 py-3 text-left" aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[16px] font-semibold">{i.name}</span>
                    <span class="block text-[13px] text-fg2">{i.since ? durationText(i.since, nowMs) : ''} · {t('danach: {title}', { title: i.nextCard })}</span>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if sections.soon.length > 0}
        <section class="mb-6" aria-label={t('Bald dran')} data-testid="home-soon">
          <h2 class="font-display mb-2 text-[17px] font-bold">{t('Bald dran')}</h2>
          <ul class="card-shadow divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
            {#each sections.soon as i (i.watcherId)}
              <li>
               <button class="flex w-full items-center gap-3 px-4 py-3 text-left" aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                <span class="min-w-0 flex-1">
                <span class="block text-[16px] font-semibold">{i.name}</span>
                {#if i.progress}
                  <div class="mt-1.5 flex items-center gap-2" aria-label={t('Zähler {n} von {total}', { n: i.progress.n, total: i.progress.of })}>
                    <div class="flex flex-1 gap-1">
                      {#each Array.from({ length: Math.min(i.progress.of, 12) }, (_, k) => k) as k (k)}
                        <i class="h-1.5 flex-1 rounded-full {k < i.progress.n ? 'bg-house' : 'bg-line'}"></i>
                      {/each}
                    </div>
                    <span class="text-[13px] text-fg2">{t('{n} von {total}', { n: i.progress.n, total: i.progress.of })}</span>
                  </div>
                {/if}
                {#if i.nextEvent}<span class="block text-[13px] text-fg2">{i.nextEvent.title} · {formatDue(i.nextEvent.at, nowMs)}</span>{/if}
                </span>
                <Icon name="chevron-right" size={18} />
               </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if sections.quiet.length > 0}
        <section class="mb-6" aria-label={t('Ruhig')} data-testid="home-quiet">
          <h2 class="font-display mb-2 text-[17px] font-bold">{t('Ruhig')}</h2>
          <ul class="card-shadow divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
            {#each sections.quiet as i (i.watcherId)}
              <li>
                <button class="flex min-h-12 w-full items-center gap-3 px-4 text-left" aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={() => openWatcher(i.watcherId)}>
                  <span class="min-w-0 flex-1 truncate text-[16px]">{i.name}</span>
                  {#if i.entityMissing}<span class="shrink-0 text-[13px] text-danger">{t('Entität fehlt')}</span>{/if}
                  <Icon name="chevron-right" size={18} />
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if activity.length > 0}
        <section class="mb-6" aria-label={t('Letzte Aktivität')} data-testid="home-activity">
          <h2 class="font-display mb-2 text-[17px] font-bold">{t('Letzte Aktivität')}</h2>
          <ul class="card-shadow divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
            {#each activity as r (r.id)}
              <li class="px-4 py-2.5">
                <p class="text-[15px] font-medium">{r.watcherName} · {RUN_TEXT[r.result] ?? r.result}</p>
                <p class="text-[13px] text-fg2">
                  {formatDue(r.at, nowMs)}{r.assignedTo.length ? ` · ${names(r.assignedTo)}` : ''}{r.note ? ` · ${noteText(r.note)}` : ''}
                </p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/if}
  </div>
</main>
