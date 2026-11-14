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
  let {
    title,
    sub,
    subTestid,
    back,
    titleButton,
    titleTestid,
  }: {
    title: string;
    sub: string;
    subTestid?: string;
    /** statt des Logos ein „‹ Name“ links (Seite unter einem Reiter, zum Beispiel ein Board) */
    back?: { label: string; onclick: () => void };
    /** die Überschrift ist ein Knopf (zum Beispiel „Board wechseln“) mit Pfeil */
    titleButton?: { label: string; onclick: () => void };
    titleTestid?: string;
  } = $props();

  const unseen = $derived(unread());
</script>

<!-- Auf dem Desktop (ab 1024 px) steht der Kopf in DesktopHeader.svelte, über allen Reitern; hier bleibt nichts -->
{#if !ui.desktop}
<div>
  <div class="flex h-11 items-center gap-2 px-0.5">
    {#if back}
      <button class="-ml-1 inline-flex h-11 items-center gap-0.5 text-[17px] font-semibold text-accent-text" onclick={back.onclick}>
        <Icon name="chevron-left" size={22} stroke={2.4} />{back.label}
      </button>
    {:else}
      <img src={logo} alt="" class="block h-[34px] w-[34px] rounded-[9px]" width="34" height="34" />
      <span class="sr-only">stups.</span>
    {/if}
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
  {#if titleButton}
    <button class="mt-1.5 flex w-full min-w-0 items-center gap-2 px-0.5 text-left" aria-label={titleButton.label} onclick={titleButton.onclick}>
      <h1 class="min-w-0 truncate text-[34px] leading-[1.12] font-bold tracking-[0.012em]" data-testid={titleTestid}>{title}</h1>
      <span class="shrink-0 text-text-soft"><Icon name="chevron-down" size={22} stroke={2.2} /></span>
    </button>
  {:else}
    <h1 class="mt-1.5 px-0.5 text-[34px] leading-[1.12] font-bold tracking-[0.012em]" data-testid={titleTestid}>{title}</h1>
  {/if}
  <p class="sr-only" data-testid={subTestid}>{sub}</p>
</div>
{/if}
