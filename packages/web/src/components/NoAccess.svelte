<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center" data-testid="no-access">
  <Icon name="lock" size={32} />
  <p class="text-[20px] font-semibold">{t('Kein Zugriff')}</p>
  <p class="max-w-[320px] text-fg2">
    {#if ui.me}{t('Du bist als {name} angemeldet, aber noch nicht für Stups freigegeben.', { name: ui.me.displayName })}{:else}{t('Du bist noch nicht für Stups freigegeben.')}{/if}
    {t('Bitte einen Administrator von Home Assistant, dich unter „Einstellungen › Personen & Zugriff" hinzuzufügen.')}
  </p>
  <button class="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent" onclick={() => location.reload()}>{t('Erneut prüfen')}</button>
</div>
