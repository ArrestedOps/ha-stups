<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { fade } from 'svelte/transition';
  import { formatBytes } from '../lib/image';
  import { numberLocale } from '../lib/i18n/index.svelte';
  import { act, closeViewer, personById, ui } from '../lib/store.svelte';
  import { api } from '../lib/api';
  import Icon from './Icon.svelte';

  const viewer = $derived(ui.viewer);
  const item = $derived(viewer ? viewer.items[viewer.index] : null);
  const isPdf = $derived(item?.mime === 'application/pdf');
  const many = $derived((viewer?.items.length ?? 0) > 1);
  /** Karten-Anhänge liegen unter api/attachments/, andere Bilder (Rückmeldungen) bringen ihre Adresse mit und lassen sich hier nicht entfernen */
  const src = $derived(item ? (item.url ?? `api/attachments/${item.id}`) : '');

  let zoomed = $state(false);

  /** „Ben • 28. Jan, 17:42 • 1,8 MB" */
  const caption = $derived.by(() => {
    if (!item) return '';
    const who = item.createdBy ? personById(item.createdBy)?.displayName : undefined;
    const when = new Date(item.createdAt).toLocaleString(numberLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return [who, when, item.size > 0 ? formatBytes(item.size) : ''].filter(Boolean).join(' • ');
  });

  /** Entfernen: mit Rückfrage; ein Kind darf es nicht (wie am Karten-Fenster) */
  function removeItem() {
    if (!item || ui.isChild) return;
    const id = item.id;
    const name = item.filename;
    ui.confirm = {
      title: t('Anhang entfernen?'),
      text: t('„{name}“ wird von der Karte entfernt.', { name }),
      label: t('Entfernen'),
      run: async () => {
        closeViewer();
        await act(() => api.deleteAttachment(id));
      },
    };
  }

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
    if (e.key === 'Escape') {
      // Escape schließt nur das Foto, nicht auch noch die Karte dahinter
      e.stopImmediatePropagation();
      closeViewer();
    }
    else if (e.key === 'ArrowRight' && many) go(1);
    else if (e.key === 'ArrowLeft' && many) go(-1);
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if viewer && item}
  <div
    class="fixed inset-0 z-[60] flex flex-col bg-media text-on-media"
    role="dialog"
    aria-modal="true"
    aria-label={item.filename}
    transition:fade={{ duration: 120 }}
  >
    <header class="flex items-center gap-2 px-2 pt-[calc(var(--safe-top)+8px)] pb-2">
      <button class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-on-media/15" aria-label={t('Schließen')} onclick={closeViewer}><Icon name="x" size={20} stroke={2.2} /></button>
      <span class="min-w-0 flex-1 truncate text-center text-[15px] font-bold">
        {many ? t('{n} von {total}', { n: viewer.index + 1, total: viewer.items.length }) : item.filename}
      </span>
      <span class="h-11 w-11 shrink-0"></span>
    </header>

    <div class="relative my-3 min-h-0 flex-1 {zoomed ? 'overflow-auto' : 'overflow-hidden'}" onpointerdown={down} onpointerup={up} role="presentation">
      {#if isPdf}
        <iframe title={item.filename} src={src} class="h-full w-full bg-on-media"></iframe>
      {:else}
        {#key item.id}
          <button
            class="block {zoomed ? 'w-[250%]' : 'h-full w-full'}"
            aria-label={zoomed ? t('Verkleinern') : t('Vergrößern')}
            onclick={() => (zoomed = !zoomed)}
          >
            <img
              {src}
              alt={item.filename}
              draggable="false"
              class="select-none {zoomed ? 'h-auto w-full' : 'h-full w-full object-contain'}"
            />
          </button>
        {/key}
      {/if}

      {#if many && !zoomed}
        <button class="absolute top-1/2 left-1 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-media/50" aria-label={t('Vorheriges')} onclick={() => go(-1)}>
          <Icon name="chevron-left" size={24} stroke={2.6} />
        </button>
        <button class="absolute top-1/2 right-1 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-media/50 [&>svg]:rotate-180" aria-label={t('Nächstes')} onclick={() => go(1)}>
          <Icon name="chevron-left" size={24} stroke={2.6} />
        </button>
      {/if}
    </div>

    <div class="flex flex-col gap-1 px-4">
      <div class="truncate text-[15px] font-bold">{item.filename}</div>
      <div class="text-[13px] text-text-soft2">{caption}</div>
      {#if isPdf}<p class="text-[13px] text-dim">{t('Zeigt das Gerät das PDF nicht ganz, hilft „Original“.')}</p>{:else if !many}<p class="text-[13px] text-dim">{t('Antippen zum Vergrößern')}</p>{/if}
    </div>
    {#if many}
      <div class="flex justify-center gap-1.5 py-3.5" aria-hidden="true">
        {#each viewer.items as it, i (it.id)}<span class="h-[7px] rounded-full {i === viewer.index ? 'w-5 bg-brand-dot' : 'w-[7px] bg-sep'}"></span>{/each}
      </div>
    {:else}
      <div class="h-3.5"></div>
    {/if}

    <div class="grid grid-cols-3 gap-2 px-3 pb-[max(34px,var(--pad-bottom))]">
      <a class="flex h-14 flex-col items-center justify-center gap-1 rounded-row border border-line bg-surface text-[12px] font-semibold text-fg" href={src} download={item.filename}>
        <Icon name="download" size={20} stroke={1.8} />{t('Sichern')}
      </a>
      <a class="flex h-14 flex-col items-center justify-center gap-1 rounded-row border border-line bg-surface text-[12px] font-semibold text-fg" href={src} target="_blank" rel="noopener noreferrer" aria-label={t('Original im Browser öffnen')}>
        <Icon name="external" size={20} stroke={1.8} />{t('Original')}
      </a>
      {#if !ui.isChild && !item.url}
        <button class="flex h-14 flex-col items-center justify-center gap-1 rounded-row border border-line bg-surface text-[12px] font-semibold text-danger" onclick={removeItem}>
          <Icon name="trash" size={20} stroke={1.8} />{t('Entfernen')}
        </button>
      {:else}
        <span></span>
      {/if}
    </div>
  </div>
{/if}
