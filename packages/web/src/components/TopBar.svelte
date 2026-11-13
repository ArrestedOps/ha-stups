<script lang="ts">
  import logo from '../assets/stups-icon.png';
  import { unread } from '../lib/inbox.svelte';
  import { bellText } from '../lib/inbox';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { feat, goToDashboard, openSheet, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import SymbolIcon from './SymbolIcon.svelte';

  /**
   * Kopf aller drei Reiter wie im Mockup: Zeile mit Logo und Wortmarke, rechts Home (nur in Home Assistant: zurück zum Dashboard der Person),
   * Glocke (mit kleiner Zahl, wenn es Ungelesenes gibt), Zahnrad (Einstellungen) und Profilbild (ebenfalls Einstellungen, dort steht oben das Profil),
   * darunter Titel und Untertitel des Reiters. Welches Dashboard der Home-Knopf öffnet, wählt jede Person unter Einstellungen › Home Assistant.
   */
  let { title, sub, subTestid }: { title: string; sub: string; subTestid?: string } = $props();

  const unseen = $derived(unread());
</script>

<!-- Auf dem Desktop (ab 1024 px) steht der Kopf in DesktopHeader.svelte, über allen Reitern; hier bleibt nichts -->
{#if !ui.desktop}
<div>
  <div class="flex h-11 items-center gap-2 px-0.5">
    <img src={logo} alt="" class="block h-[34px] w-[34px] rounded-[9px]" width="34" height="34" />
    <span class="sr-only">stups.</span>
    {#if feat.beta}<span class="ml-1 rounded-md bg-brand-dot/20 px-1.5 py-0.5 text-[11px] leading-none font-extrabold tracking-wider text-brand-dot uppercase" data-testid="beta-badge">{t('Beta')}</span>{/if}
    <span class="flex-1"></span>
    {#if !ui.online}
      <span class="mr-1 flex items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-[13px] text-fg2" role="status">
        <Icon name="wifi-off" size={14} />Offline
      </span>
    {/if}
    {#if feat.haUi}
      <button class="top-circle top-circle-ha" aria-label={t('Zurück zu Home Assistant')} data-testid="home-button" onclick={goToDashboard}>
        <SymbolIcon id="home-assistant" size={22} />
      </button>
    {/if}
    <button
      class="top-circle relative"
      aria-label={unseen > 0 ? tn('Mitteilungen, {n} ungelesen', 'Mitteilungen, {n} ungelesen', unseen) : t('Mitteilungen')}
      data-testid="bell"
      onclick={() => openSheet({ type: 'notifications' })}
    >
      <Icon name="bell" size={20} />
      {#if unseen > 0}<span class="bell-count absolute -top-1 -right-1" data-testid="bell-dot" aria-hidden="true">{bellText(unseen)}</span>{/if}
    </button>
    <button class="top-circle" aria-label={t('Einstellungen öffnen')} onclick={() => openSheet({ type: 'settings' })}>
      <Icon name="gear" size={20} />
    </button>
  </div>
  <h1 class="mt-1.5 px-0.5 text-[34px] leading-[1.12] font-bold tracking-[0.012em]">{title}</h1>
  <p class="sr-only" data-testid={subTestid}>{sub}</p>
</div>
{/if}
