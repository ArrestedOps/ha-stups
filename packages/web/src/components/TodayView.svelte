<script lang="ts">
  import { api, type Today, type TodayCard } from '../lib/api';
  import { startOfTomorrow } from '../lib/datetime';
  import { numberLocale, t, tn } from '../lib/i18n/index.svelte';
  import { clock } from '../lib/nudge';
  import { ageText, dueTone, sourceLine, todaySentence } from '../lib/today';
  import { completeCard, openCardAnywhere, openSheet, personById, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import TopBar from './TopBar.svelte';

  let data = $state<Today | null>(null);
  let failed = $state(false);
  let request = 0;

  // Neu laden, wenn sich etwas geändert hat (ui.rev zählt hoch, auch durch Live-Sync)
  $effect(() => {
    void ui.rev;
    const mine = ++request;
    api
      .today()
      .then((d) => {
        if (mine !== request) return;
        data = d;
        failed = false;
      })
      .catch(() => {
        if (mine === request) failed = true;
      });
  });

  const nowMs = $derived((void ui.rev, Date.now()));
  const tomorrow = $derived(startOfTomorrow(nowMs));
  const dateLabel = $derived(new Date(nowMs).toLocaleDateString(numberLocale(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const others = $derived(
    (data?.others ?? []).map((o) => ({ ...o, person: personById(o.personId) })).filter((o): o is typeof o & { person: NonNullable<typeof o.person> } => o.person !== undefined),
  );
  const othersOpen = $derived(others.reduce((sum, o) => sum + o.open, 0));

  const done = (c: TodayCard) => void completeCard(c);
  const open = (c: TodayCard) => void openCardAnywhere(c);
  const toneClass = { overdue: 'font-semibold text-danger', today: 'text-accent-text', later: 'text-fg2' } as const;
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col px-4 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0">
    <TopBar />
    <p class="text-[13px] font-semibold tracking-wide text-fg2 uppercase">{dateLabel}</p>
    <h1 class="font-display text-[34px] leading-tight font-bold tracking-tight">{t('Heute')}</h1>
    <p class="mb-3 text-[15px] text-fg2" data-testid="today-sentence">{data ? todaySentence(data) : ' '}</p>
  </header>

  <div class="-mr-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-fab" data-testid="today">
    {#if failed && !data}
      <p class="py-10 text-center text-fg2">{t('Die Seite „Heute“ konnte nicht geladen werden.')}</p>
    {:else if !data}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else}
      {#if data.house.length > 0}
        <section class="mb-6" aria-label={t('Vom Haus')} data-testid="today-house">
          <h2 class="font-display mb-2 text-[17px] font-bold text-house">{t('Vom Haus')}</h2>
          <ul class="space-y-2.5">
            {#each data.house as c (c.id)}
              <li class="rounded-[20px] border border-house-line bg-house-bg p-4">
                <p class="text-[13px] font-semibold text-house">{c.watcherName ?? t('Wächter')} · {ageText(c.createdAt, nowMs)}</p>
                <button class="mt-1 block w-full text-left text-[17px] leading-snug font-semibold" onclick={() => open(c)}>{c.title}</button>
                {#if c.why}<p class="mt-1 text-[13px] text-fg2">{c.why}</p>{/if}
                <div class="mt-3 flex gap-2">
                  <button class="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-house font-semibold text-bg" onclick={() => done(c)}>
                    <Icon name="check" size={18} stroke={2.8} />{t('Erledigt')}
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if data.mine.length > 0}
        <section class="mb-6" aria-label={t('Für dich')} data-testid="today-mine">
          <h2 class="font-display mb-2 text-[17px] font-bold">{t('Für dich')}</h2>
          <ul class="card-shadow divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
            {#each data.mine as c (c.id)}
              {@const src = sourceLine(c)}
              {@const tone = dueTone(c.dueAt, nowMs, tomorrow)}
              <li class="flex items-stretch">
                <button class="flex w-12 shrink-0 items-start justify-center pt-[15px] pl-1" aria-label={t('„{title}“ erledigen', { title: c.title })} onclick={() => done(c)}>
                  <span class="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 {tone === 'overdue' ? 'border-danger' : 'border-fg2'}"></span>
                </button>
                <button class="min-w-0 flex-1 py-3 pr-3 text-left" onclick={() => open(c)}>
                  <span class="block text-[16px] leading-snug font-semibold">{c.title}</span>
                  <span class="mt-1 flex items-center gap-2 text-[13px]">
                    {#if c.dueAt}<span class="flex items-center gap-1 {toneClass[tone]}"><Icon name="clock" size={13} />{clock(c.dueAt)}</span>{/if}
                    <span class="truncate {src.house ? 'text-house' : 'text-fg2'}">{src.text}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if data.house.length === 0 && data.mine.length === 0}
        <p class="py-10 text-center text-[17px] text-fg2" data-testid="today-empty">{t('Heute ist nichts offen. Genieß den Tag.')}</p>
      {/if}

      {#if !ui.isChild && others.length > 0}
        <section class="mb-6" aria-label={t('Bei den anderen')}>
          <h2 class="font-display mb-2 text-[17px] font-bold">{t('Bei den anderen')}</h2>
          <button
            class="card-shadow flex min-h-[56px] w-full items-center gap-3 rounded-[20px] border border-line bg-surface px-4 text-left"
            onclick={() => openSheet({ type: 'week' })}
          >
            <span class="flex -space-x-1.5">
              {#each others.slice(0, 4) as o (o.personId)}<Avatar person={o.person} size={28} />{/each}
            </span>
            <span class="flex-1 text-[15px]">{tn('{n} Karte offen', '{n} Karten offen', othersOpen)}</span>
            <Icon name="chevron-right" size={18} />
          </button>
        </section>
      {/if}
    {/if}
  </div>
</main>
