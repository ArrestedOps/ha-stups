<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { feat, goToDashboard, openSheet, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
</script>

<!-- Kopfzeile aller Reiter: links zurück zum Dashboard (nur im Add-on) und die Wortmarke, rechts Offline-Hinweis und Avatar (öffnet die Einstellungen) -->
<div class="flex items-center justify-between">
  <div class="flex min-w-0 items-center gap-3">
    {#if feat.haUi}
      <button class="-ml-1.5 flex min-h-11 items-center text-[17px] text-accent-text" onclick={goToDashboard}>
        <Icon name="chevron-left" size={24} stroke={2.6} />Dashboard
      </button>
    {/if}
    <span class="min-h-11 content-center text-[24px] font-extrabold tracking-tight" aria-hidden="true">stups<span class="text-accent">.</span></span>
  </div>
  <div class="flex items-center gap-2">
    {#if !ui.online}
      <span class="flex items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-[13px] text-fg2" role="status">
        <Icon name="wifi-off" size={14} />Offline
      </span>
    {/if}
    <button class="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center" aria-label={t('Einstellungen öffnen')} onclick={() => openSheet({ type: 'settings' })}>
      {#if ui.me}<Avatar person={ui.me} size={36} />{:else}<Icon name="gear" size={22} />{/if}
    </button>
  </div>
</div>
