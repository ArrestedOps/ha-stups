<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { finish, ob } from '../lib/onboarding.svelte';
  import AccentPicker from './AccentPicker.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /** Kurzfassung für Mitglieder, Schritt 2: die Akzentfarbe wählen (der bestehende Farbkreis), danach ist die Einrichtung fertig */
</script>

<OnboardingFrame title={t('Farbe wählen')} lead={t('Stups zeigt sich in deiner Farbe. Du kannst sie jederzeit in den Einstellungen ändern.')}>
  <div class="flex justify-center"><AccentPicker /></div>
  {#snippet footer()}
    <CtaButton disabled={ob.busy} onclick={finish}>{t('Zu den Aufgaben')}</CtaButton>
  {/snippet}
</OnboardingFrame>
