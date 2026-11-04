<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { fade } from 'svelte/transition';
  import { ui } from '../lib/store.svelte';

  const c = $derived(ui.confirm);
  const close = () => (ui.confirm = null);

  async function ok() {
    const run = c?.run;
    close();
    await run?.();
  }

  // Escape schließt nur die Rückfrage, nicht auch noch die Karte dahinter
  function key(e: KeyboardEvent) {
    if (c && e.key === 'Escape') {
      e.stopImmediatePropagation();
      close();
    }
  }
</script>

<svelte:window onkeydowncapture={key} />

{#if c}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-6" transition:fade={{ duration: 120 }}>
    <button class="absolute inset-0 bg-(--scrim)" aria-label={t('Abbrechen')} tabindex="-1" onclick={close}></button>
    <div role="alertdialog" aria-modal="true" aria-label={c.title} class="relative w-full max-w-[340px] rounded-3xl border border-line bg-surface p-5">
      <h2 class="text-[18px] font-bold">{c.title}</h2>
      <p class="mt-2 text-[15px] text-fg2">{c.text}</p>
      <div class="mt-5 flex gap-3">
        <button class="min-h-11 flex-1 rounded-xl border border-line font-semibold" onclick={close}>{t('Abbrechen')}</button>
        <button class="min-h-11 flex-1 rounded-xl bg-danger font-semibold text-on-danger" onclick={ok}>{c.label}</button>
      </div>
    </div>
  </div>
{/if}
