<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { finish, ob } from '../lib/onboarding.svelte';
  import { feat, openSettings, openSheet } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /**
   * Schritt „Fertig": nur, was wirklich passiert ist, steht mit Haken da; Übersprungenes steht als „Später einrichten" mit „Öffnen" in die
   * Einstellungen. Keine weiteren Aufgaben: „Zu den Aufgaben" beendet die Einrichtung.
   */
  const rows = $derived([
    ob.peopleDone
      ? { ok: true, title: tn('{n} Person eingerichtet', '{n} Personen eingerichtet', ob.peopleNames.length), meta: ob.peopleNames.join(', '), page: null }
      : feat.ha
        ? { ok: false, title: t('Personen'), meta: t('Später einrichten'), page: 'people' as const }
        : null,
    ob.watchersDone
      ? { ok: true, title: tn('{n} Wächter aktiv', '{n} Wächter aktiv', ob.watcherNames.length), meta: ob.watcherNames.join(', '), page: null }
      : feat.watchers && feat.ha
        ? { ok: false, title: t('Wächter'), meta: t('Später einrichten'), page: 'watchers' as const }
        : null,
    ob.testDone
      ? { ok: true, title: t('Testnachricht gesendet'), meta: '', page: null }
      : { ok: false, title: t('Testnachricht'), meta: t('Später einrichten'), page: 'notifications' as const },
  ]);
</script>

<OnboardingFrame title={t('Stups läuft.')} lead={t('Ab jetzt meldet sich dein Zuhause von selbst.')}>
  <ul class="flex max-w-[560px] flex-col gap-2.5" data-testid="done-list">
    {#each rows as r (r?.title)}
      {#if r}
        <li class="flex items-center gap-3 rounded-row border border-line bg-surface px-4 py-3">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full {r.ok ? 'bg-ok-bg text-ok' : 'border border-line text-hint'}" aria-hidden="true">
            {#if r.ok}<Icon name="check" size={16} stroke={3} />{/if}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[16px] font-bold">{r.title}</span>
            {#if r.meta}<span class="block truncate text-[13px] text-fg2">{r.meta}</span>{/if}
          </span>
          {#if !r.ok && r.page}
            <button type="button" class="min-h-11 shrink-0 rounded-xl bg-surface2 px-3.5 text-[13px] font-bold" aria-label={t('{name} in den Einstellungen öffnen', { name: r.title })} onclick={() => (r.page === 'people' ? openSheet({ type: 'people' }) : openSettings(r.page === 'watchers' ? 'watchers' : 'notifications'))}>{t('Öffnen')}</button>
          {/if}
        </li>
      {/if}
    {/each}
  </ul>
  <p class="mt-4 max-w-[560px] px-1 text-[12.5px] leading-[1.4] text-hint">{t('Was du übersprungen hast, steht hier mit „Später einrichten“. Du findest es auch jederzeit in den Einstellungen.')}</p>

  {#snippet footer()}
    <CtaButton disabled={ob.busy} onclick={finish}>{t('Zu den Aufgaben')}</CtaButton>
  {/snippet}
</OnboardingFrame>
