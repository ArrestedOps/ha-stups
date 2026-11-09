<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { next } from '../lib/onboarding.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /** Schritt 0: das Versprechen mit einem Beispiel. „Überspringen" steht oben rechts (Onboarding.svelte). */
  const anna = { displayName: 'Anna', color: 'var(--accent)' };
</script>

<OnboardingFrame title={t('Dein Zuhause merkt, was zu tun ist.')} lead={t('Ihr entscheidet, wer es macht.')}>
  <div class="rounded-row border border-line bg-surface px-4 py-4" data-testid="welcome-example">
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface2 text-accent-text"><Icon name="washer" size={24} /></span>
      <span class="min-w-0">
        <span class="block truncate text-[16px] font-bold">{t('Waschmaschine ausräumen')}</span>
        <span class="block text-[13px] text-fg2">{t('Waschmaschine fertig · vor 4 Min.')}</span>
      </span>
    </div>
    <p class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] text-fg2">
      {t('Wer zu Hause ist, ist reihum dran:')}
      <span class="inline-flex items-center gap-1.5 font-bold text-fg"><Avatar person={anna} size={22} />{anna.displayName}</span>
    </p>
    <p class="mt-2 text-[14.5px] leading-[1.45]">
      {t('Anna bekommt eine Nachricht mit dem Knopf')} <b>{t('Erledigt')}</b>{t(', direkt auf dem Sperrbildschirm.')}
    </p>
  </div>

  {#snippet footer()}
    <CtaButton onclick={next}>{t('Los geht\'s · dauert 3 Minuten')}</CtaButton>
    <p class="px-2 text-center text-[13px] text-hint">{t('Du kannst jeden Schritt überspringen und später in den Einstellungen nachholen.')}</p>
  {/snippet}
</OnboardingFrame>
