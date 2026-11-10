<script lang="ts">
  import type { Component } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';

  /**
   * Lädt ein selten gebrauchtes Fenster erst, wenn es gebraucht wird (eigenes Paket statt im Hauptpaket).
   * `load` ist `() => import('./X.svelte')`, `props` sind die Eigenschaften des Fensters. Beim ersten Mal kurz leer, danach liegt es im Zwischenspeicher.
   */
  let { load, props = {} }: { load: () => Promise<{ default: Component<any> }>; props?: Record<string, unknown> } = $props();
  // einmal beim Einhängen: Wechselt das Fenster, hängt der Aufrufer ein neues Lazy ein ({#if}/{#key})
  // svelte-ignore state_referenced_locally
  const loading = load();
</script>

{#await loading then m}
  <m.default {...props} />
{:catch}
  <div class="fixed inset-x-0 bottom-0 z-50 p-4 text-center text-fg2" role="alert">{t('Konnte nicht geladen werden. Bitte neu laden.')}</div>
{/await}
