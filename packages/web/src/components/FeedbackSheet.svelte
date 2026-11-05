<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import { autogrow } from '../lib/autogrow';
  import {
    canSendFeedback,
    counterInfo,
    FEEDBACK_KINDS,
    FEEDBACK_MAX,
    feedbackContext,
    kindHint,
    kindInfo,
    kindLabel,
    messagePlaceholder,
    type FeedbackKind,
    type KindInfo,
  } from '../lib/feedback';
  import { closeFeedback, feedbackSheet, resetFeedback } from '../lib/feedbackSheet.svelte';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { formatBytes, prepareUpload } from '../lib/image';
  import { toast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * Feedback in zwei Schritten: erst die Art wählen (große Kacheln), dann Text (Pflicht, höchstens 1000 Zeichen, mit Zähler) und
   * auf Wunsch ein Bild, dann senden. Mitgesendet werden Version, Ansicht, Sprache, Hell/Dunkel, Fenstergröße und ob Stups in Home
   * Assistant eingebettet ist (Server: api/feedback.ts); nie Anmeldedaten. Geöffnet wird es über `openFeedback()` (lib/feedbackSheet.svelte.ts),
   * von beliebigen Stellen aus; es liegt über dem, was offen ist.
   */
  const kind = $derived(feedbackSheet.kind);
  const info = $derived(kind ? kindInfo(kind) : null);
  const counter = $derived(counterInfo(feedbackSheet.draft.length));
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  let busy = $state(false);
  let preparing = $state(false);
  let image = $state<{ file: Blob; filename: string; thumb: Blob | null; url: string } | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  const ready = $derived(canSendFeedback({ kind, message: feedbackSheet.draft, busy: busy || preparing }));

  function pick(k: FeedbackKind) {
    feedbackSheet.kind = k;
  }

  function dropImage() {
    if (image) URL.revokeObjectURL(image.url);
    image = null;
  }
  onDestroy(dropImage);

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast(t('Bitte wähle ein Bild aus'), { tone: 'error' });
      return;
    }
    preparing = true;
    try {
      const p = await prepareUpload(file); // verkleinert, als JPEG, ohne Standort und andere Metadaten
      if (p.file.size > MAX_IMAGE_BYTES) throw new Error(t('Das Bild ist zu groß'));
      dropImage();
      image = { file: p.file, filename: p.filename, thumb: p.thumb, url: URL.createObjectURL(p.file) };
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Das Bild konnte nicht geladen werden'), { tone: 'error' });
    }
    preparing = false;
  }

  /** Ob Stups in einer fremden Seite (Home Assistant) eingebettet läuft */
  function embedded(): boolean {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }

  async function send() {
    if (!ready || !kind) return;
    busy = true;
    try {
      const context = feedbackContext({
        tab: ui.tab,
        lang: i18n.lang,
        dark: window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
        width: window.innerWidth,
        height: window.innerHeight,
        embedded: embedded(),
      });
      await api.sendFeedback({ kind, message: feedbackSheet.draft.trim(), context, image: image ? { file: image.file, filename: image.filename, thumb: image.thumb } : null });
      resetFeedback();
      toast(t('Danke! Dein Feedback ist angekommen.'));
    } catch (e) {
      toast(e instanceof ApiError || e instanceof Error ? e.message : t('Senden fehlgeschlagen'), { tone: 'error' });
    }
    busy = false;
  }

  const focus = (node: HTMLElement) => node.focus();
</script>

{#snippet glyph(k: KindInfo, size: number)}
  {#if k.symbol}<SymbolIcon id={k.symbol} {size} />{:else if k.icon}<Icon name={k.icon} {size} stroke={1.9} />{/if}
{/snippet}

{#snippet backButton()}
  <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={() => (feedbackSheet.kind = null)} aria-label={t('Andere Art wählen')}>{t('Zurück')}</button>
{/snippet}

{#snippet footerCta()}
  <CtaButton disabled={!ready} onclick={send}><Icon name="send" size={22} stroke={2} />{busy ? t('Wird gesendet …') : t('Senden')}</CtaButton>
{/snippet}

<Sheet title={kind ? kindLabel(kind) : t('Feedback')} onclose={closeFeedback} left={kind ? backButton : undefined} footer={kind ? footerCta : undefined}>
  <div class="flex flex-col gap-3.5 pt-1" data-testid="feedback-sheet">
    {#if !kind || !info}
      <div class="px-1">
        <h2 class="text-[22px] leading-[1.15] font-extrabold tracking-tight">{t('Was möchtest du uns sagen?')}</h2>
        <p class="mt-1 text-[14px] text-fg2">{t('Wähle aus, worum es geht.')}</p>
      </div>
      <div class="grid grid-cols-2 gap-2.5" role="group" aria-label={t('Art des Feedbacks')}>
        {#each FEEDBACK_KINDS as k, i (k.id)}
          <button
            type="button"
            class="flex rounded-row border border-line bg-surface text-left active:bg-surface2 {i === FEEDBACK_KINDS.length - 1 ? 'col-span-2 min-h-[76px] items-center gap-3.5 px-3.5 py-3' : 'min-h-[126px] flex-col items-start justify-between gap-3 p-3.5'}"
            data-testid="feedback-kind-{k.id}"
            onclick={() => pick(k.id)}
          >
            <Tile color={k.color} size="lg">{@render glyph(k, 26)}</Tile>
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="text-[16px] leading-tight font-extrabold tracking-tight">{kindLabel(k.id)}</span>
              <span class="text-[13px] leading-snug text-fg2">{kindHint(k.id)}</span>
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <ListRow title={kindLabel(info.id)}>
        {#snippet tile()}<Tile color={info.color}>{@render glyph(info, 24)}</Tile>{/snippet}
        {#snippet meta()}{kindHint(info.id)}{/snippet}
        {#snippet right()}
          <button class="bg-surface2 inline-flex h-[34px] shrink-0 items-center rounded-[12px] px-3 text-[13px] font-bold text-text-soft" onclick={() => (feedbackSheet.kind = null)}>{t('Ändern')}</button>
        {/snippet}
      </ListRow>

      <div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 pt-3 pb-2.5">
        <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="feedback-text">{t('Deine Nachricht')}</label>
        <textarea
          id="feedback-text"
          use:focus
          use:autogrow={feedbackSheet.draft}
          bind:value={feedbackSheet.draft}
          maxlength={FEEDBACK_MAX}
          rows="5"
          placeholder={messagePlaceholder(info.id)}
          aria-describedby="feedback-count"
          class="block min-h-[120px] w-full resize-none bg-transparent p-0 text-[16px] leading-[1.45] font-medium wrap-anywhere placeholder:text-dim"
          data-testid="feedback-text"
        ></textarea>
        <p
          id="feedback-count"
          class="self-end text-[13px] font-semibold tabular-nums {counter.tone === 'full' ? 'text-danger' : counter.tone === 'warn' ? 'text-sig-orange' : 'text-fg2'}"
          data-tone={counter.tone}
          data-testid="feedback-count"
        >
          {counter.text}
        </p>
      </div>

      <input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={onFile} data-testid="feedback-file" />
      {#if image}
        <div class="flex items-center gap-3 rounded-row border border-line bg-surface p-2.5" data-testid="feedback-image">
          <img src={image.url} alt={t('Vorschau des Bildes')} class="h-16 w-16 shrink-0 rounded-[12px] object-cover" />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate text-[15px] font-bold">{image.filename}</span>
            <span class="text-[13px] text-fg2">{formatBytes(image.file.size)}</span>
          </span>
          <button class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-soft" aria-label={t('Bild entfernen')} onclick={dropImage}>
            <Icon name="x" size={20} stroke={2.2} />
          </button>
        </div>
      {:else}
        <button
          type="button"
          class="flex h-14 w-full items-center justify-center gap-2.5 rounded-row border border-dashed border-line bg-surface text-[15px] font-semibold text-accent-text disabled:opacity-50"
          disabled={preparing}
          onclick={() => fileInput?.click()}
        >
          <Icon name="camera" size={22} stroke={1.8} />{preparing ? t('Bild wird vorbereitet …') : t('Bild anhängen (optional)')}
        </button>
      {/if}

      <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Version und Bildschirm werden mitgesendet.')}</p>
    {/if}
    <p class="flex gap-2 px-1 text-[12.5px] leading-[1.45] text-hint">
      <span class="mt-px flex shrink-0"><Icon name="lock" size={14} stroke={2} /></span>
      <span>{t('Dein Feedback wird nur auf dieser Stups-Installation gespeichert und vom Administrator gelesen.')}</span>
    </p>
  </div>
</Sheet>
