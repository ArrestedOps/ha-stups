<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { COMPANION_APP_LINKS } from '../lib/onboarding';

  /**
   * „Companion App installieren": der Link zur Home-Assistant-App für Personen ohne Handy (App Store, Google Play). Er öffnet außerhalb von
   * Stups (neuer Tab bzw. Browser des Handys, siehe 1.27.1); Personen, die noch nicht in Home Assistant stehen, werden nicht eingeladen.
   */
  let { name }: { name?: string } = $props();
  const label = (store: string) => (name ? t('{store}: Companion App für {name}', { store, name }) : t('{store}: Companion App installieren', { store }));
</script>

<p class="flex flex-wrap items-center gap-x-3 text-[13px]" data-testid="companion-links">
  <span class="text-fg2">{t('Companion App installieren')}:</span>
  <a class="inline-flex min-h-8 items-center font-semibold text-accent-text underline underline-offset-2" href={COMPANION_APP_LINKS.ios} target="_blank" rel="noopener noreferrer" aria-label={label('App Store')}>{t('iPhone (App Store)')}</a>
  <a class="inline-flex min-h-8 items-center font-semibold text-accent-text underline underline-offset-2" href={COMPANION_APP_LINKS.android} target="_blank" rel="noopener noreferrer" aria-label={label('Google Play')}>{t('Android (Google Play)')}</a>
</p>
