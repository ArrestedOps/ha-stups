<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import type { WatcherSuggestion } from '../lib/watcher-types';
  import Icon from './Icon.svelte';

  /**
   * „Wenn“ im Formular am Desktop, wenn mehrere Geräte gemeinsam eingerichtet werden: statt des Suchfelds die Geräte als Chips (mit × zum
   * Entfernen; eines bleibt) und „+ N passende“: Geräte derselben Art und Fassung, die noch fehlen (wieder abgewählte und Treffer aus „Gefunden“).
   * Andere Arten stehen nicht zur Wahl, weil der Auslöser für alle Geräte gilt.
   */
  let { ed, suggestions }: { ed: WatcherEditor; suggestions: WatcherSuggestion[] } = $props();
  const uid = $props.id();
  let open = $state(false);
  const first = $derived(ed.devices[0]);
  const fits = (s: { templateId?: string; variant?: string }) => !!first && !!first.templateId && s.templateId === first.templateId && s.variant === first.variant;
  /** Passende Geräte, die noch nicht dabei sind */
  const more = $derived.by(() => {
    const out = ed.devices.filter((d) => ed.off.includes(d.entityId));
    for (const s of suggestions) {
      if (fits(s) && !ed.devices.some((d) => d.entityId === s.entityId)) out.push({ entityId: s.entityId, name: s.name, reason: s.reason, templateId: s.templateId, variant: s.variant, ...(s.unit ? { unit: s.unit } : {}), ...(s.draft ? { draft: s.draft } : {}) });
    }
    return out;
  });
</script>

<div class="relative flex flex-wrap items-center gap-2" role="group" aria-label={t('Geräte')} data-testid="desk-devices">
  {#each ed.selectedDevices as d (d.entityId)}
    <span class="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-surface2 pr-1 pl-3 text-[13px] font-semibold" data-testid="desk-device">
      <span class="max-w-[16rem] truncate" title={d.reason ?? d.name}>{d.name}</span>
      <button type="button" class="flex h-6 w-6 items-center justify-center rounded-full text-text-soft hover:bg-track disabled:opacity-30" disabled={ed.selectedDevices.length <= 1} aria-label={t('{name} entfernen', { name: d.name })} onclick={() => ed.toggleDevice(d.entityId)}>
        <Icon name="x" size={13} stroke={2.6} />
      </button>
    </span>
  {/each}
  {#if more.length > 0}
    <button
      type="button"
      class="inline-flex h-[34px] items-center gap-1 rounded-full bg-accent/12 px-3 text-[13px] font-bold text-accent-text"
      aria-expanded={open}
      aria-controls="{uid}-more"
      data-testid="desk-devices-more"
      onclick={() => (open = !open)}
    >
      <Icon name="plus" size={14} stroke={2.6} />{tn('{n} passendes', '{n} passende', more.length)}
    </button>
  {/if}
  {#if open && more.length > 0}
    <div id="{uid}-more" class="absolute top-[calc(100%+6px)] left-0 z-20 flex max-h-72 w-[22rem] max-w-full flex-col overflow-y-auto rounded-row bg-surface2 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]" role="group" aria-label={t('Passende Geräte')}>
      <p class="px-3 py-1.5 text-[12.5px] text-fg2">{t('Nur Geräte derselben Art: der Auslöser gilt für alle.')}</p>
      {#each more as d (d.entityId)}
        <button
          type="button"
          class="flex min-h-11 items-center gap-2 rounded-[10px] px-3 py-1.5 text-left hover:bg-surface"
          onclick={() => {
            ed.addDevice(d);
            if (more.length <= 1) open = false;
          }}
        >
          <Icon name="plus" size={15} stroke={2.4} /><span class="min-w-0 flex-1 truncate text-[14px] font-semibold">{d.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
