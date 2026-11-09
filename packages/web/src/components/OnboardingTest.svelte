<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { connectOwnPhone, hasPhone, next, ob, sendTest } from '../lib/onboarding.svelte';
  import { openSettings, ui } from '../lib/store.svelte';
  import OnboardingCompanion from './OnboardingCompanion.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import OnboardingPreview from './OnboardingPreview.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /**
   * Schritt „Testnachricht": die Vorschau und ein Knopf. Überspringbar, auch mit erkanntem Handy („Ohne Test weiter"). Fehlt der Push-Weg,
   * steht eine Anweisung mit den Links zur Companion App; kommt die Nachricht nicht an, führt „Prüfen" in die bestehende Diagnose.
   * `member`: dieselbe Seite als Kurzfassung „Handy verbinden" für Mitglieder (ohne Vorschau-Spalte, Weiter geht zum nächsten Schritt oder zum Ende).
   */
  let { member = false, onnext }: { member?: boolean; onnext?: () => void } = $props();
  onMount(() => member && void connectOwnPhone());
  const phone = $derived(hasPhone(ui.me));
  const leave = () => (onnext ?? next)();
</script>

<OnboardingFrame
  title={member ? t('Handy verbinden') : t('Probier es gleich aus')}
  lead={phone ? t('Tippe auf Senden, dann kommt die Nachricht auf dein Handy.') : undefined}
>
  {#if !member && !ui.desktop}<OnboardingPreview />{/if}
  {#if member}
    <p class="mb-4 rounded-row border border-line bg-surface px-4 py-3 text-[15px]" data-testid="phone-state">
      {phone ? t('Dein Handy ist verbunden.') : t('Auf diesem Gerät ist noch kein Handy für Nachrichten eingetragen.')}
    </p>
  {/if}

  {#if ob.test === 'nopath' || !phone}
    <div class="mt-4 rounded-row border border-line bg-surface px-4 py-3.5" data-testid="test-nopath" role="status">
      <p class="text-[15px] font-bold">{t('Noch kein Handy verbunden')}</p>
      <p class="mt-1 text-[14px] leading-[1.45] text-fg2">{t('Öffne Home Assistant auf deinem Handy und melde dich in der Companion App an. Danach erscheint dein Handy hier von selbst.')}</p>
      <div class="mt-2"><OnboardingCompanion /></div>
    </div>
  {/if}

  {#if ob.test === 'sent'}
    <p class="mt-4 rounded-row border border-line bg-ok-bg px-4 py-3 text-[15px] font-semibold text-ok" role="status" data-testid="test-sent">
      {t('Gesendet. Schau auf dein Handy: Hast du die Nachricht bekommen?')}
    </p>
  {:else if ob.test === 'failed'}
    <div class="mt-4 rounded-row bg-danger-bg px-4 py-3" role="alert" data-testid="test-failed">
      <p class="text-[15px] font-semibold text-danger">{t('Die Nachricht ist nicht angekommen.')}</p>
      <p class="mt-1 text-[14px] text-fg2">{t('Prüfe, ob die Companion App auf dem Handy angemeldet ist und Mitteilungen erlaubt sind.')}</p>
      <button type="button" class="mt-1 min-h-11 text-[15px] font-semibold text-accent-text underline underline-offset-2" onclick={() => openSettings('report')}>{t('Prüfen')}</button>
    </div>
  {/if}

  {#snippet footer()}
    {#if ob.test === 'sent'}
      <CtaButton onclick={leave}>{t('Ja, weiter')}</CtaButton>
      <button type="button" class="min-h-11 text-[15px] font-semibold text-fg2" onclick={sendTest}>{t('Nochmal senden')}</button>
    {:else}
      <CtaButton disabled={ob.test === 'sending' || !phone} onclick={sendTest}>{ob.test === 'sending' ? t('Sendet …') : t('Testnachricht senden')}</CtaButton>
      <button type="button" class="min-h-11 text-[15px] font-semibold text-fg2" onclick={leave}>{ob.test === 'failed' ? t('Weiter ohne Test') : t('Ohne Test weiter')}</button>
    {/if}
    <p class="px-2 text-center text-[12.5px] leading-[1.4] text-hint">{t('Auf dem iPhone die Nachricht gedrückt halten, dann erscheint Erledigt. Bei Android ziehst du sie nach unten auf.')}</p>
  {/snippet}
</OnboardingFrame>
