<script lang="ts">
  import { api, type Fairness } from '../lib/api';
  import { formatBusy } from '../lib/busy';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { answerConfirmation, openCardAnywhere, personById, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Segmented from './ui/Segmented.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';

  /**
   * Fairness: Wer erledigt wie viel? Bewusst keine Rangliste: Die Reihenfolge ist die der Personenliste, die Balken haben alle dieselbe
   * Farbe und zeigen den Aufwand (große Aufgaben zählen mehr als kleine), ohne Plätze, Medaillen oder „vorne" und „hinten".
   */
  let period = $state<'week' | 'month'>('week');
  let data = $state<Fairness | null>(null);
  let failed = $state(false);
  let request = 0;

  $effect(() => {
    void ui.rev; // neu laden, wenn sich etwas geändert hat
    const mine = ++request;
    api
      .fairness(period)
      .then((f) => {
        if (mine !== request) return;
        data = f;
        failed = false;
      })
      .catch(() => {
        if (mine === request) failed = true;
      });
  });

  async function confirmCard(cardId: string, title: string, answer: 'confirm' | 'reject') {
    await answerConfirmation({ id: cardId, title }, answer);
    // neu laden (ui.rev zählt hoch, aber die Antwort kommt zuerst)
    data = await api.fairness(period).catch(() => data);
  }

  const maxEffort = $derived(Math.max(1, ...(data?.people.map((p) => p.effort) ?? [0])));
  const sentence = $derived.by(() => {
    if (!data) return '';
    const n = data.total.done;
    if (n === 0) return period === 'week' ? t('Diese Woche ist noch nichts erledigt. Das kommt noch.') : t('Diesen Monat ist noch nichts erledigt. Das kommt noch.');
    return period === 'week'
      ? tn('Diese Woche habt ihr {n} Aufgabe erledigt.', 'Diese Woche habt ihr {n} Aufgaben erledigt.', n)
      : tn('Diesen Monat habt ihr {n} Aufgabe erledigt.', 'Diesen Monat habt ihr {n} Aufgaben erledigt.', n);
  });

  /** Die kleinen Zahlen unter dem Balken; was null ist, bleibt weg */
  const details = (p: Fairness['people'][number]) =>
    [
      p.created > 0 ? tn('{n} Aufgabe angelegt', '{n} Aufgaben angelegt', p.created) : '',
      p.nudgesAnswered > 0 ? tn('{n} Stups beantwortet', '{n} Stupse beantwortet', p.nudgesAnswered) : '',
      p.watcherCards > 0 ? tn('{n} Wächter-Aufgabe', '{n} Wächter-Aufgaben', p.watcherCards) : '',
    ].filter(Boolean);
</script>

<div data-testid="fairness">
  <Segmented
    items={[{ id: 'week', label: t('Diese Woche') }, { id: 'month', label: t('Dieser Monat') }]}
    value={period}
    label={t('Zeitraum')}
    small
    onchange={(v) => (period = v as 'week' | 'month')}
  />

  {#if failed && !data}
    <p class="py-10 text-center text-fg2">{t('Die Fairness-Ansicht konnte nicht geladen werden.')}</p>
  {:else if !data}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    {#if data.waitingForYou.length > 0}
      <section class="mt-3.5" aria-label={t('Wartet auf dich')} data-testid="week-waiting">
        <SectionHeader title={t('Wartet auf dich')} count={data.waitingForYou.length} />
        <ul class="mt-2 space-y-2">
          {#each data.waitingForYou as w (w.cardId)}
            {@const child = w.childId ? personById(w.childId) : undefined}
            <li class="rounded-row border border-line bg-surface p-3.5">
              <button class="block w-full text-left text-[16px] font-semibold" onclick={() => void openCardAnywhere({ id: w.cardId, boardId: w.boardId })}>{w.title}</button>
              <p class="mt-0.5 text-[13px] text-fg2">{child ? t('{name} sagt: erledigt', { name: child.displayName }) : t('Wartet auf Bestätigung')}</p>
              <div class="mt-3 flex gap-2">
                <button class="bg-accent-grad glow-pill h-11 flex-1 rounded-[12px] text-[14px] font-bold" onclick={() => void confirmCard(w.cardId, w.title, 'confirm')}>{t('Passt')}</button>
                <button class="h-11 flex-1 rounded-[12px] border border-line bg-surface2 text-[14px] font-bold" onclick={() => void confirmCard(w.cardId, w.title, 'reject')}>{t('Nochmal')}</button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <p class="mt-3.5 px-1 text-[17px] font-extrabold tracking-tight" data-testid="fairness-sentence">{sentence}</p>
    {#if data.houseCards > 0}
      <p class="mt-1 text-[15px] text-house" data-testid="week-house">
        {period === 'week'
          ? tn('{n} Aufgabe kam diese Woche vom Haus', '{n} Aufgaben kamen diese Woche vom Haus', data.houseCards)
          : tn('{n} Aufgabe kam diesen Monat vom Haus', '{n} Aufgaben kamen diesen Monat vom Haus', data.houseCards)}
      </p>
    {/if}

    <ul class="mt-3 flex flex-col gap-2">
      {#each data.people as p (p.id)}
        {@const person = personById(p.id)}
        {@const lines = details(p)}
        <li class="rounded-row border border-line bg-surface px-3.5 py-3" data-testid="fairness-{p.id}">
          <div class="flex items-center gap-3">
            {#if person}<Avatar {person} size={42} />{/if}
            <span class="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight">{p.name}</span>
            <span class="shrink-0 text-[15px]">{tn('{n} erledigt', '{n} erledigt', p.done)}</span>
          </div>
          <div class="mt-2 h-3 overflow-hidden rounded-full bg-surface2" role="img" aria-label={t('Aufwand von {name}', { name: p.name })}>
            <div class="bg-accent-grad h-full rounded-full !shadow-none" style:width="{p.effort === 0 ? 0 : Math.max(4, (p.effort / maxEffort) * 100)}%"></div>
          </div>
          {#if lines.length}<p class="mt-1.5 text-[13px] text-fg2">{lines.join(' · ')}</p>{/if}
          {#if p.busyUntil}<p class="mt-1 text-[13px] text-fg2" data-testid="busy-{p.id}">{t('Hat wenig Zeit bis {date}', { date: formatBusy(p.busyUntil) })}</p>{/if}
        </li>
      {/each}
    </ul>
    <p class="mt-3 flex items-start gap-2 px-1 text-[13px] text-fg2">
      <Icon name="checklist" size={14} />
      <span>{t('Der Balken zeigt den Aufwand: große Aufgaben zählen mehr als kleine. Es geht nicht um einen Wettbewerb.')}</span>
    </p>
    <p class="mt-2 flex items-start gap-2 px-1 text-[13px] text-fg2" data-testid="fairness-excluded">
      <Icon name="lock" size={14} />
      <span>{t('Private Boards und Boards, die nicht zur Fairness zählen, sind nicht eingerechnet, auch nicht rückwirkend. Dasselbe gilt für Wächter, die du ausgenommen hast.')}</span>
    </p>
  {/if}
</div>
