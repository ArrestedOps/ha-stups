<script lang="ts">
  import { api } from '../lib/api';
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { ScheduleCard } from '../lib/schedule';
  import { completeCard, openCardAnywhere, personById, refresh, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  /**
   * Der Stups an mich, oben in Aufgaben: orange Aufgabe mit winkender Hand, Absender, Aufgabe und den drei Antworten wie in der
   * Push-Nachricht (Erledigt, Mach ich, Später). Mehrere Stupse: „+N“ klappt die weiteren auf.
   */
  let { nudges, onopen, bar = false }: { nudges: { card: ScheduleCard; fromIds: string[] }[]; onopen?: (card: ScheduleCard) => void; /** Desktop: eine waagrechte Leiste statt der Karte */ bar?: boolean } = $props();

  let all = $state(false);
  let busy = $state<string | null>(null);
  const shown = $derived(all ? nudges : nudges.slice(0, 1));
  const nameList = (ids: string[]) => ids.map((id) => personById(id)?.displayName ?? t('Jemand')).join(', ');

  /** Der Stups dieser Aufgabe an mich (die Antwort geht auf seine Kennung) */
  const mine = (c: ScheduleCard) => c.openNudges.find((n) => n.toId === ui.me?.id);

  async function reply(c: ScheduleCard, kind: 'done' | 'ack' | 'later') {
    busy = c.id;
    try {
      if (kind === 'done') {
        await completeCard(c);
        return;
      }
      const n = mine(c);
      if (!n) return;
      await api.nudgeReply(n.id, kind);
      toast(kind === 'ack' ? t('{name} weiß Bescheid: Du übernimmst', { name: nameList([n.fromId]) }) : t('Ich stupse dich später noch einmal'));
      await refresh();
    } catch {
      toast(t('Das ging nicht. Bitte noch einmal versuchen.'), { tone: 'error' });
    } finally {
      busy = null;
    }
  }
</script>

{#each shown as n, i (n.card.id)}
  {#if bar}
    <section class="stups-card relative flex items-center gap-3 overflow-hidden rounded-[14px] px-3.5 py-2.5 text-on-banner" aria-label={t('{names} stupst dich! 👋', { names: nameList(n.fromIds) })} data-testid="stups-card">
      <span class="stups-hand flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"><Icon name="hand" size={20} stroke={2} /></span>
      <div class="relative min-w-0 flex-1">
        <p class="truncate text-[15px] leading-tight font-bold">{t('{names} stupst dich! 👋', { names: nameList(n.fromIds) })}</p>
        <button class="block max-w-full truncate text-left text-[13px] underline underline-offset-2" onclick={() => (onopen ? onopen(n.card) : void openCardAnywhere(n.card))}>{n.card.title}</button>
      </div>
      {#if i === 0 && nudges.length > 1}
        <button class="stups-more relative h-7 shrink-0 rounded-full px-3 text-[13px] font-bold" aria-expanded={all} aria-label={tn('{n} weiterer Stups', '{n} weitere Stupse', nudges.length - 1)} onclick={() => (all = !all)}>{all ? t('weniger') : `+${nudges.length - 1}`}</button>
      {/if}
      <div class="relative flex shrink-0 gap-2">
        <button class="stups-btn stups-ok !h-9 !flex-none px-4 !text-[14px]" disabled={busy === n.card.id} onclick={() => void reply(n.card, 'done')}>{t('Erledigt')}</button>
        <button class="stups-btn !h-9 !flex-none px-4 !text-[14px]" disabled={busy === n.card.id} onclick={() => void reply(n.card, 'ack')}>{t('Mach ich')}</button>
        <button class="stups-btn !h-9 !flex-none px-4 !text-[14px]" disabled={busy === n.card.id} onclick={() => void reply(n.card, 'later')}>{t('Später')}</button>
      </div>
    </section>
  {:else}
  <section class="stups-card relative overflow-hidden rounded-[20px] p-3 text-on-banner" aria-label={t('{names} stupst dich! 👋', { names: nameList(n.fromIds) })} data-testid="stups-card">
    <div class="relative flex items-center gap-2.5">
      <span class="stups-hand flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"><Icon name="hand" size={22} stroke={2} /></span>
      <div class="min-w-0 flex-1">
        <p class="text-[17px] leading-tight font-bold tracking-tight">{t('{names} stupst dich! 👋', { names: nameList(n.fromIds) })}</p>
      </div>
      {#if i === 0 && nudges.length > 1}
        <button class="stups-more h-7 shrink-0 rounded-full px-3 text-[13px] font-bold" aria-expanded={all} aria-label={tn('{n} weiterer Stups', '{n} weitere Stupse', nudges.length - 1)} onclick={() => (all = !all)}>
          {all ? t('weniger') : `+${nudges.length - 1}`}
        </button>
      {/if}
    </div>
    <button class="stups-bubble relative mt-2.5 flex w-full items-start gap-2.5 rounded-[14px] px-3 py-2.5 text-left" onclick={() => (onopen ? onopen(n.card) : void openCardAnywhere(n.card))}>
      {#if personById(n.fromIds[0] ?? '')}<Avatar person={personById(n.fromIds[0]!)!} size={28} />{/if}
      <span class="min-w-0 flex-1 text-[16px] leading-snug font-semibold">{n.card.title}</span>
    </button>
    <div class="relative mt-2.5 flex gap-2">
      <button class="stups-btn stups-ok" disabled={busy === n.card.id} onclick={() => void reply(n.card, 'done')}>{t('Erledigt')}</button>
      <button class="stups-btn" disabled={busy === n.card.id} onclick={() => void reply(n.card, 'ack')}>{t('Mach ich')}</button>
      <button class="stups-btn" disabled={busy === n.card.id} onclick={() => void reply(n.card, 'later')}>{t('Später')}</button>
    </div>
  </section>
  {/if}
{/each}
