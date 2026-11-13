<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { feat, goToDashboard, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import CtaButton from './ui/CtaButton.svelte';
</script>

<main class="mx-auto flex h-full max-w-[420px] flex-col gap-4 px-5 pt-[calc(var(--safe-top)+56px)] pb-[calc(var(--pad-bottom)+10px)]" data-testid="no-access">
  <div class="flex flex-1 flex-col items-center justify-center gap-3.5 text-center">
    <div class="flex h-[84px] w-[84px] items-center justify-center rounded-[22px] bg-accent text-on-accent">
      <Icon name="lock" size={40} stroke={1.8} />
    </div>
    <h1 class="text-[26px] font-extrabold tracking-tight">{t('Noch kein Zugriff')}</h1>
    <p class="max-w-[300px] text-[15px] leading-[1.5] text-fg2">
      {#if ui.me}{t('Hallo {name}! Ein Administrator muss dich erst freigeben. Wir haben Bescheid gegeben.', { name: ui.me.displayName })}{:else}{t('Du bist noch nicht für Stups freigegeben.')}{/if}
    </p>
    <span class="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--c-orange-bg)] px-[9px] text-[12px] font-bold text-(--c-orange-fg)"><Icon name="clock" size={12} stroke={2.4} />{t('Wartet auf Freigabe')}</span>
  </div>
  <CtaButton onclick={() => location.reload()}>{t('Erneut prüfen')}</CtaButton>
  {#if feat.haUi}
    <button class="flex h-14 w-full items-center justify-center rounded-btn bg-surface text-[17px] font-semibold text-accent-text" onclick={goToDashboard}>{t('Zurück zum Dashboard')}</button>
  {/if}
</main>
