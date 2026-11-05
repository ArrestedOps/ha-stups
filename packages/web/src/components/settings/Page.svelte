<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n/index.svelte';
  import { closeSheet, openSettings } from '../../lib/store.svelte';
  import Sheet from '../Sheet.svelte';

  /** Rahmen jeder Unterseite der Einstellungen: Titel in der Mitte, „Zurück" zur Übersicht oben links (wie im Mockup) */
  let { title, children, footer }: { title: string; children: Snippet; footer?: Snippet } = $props();
</script>

<Sheet {title} onclose={closeSheet} {footer}>
  {#snippet left()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={() => openSettings()} aria-label={t('Zurück zu den Einstellungen')}>{t('Zurück')}</button>
  {/snippet}
  {@render children()}
</Sheet>
