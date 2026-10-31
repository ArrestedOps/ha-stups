<script lang="ts">
  import { fade } from 'svelte/transition';
  import { formatBytes } from '../lib/image';
  import { closeViewer, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  const viewer = $derived(ui.viewer);
  const item = $derived(viewer ? viewer.items[viewer.index] : null);
  const isPdf = $derived(item?.mime === 'application/pdf');
  const many = $derived((viewer?.items.length ?? 0) > 1);

  let zoomed = $state(false);

  function go(step: number) {
    if (!ui.viewer) return;
    const n = ui.viewer.items.length;
    ui.viewer.index = (ui.viewer.index + step + n) % n;
    zoomed = false;
  }

  // Wischen zum Blättern, solange nicht herangezoomt ist
  let startX = 0;
  let tracking = false;
  function down(e: PointerEvent) {
    if (zoomed || e.pointerType === 'mouse') return;
    startX = e.clientX;
    tracking = true;
  }
  function up(e: PointerEvent) {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    if (many && Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  }

  function onKey(e: KeyboardEvent) {
    if (!viewer) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight' && many) go(1);
    else if (e.key === 'ArrowLeft' && many) go(-1);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if viewer && item}
  <div
    class="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white"
    role="dialog"
    aria-modal="true"
    aria-label={item.filename}
    transition:fade={{ duration: 120 }}
  >
    <header class="flex items-center justify-between gap-2 px-2 pt-[max(8px,var(--safe-top))] pb-2">
      <button class="min-h-11 shrink-0 px-3 text-[17px] font-semibold text-accent-text" onclick={closeViewer}>Schließen</button>
      <span class="min-w-0 truncate text-center text-[13px] text-white/70">
        {item.filename} · {formatBytes(item.size)}{many ? ` · ${viewer.index + 1} von ${viewer.items.length}` : ''}
      </span>
      <a
        class="flex h-11 w-11 shrink-0 items-center justify-center text-white/80"
        href="api/attachments/{item.id}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Im Browser öffnen oder sichern"
      >
        <Icon name="external" size={20} />
      </a>
    </header>

    <div class="relative min-h-0 flex-1 {zoomed ? 'overflow-auto' : 'overflow-hidden'}" onpointerdown={down} onpointerup={up} role="presentation">
      {#if isPdf}
        <iframe title={item.filename} src="api/attachments/{item.id}" class="h-full w-full bg-white"></iframe>
      {:else}
        {#key item.id}
          <button
            class="block {zoomed ? 'w-[250%]' : 'h-full w-full'}"
            aria-label={zoomed ? 'Verkleinern' : 'Vergrößern'}
            onclick={() => (zoomed = !zoomed)}
          >
            <img
              src="api/attachments/{item.id}"
              alt={item.filename}
              draggable="false"
              class="select-none {zoomed ? 'h-auto w-full' : 'h-full w-full object-contain'}"
            />
          </button>
        {/key}
      {/if}

      {#if many && !zoomed}
        <button class="absolute top-1/2 left-1 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50" aria-label="Vorheriges" onclick={() => go(-1)}>
          <Icon name="chevron-left" size={24} stroke={2.6} />
        </button>
        <button class="absolute top-1/2 right-1 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 [&>svg]:rotate-180" aria-label="Nächstes" onclick={() => go(1)}>
          <Icon name="chevron-left" size={24} stroke={2.6} />
        </button>
      {/if}
    </div>

    <p class="px-4 pt-2 pb-[max(12px,var(--safe-bottom))] text-center text-[13px] text-white/60">
      {#if isPdf}
        Zeigt das Gerät das PDF nicht ganz, hilft „Im Browser öffnen" oben rechts.
      {:else}
        Antippen zum Vergrößern{many ? ', wischen zum Blättern' : ''}
      {/if}
    </p>
  </div>
{/if}
