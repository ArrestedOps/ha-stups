<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type HomeState } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { durationText, homeSections, quietLine } from '../lib/home';
  import { t } from '../lib/i18n/index.svelte';
  import { canNudge } from '../lib/nudge';
  import { ageText } from '../lib/today';
  import { openCardAnywhere, openSettings, openSheet, personById, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';

  let data = $state<HomeState | null>(null);
  let failed = $state(false);
  let request = 0;

  async function load() {
    const mine = ++request;
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
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  });

  const nowMs = $derived((void data, Date.now()));
  const items = $derived(data?.items ?? []);
  const sections = $derived(homeSections(items));
  const names = (ids: string[]) => ids.map((id) => personById(id)?.displayName ?? '?').join(', ');
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col px-4 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0">
    <TopBar />
    <h1 class="font-display text-[34px] leading-tight font-bold tracking-tight">{t('Zuhause')}</h1>
    <p class="mb-3 text-[15px] text-fg2">{t('Was das Haus gerade tut')}</p>
  </header>

  <div class="-mr-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-tabbar" data-testid="home">
    {#if failed && !data}
      <p class="py-10 text-center text-fg2">{t('Die Seite „Zuhause“ konnte nicht geladen werden.')}</p>
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
                <p class="text-[13px] font-semibold text-house">{i.name} · {ageText(card.createdAt, nowMs)}</p>
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
              <li class="px-4 py-3">
                <p class="text-[16px] font-semibold">{i.name}</p>
                <p class="text-[13px] text-fg2">{i.since ? durationText(i.since, nowMs) : ''} · {t('danach: {title}', { title: i.nextCard })}</p>
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
              <li class="px-4 py-3">
                <p class="text-[16px] font-semibold">{i.name}</p>
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
                {#if i.nextEvent}<p class="text-[13px] text-fg2">{i.nextEvent.title} · {formatDue(i.nextEvent.at, nowMs)}</p>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if sections.quiet.length > 0}
        <p class="mb-6 px-1 text-[15px] text-fg2" data-testid="home-quiet">
          <span class="font-semibold text-fg">{t('Ruhig')}:</span>
          {quietLine(sections.quiet)}
        </p>
      {/if}
    {/if}
  </div>
</main>
