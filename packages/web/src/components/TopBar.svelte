<script lang="ts">
  import logo from '../assets/stups-icon.png';
  import { unread } from '../lib/inbox.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { feat, goToDashboard, openSheet, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import SymbolIcon from './SymbolIcon.svelte';

  /**
   * Kopf aller drei Reiter wie im Mockup: Zeile mit Logo und Wortmarke, rechts Home (nur in Home Assistant: zurück zum Dashboard der Person),
   * Glocke (mit Punkt, wenn es Ungelesenes gibt), Zahnrad (Einstellungen) und Profilbild (ebenfalls Einstellungen, dort steht oben das Profil),
   * darunter Titel und Untertitel des Reiters. Welches Dashboard der Home-Knopf öffnet, wählt jede Person unter Einstellungen › Home Assistant.
   */
  let { title, sub, subTestid }: { title: string; sub: string; subTestid?: string } = $props();

  const fresh = $derived(unread() > 0);
</script>

<div>
  <div class="flex h-11 items-center gap-0.5 px-0.5">
    <img src={logo} alt="" class="block h-8 w-8 rounded-lg" width="32" height="32" />
    <span class="ml-2 text-[24px] font-extrabold tracking-tight" aria-hidden="true">stups<span class="text-brand-dot">.</span></span>
    <span class="flex-1"></span>
    {#if !ui.online}
      <span class="mr-1 flex items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-[13px] text-fg2" role="status">
        <Icon name="wifi-off" size={14} />Offline
      </span>
    {/if}
    {#if feat.haUi}
      <button class="flex h-11 w-11 items-center justify-center rounded-full text-text-soft" aria-label={t('Zurück zu Home Assistant')} data-testid="home-button" onclick={goToDashboard}>
        <SymbolIcon id="home-assistant" size={26} />
      </button>
    {/if}
    <button
      class="relative flex h-11 w-11 items-center justify-center rounded-full text-text-soft"
      aria-label={fresh ? t('Mitteilungen, es gibt Ungelesenes') : t('Mitteilungen')}
      data-testid="bell"
      onclick={() => openSheet({ type: 'notifications' })}
    >
      <Icon name="bell" size={24} />
      {#if fresh}<span class="absolute top-[9px] right-[11px] h-[9px] w-[9px] rounded-full bg-brand-dot" data-testid="bell-dot"></span>{/if}
    </button>
    <button class="flex h-11 w-11 items-center justify-center rounded-full text-text-soft" aria-label={t('Einstellungen öffnen')} onclick={() => openSheet({ type: 'settings' })}>
      <Icon name="gear" size={24} />
    </button>
    {#if ui.me}
      <button class="ml-px -mr-[3px] flex h-11 w-11 items-center justify-center" aria-label={t('Profil öffnen')} onclick={() => openSheet({ type: 'settings' })}>
        <Avatar person={ui.me} size={38} ring={2} />
      </button>
    {/if}
  </div>
  <h1 class="mt-2.5 px-0.5 text-[30px] leading-[1.1] font-extrabold tracking-tight">{title}</h1>
  <p class="mt-1 px-0.5 text-[14px] text-fg2" data-testid={subTestid}>{sub}</p>
</div>
