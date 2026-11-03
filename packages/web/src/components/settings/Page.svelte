<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n/index.svelte';
  import { closeSheet, openSettings } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import Sheet from '../Sheet.svelte';

  /** Rahmen jeder Unterseite der Einstellungen: Titel in der Mitte, zurück zur Übersicht oben links */
  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<Sheet {title} onclose={closeSheet}>
  {#snippet left()}
    <button class="flex min-h-11 items-center pr-3 pl-1 text-[17px] text-accent-text" onclick={() => openSettings()} aria-label={t('Zurück zu den Einstellungen')}>
      <Icon name="chevron-left" size={24} stroke={2.6} />{t('Einstellungen')}
    </button>
  {/snippet}
  {@render children()}
</Sheet>
