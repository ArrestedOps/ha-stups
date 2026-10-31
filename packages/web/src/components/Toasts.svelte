<script lang="ts">
  import { fly } from 'svelte/transition';
  import { dismissToast, ui } from '../lib/store.svelte';
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-[max(96px,calc(var(--safe-bottom)+84px))] z-50 flex flex-col items-center gap-2 px-4"
  role="status"
  aria-live="polite"
>
  {#each ui.toasts as t (t.id)}
    <div
      class="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line px-4 py-3 text-[15px] shadow-xl {t.tone === 'error'
        ? 'bg-danger-bg text-danger'
        : 'bg-surface2 text-fg'}"
      transition:fly={{ y: 20, duration: 180 }}
    >
      <span>{t.text}</span>
      {#if t.action}
        <button
          class="min-h-9 rounded-lg px-2 font-semibold text-accent-text"
          onclick={() => {
            void t.action!.run();
            dismissToast(t.id);
          }}
        >
          {t.action.label}
        </button>
      {/if}
    </div>
  {/each}
</div>
