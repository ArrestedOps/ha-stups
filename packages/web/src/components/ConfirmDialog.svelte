<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { fade } from 'svelte/transition';
  import { ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Tile from './ui/Tile.svelte';

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
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={c.title}
      class="border-line-chip relative flex w-full max-w-[342px] flex-col items-center gap-2.5 rounded-3xl border bg-surface px-[18px] pt-[22px] pb-4 text-center shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
    >
      <Tile color="red" size="lg" radius={16}><Icon name="trash" size={28} stroke={1.8} /></Tile>
      <h2 class="mt-1 text-[19px] font-extrabold">{c.title}</h2>
      <p class="text-[14px] leading-[1.5] text-fg2">{c.text}</p>
      <div class="mt-2 grid w-full grid-cols-2 gap-2">
        <button class="border-line-chip h-[50px] rounded-[14px] border bg-surface2 text-[15px] font-bold" onclick={close}>{t('Abbrechen')}</button>
        <button class="h-[50px] rounded-[14px] bg-danger text-[15px] font-bold text-on-danger shadow-[0_6px_20px_color-mix(in_srgb,var(--danger)_35%,transparent)]" onclick={ok}>{c.label}</button>
      </div>
    </div>
  </div>
{/if}
