<script lang="ts">
  import { fly } from 'svelte/transition';
  import { dismissToast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h)+20px)] z-50 flex flex-col items-center gap-2 px-3 lg:bottom-6 lg:pl-[calc(16rem+0.75rem)]"
  role="status"
  aria-live="polite"
>
  {#each ui.toasts as t (t.id)}
    <div
      class="pointer-events-auto flex min-h-14 w-full max-w-md items-center gap-2.5 rounded-row border py-1.5 pr-2 pl-3.5 text-[14px] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.6)] {t.tone === 'error'
        ? 'border-danger/35 bg-danger-bg text-danger'
        : 'border-line-chip bg-surface2 text-fg'}"
      transition:fly={{ y: 20, duration: 180 }}
    >
      <span class="flex shrink-0 {t.tone === 'error' ? '' : 'text-text-soft'}"><Icon name={t.tone === 'error' ? 'alert' : 'done'} size={20} stroke={1.8} /></span>
      <span class="min-w-0 flex-1">{t.text}</span>
      {#if t.action}
        <button
          class="bg-accent-grad glow-pill inline-flex h-[34px] shrink-0 items-center rounded-[12px] px-3 text-[13px] font-bold"
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
