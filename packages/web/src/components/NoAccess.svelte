<script lang="ts">
  import logo from '../assets/stups-icon.png';
  import { t } from '../lib/i18n/index.svelte';
  import { feat, goToDashboard, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import CtaButton from './ui/CtaButton.svelte';
</script>

<main class="mx-auto flex h-full max-w-[420px] flex-col gap-4 px-5 pt-[calc(var(--safe-top)+56px)] pb-[calc(var(--pad-bottom)+10px)]" data-testid="no-access">
  <div class="flex h-11 items-center px-0.5">
    <img src={logo} alt="Stups" class="block h-8 w-8 rounded-lg" width="32" height="32" />
    <span class="ml-2 text-[24px] font-extrabold tracking-tight">stups<span class="text-brand-dot">.</span></span>
  </div>
  <div class="flex flex-1 flex-col items-center justify-center gap-3.5 text-center">
    <div class="flex h-24 w-24 items-center justify-center rounded-[28px] border text-step-done shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_25%,transparent)]" style="background-image: var(--banner-warm); border-color: var(--banner-warm-line)">
      <Icon name="lock" size={44} stroke={1.6} />
    </div>
    <h1 class="text-[26px] font-extrabold tracking-tight">{t('Noch kein Zugriff')}</h1>
    <p class="max-w-[300px] text-[15px] leading-[1.5] text-fg2">
      {#if ui.me}{t('Hallo {name}! Ein Administrator muss dich erst freigeben. Wir haben Bescheid gegeben.', { name: ui.me.displayName })}{:else}{t('Du bist noch nicht für Stups freigegeben.')}{/if}
    </p>
    <span class="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--c-orange-bg)] px-[9px] text-[12px] font-bold text-(--c-orange-fg)"><Icon name="clock" size={12} stroke={2.4} />{t('Wartet auf Freigabe')}</span>
  </div>
  <CtaButton ghost onclick={() => location.reload()}><Icon name="repeat" size={20} stroke={1.8} />{t('Erneut prüfen')}</CtaButton>
  {#if feat.haUi}
    <button class="flex h-14 w-full items-center justify-center rounded-btn border border-line bg-surface text-[17px] font-extrabold text-accent-text" onclick={goToDashboard}>{t('Zurück zum Dashboard')}</button>
  {/if}
</main>
