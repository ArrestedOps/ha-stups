<script lang="ts">
  import { numberLocale, t } from '../lib/i18n/index.svelte';
  import { api } from '../lib/api';
  import { clock } from '../lib/nudge';
  import { AGENDA_STEP_DAYS, agendaHorizonAfterLoad, boardColorKey, filterSchedule, groupByDay, type ScheduleCard } from '../lib/schedule';
  import { completeCard, openCardAnywhere, personById, ui } from '../lib/store.svelte';
  import { urgency, urgencyColor } from '../lib/urgency';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import ScheduleFilterBar from './ScheduleFilterBar.svelte';

  const DAY = 86_400_000;

  let loaded = $state<ScheduleCard[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let days = $state(AGENDA_STEP_DAYS);
  let request = 0;

  // Neu laden, wenn sich etwas geändert hat (ui.rev), Erledigte zu- oder abgeschaltet werden oder der Zeitraum wächst
  $effect(() => {
    void ui.rev;
    const showDone = ui.sf.showDone;
    const horizon = days;
    const mine = ++request;
    api
      .schedule({ to: new Date(Date.now() + horizon * DAY).toISOString(), done: showDone })
      .then((list) => {
        if (mine !== request) return;
        // Erledigtes nur der letzten Woche, sonst wird die Liste lang
        const weekAgo = Date.now() - 7 * DAY;
        loaded = list.filter((c) => !c.completedAt || Date.parse(c.completedAt) >= weekAgo);
        failed = false;
        // nichts im ersten Zeitraum: gleich weiter vorausschauen, statt eine leere Agenda zu zeigen
        const wider = agendaHorizonAfterLoad(loaded.length, horizon);
        if (wider !== null) days = wider;
      })
      .catch(() => {
        if (mine === request) failed = true;
      })
      .finally(() => {
        if (mine === request) loading = false;
      });
  });

  const shown = $derived(filterSchedule(loaded, ui.sf));
  const sections = $derived(groupByDay(shown));
  const boardIndex = (id: string) => ui.boards.findIndex((b) => b.id === id);
  /** bis wohin geladen ist, für den Hinweis bei leerer Liste */
  const horizonLabel = $derived(new Date(Date.now() + days * DAY).toLocaleDateString(numberLocale(), { day: 'numeric', month: 'long', year: 'numeric' }));
</script>

<!-- Die Liste im Kalender: alle Karten mit Termin nach Tagen (früher der Reiter Agenda) -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="mt-2 shrink-0"><ScheduleFilterBar cards={loaded} /></div>
  <div class="-mr-4 mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-tabbar" data-testid="agenda">
    {#if loading}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else if failed}
      <p class="py-10 text-center text-fg2">{t('Die Agenda konnte nicht geladen werden.')}</p>
    {:else if sections.length === 0}
      <div class="flex flex-col items-center gap-2 py-12 text-center text-fg2">
        <Icon name="calendar" size={32} />
        <p class="text-[17px] font-semibold text-fg">{t('Keine Termine')}</p>
        <p>{t('Bis {date} gibt es mit diesem Filter keine Karte mit Termin.', { date: horizonLabel })}</p>
        <!-- Auch hier: Karten, die weiter in der Zukunft liegen, sind nur einen Tipp entfernt -->
        <button class="mt-3 min-h-11 w-full max-w-[320px] rounded-xl border border-line text-[15px] text-fg" onclick={() => (days += AGENDA_STEP_DAYS)}>
          {t('Weitere {n} Tage laden', { n: AGENDA_STEP_DAYS })}
        </button>
      </div>
    {:else}
      {#each sections as s (s.key)}
        <section class="mb-5" aria-label={s.title}>
          <div class="flex items-baseline justify-between py-1.5">
            <h2 class="text-[17px] font-bold {s.overdue ? 'text-danger' : s.today ? 'text-accent-text' : ''}">{s.title}</h2>
            <span class="text-[13px] text-fg2">{s.sub}</span>
          </div>
          <ul class="card-shadow mt-1 divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
            {#each s.cards as c (c.id)}
              {@const done = !!c.completedAt}
              {@const bar = urgencyColor(urgency(c, done))}
              <li class="relative flex items-stretch {done ? 'opacity-70' : ''}">
                <span class="absolute inset-y-2.5 left-0 w-[4px] rounded-r-full" style:background={bar ?? `var(--c-${boardColorKey(c.boardColor, boardIndex(c.boardId))}-fg)`} aria-hidden="true"></span>
                <button
                  class="flex w-12 shrink-0 items-start justify-center pt-[15px] pl-1"
                  aria-label={done ? t('Bereits erledigt') : t('„{title}“ erledigen', { title: c.title })}
                  disabled={done}
                  onclick={() => completeCard(c)}
                >
                  <span class="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 {done ? 'border-accent bg-accent text-on-accent' : s.overdue ? 'border-danger' : 'border-fg2'}">
                    {#if done}<Icon name="check" size={14} stroke={3} />{/if}
                  </span>
                </button>
                <button class="min-w-0 flex-1 py-3 pr-3 text-left" onclick={() => openCardAnywhere(c)}>
                  <div class="flex items-start justify-between gap-2">
                    <span class="text-[16px] leading-snug font-semibold {done ? 'line-through' : ''}">{c.title}</span>
                    {#if c.assigneeIds.length}
                      <span class="flex shrink-0 gap-1">
                        {#each c.assigneeIds.map(personById).filter((p) => p !== undefined) as p (p.id)}<Avatar person={p} size={24} />{/each}
                      </span>
                    {/if}
                  </div>
                  <p class="mt-1 flex items-center gap-2 text-[13px] text-fg2">
                    <span class="flex items-center gap-1 {s.overdue && !done ? 'font-semibold text-danger' : ''}"><Icon name="clock" size={13} />{clock(c.dueAt!)}</span>
                    <i class="h-[8px] w-[8px] rounded-full" style:background="var(--c-{boardColorKey(c.boardColor, boardIndex(c.boardId))}-fg)"></i>
                    <span class="truncate">{c.boardName}</span>
                  </p>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
      <button class="mb-6 min-h-11 w-full rounded-xl border border-line text-[15px] text-fg2" onclick={() => (days += AGENDA_STEP_DAYS)}>
        {t('Weitere {n} Tage laden', { n: AGENDA_STEP_DAYS })}
      </button>
    {/if}
  </div>
</div>
