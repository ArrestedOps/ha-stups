<script lang="ts">
  import { api, type Fairness } from '../lib/api';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { personById, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

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
      p.created > 0 ? tn('{n} Karte angelegt', '{n} Karten angelegt', p.created) : '',
      p.nudgesAnswered > 0 ? tn('{n} Stups beantwortet', '{n} Stupse beantwortet', p.nudgesAnswered) : '',
      p.watcherCards > 0 ? tn('{n} Wächter-Karte', '{n} Wächter-Karten', p.watcherCards) : '',
    ].filter(Boolean);
</script>

<div data-testid="fairness">
  <div class="flex gap-2" role="group" aria-label={t('Zeitraum')}>
    {#each [['week', t('Diese Woche')], ['month', t('Dieser Monat')]] as [value, label] (value)}
      <button
        type="button"
        class="min-h-11 flex-1 rounded-xl border text-[15px] {period === value ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}"
        aria-pressed={period === value}
        onclick={() => (period = value as 'week' | 'month')}
      >
        {label}
      </button>
    {/each}
  </div>

  {#if failed && !data}
    <p class="py-10 text-center text-fg2">{t('Die Fairness-Ansicht konnte nicht geladen werden.')}</p>
  {:else if !data}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <p class="mt-4 text-[17px] font-semibold" data-testid="fairness-sentence">{sentence}</p>

    <ul class="card-shadow mt-3 divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
      {#each data.people as p (p.id)}
        {@const person = personById(p.id)}
        {@const lines = details(p)}
        <li class="px-4 py-3" data-testid="fairness-{p.id}">
          <div class="flex items-center gap-3">
            {#if person}<Avatar {person} size={28} />{/if}
            <span class="min-w-0 flex-1 truncate text-[16px] font-semibold">{p.name}</span>
            <span class="shrink-0 text-[15px]">{tn('{n} erledigt', '{n} erledigt', p.done)}</span>
          </div>
          <div class="mt-2 h-3 overflow-hidden rounded-full bg-surface2" role="img" aria-label={t('Aufwand von {name}', { name: p.name })}>
            <div class="h-full rounded-full bg-accent" style:width="{p.effort === 0 ? 0 : Math.max(4, (p.effort / maxEffort) * 100)}%"></div>
          </div>
          {#if lines.length}<p class="mt-1.5 text-[13px] text-fg2">{lines.join(' · ')}</p>{/if}
        </li>
      {/each}
    </ul>
    <p class="mt-3 flex items-start gap-2 px-1 text-[13px] text-fg2">
      <Icon name="checklist" size={14} />
      <span>{t('Der Balken zeigt den Aufwand: große Aufgaben zählen mehr als kleine. Es geht nicht um einen Wettbewerb.')}</span>
    </p>
  {/if}
</div>
