<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../../lib/api';
  import { deviceTz } from '../../lib/datetime';
  import {
    feedbackAsText,
    formatStamp,
    kindInfo,
    kindLabel,
    type FeedbackItem,
    type FeedbackStatus,
  } from '../../lib/feedback';
  import { t } from '../../lib/i18n/index.svelte';
  import { openViewer, toast, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import SymbolIcon from '../SymbolIcon.svelte';
  import Chip from '../ui/Chip.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Tile from '../ui/Tile.svelte';
  import Page from './Page.svelte';

  /**
   * Feedback der Nutzer (nur Administratoren): die Liste der Rückmeldungen mit Art, Text, Bild (in der Bildansicht), Absender und Zeit.
   * Der Stand (neu, gelesen, erledigt) lässt sich umschalten, eine Rückmeldung löschen oder als Text kopieren (zum Weitergeben, zum
   * Beispiel als Issue). Stups sendet nichts an Dritte.
   */
  let items = $state<FeedbackItem[]>([]);
  let loaded = $state(false);
  let loadError = $state('');
  let filter = $state<'all' | FeedbackStatus>('all');
  /** Falls die Zwischenablage nicht geht: der Text zum Markieren */
  let manual = $state<{ id: string; text: string } | null>(null);

  async function load() {
    try {
      items = (await api.feedback()).items;
      loadError = '';
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : t('Konnte das Feedback nicht laden');
    }
    loaded = true;
  }
  onMount(() => void load());

  const count = (s: FeedbackStatus) => items.filter((i) => i.status === s).length;
  const shown = $derived(filter === 'all' ? items : items.filter((i) => i.status === filter));
  const CHIPS = $derived<{ id: 'all' | FeedbackStatus; label: string; n: number }[]>([
    { id: 'all', label: t('Alle'), n: items.length },
    { id: 'neu', label: t('Neu'), n: count('neu') },
    { id: 'gelesen', label: t('Gelesen'), n: count('gelesen') },
    { id: 'erledigt', label: t('Erledigt'), n: count('erledigt') },
  ]);
  const STATUS = $derived([
    { id: 'neu', label: t('Neu') },
    { id: 'gelesen', label: t('Gelesen') },
    { id: 'erledigt', label: t('Erledigt') },
  ]);

  async function setStatus(item: FeedbackItem, status: FeedbackStatus) {
    if (item.status === status) return;
    try {
      const next = await api.setFeedbackStatus(item.id, status);
      items = items.map((i) => (i.id === item.id ? next : i));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Etwas ist schiefgelaufen'), { tone: 'error' });
    }
  }

  function remove(item: FeedbackItem) {
    ui.confirm = {
      title: t('Feedback löschen?'),
      text: t('Der Text und das Bild werden endgültig gelöscht.'),
      label: t('Löschen'),
      run: async () => {
        try {
          await api.deleteFeedback(item.id);
          items = items.filter((i) => i.id !== item.id);
        } catch (e) {
          toast(e instanceof ApiError ? e.message : t('Etwas ist schiefgelaufen'), { tone: 'error' });
        }
      },
    };
  }

  async function copy(item: FeedbackItem) {
    const text = feedbackAsText(item, deviceTz());
    try {
      await navigator.clipboard.writeText(text);
      manual = null;
      toast(t('Text kopiert'));
    } catch {
      manual = { id: item.id, text };
      toast(t('Kopieren nicht möglich, bitte den Text markieren'), { tone: 'error' });
    }
  }

  function showImage(item: FeedbackItem) {
    openViewer(
      [{ id: item.id, cardId: '', filename: `feedback-${item.id.slice(0, 8)}.jpg`, mime: 'image/jpeg', size: 0, hasThumb: item.hasThumb, createdBy: item.personId, createdAt: item.createdAt, url: `api/feedback/${item.id}/image` }],
      0,
    );
  }

  const viewLabel = (v: string) => (v === 'tasks' ? t('Aufgaben') : v === 'boards' ? 'Boards' : t('Wächter'));
  /** Die technischen Angaben in einer Zeile (Version, Ansicht, Fenster, Hell/Dunkel, eingebettet) */
  function tech(i: FeedbackItem): string {
    const m = i.meta;
    return [
      m.version ? `${m.version}${m.channel === 'beta' ? ' beta' : ''}` : '',
      m.view ? viewLabel(m.view) : '',
      m.viewport ? `${m.viewport.w} × ${m.viewport.h}` : '',
      m.scheme ? (m.scheme === 'dark' ? t('Dunkel') : t('Hell')) : '',
      m.language ? m.language.toUpperCase() : '',
      m.embedded === undefined ? '' : m.embedded ? 'Home Assistant' : t('eigenständig'),
    ]
      .filter(Boolean)
      .join(' · ');
  }
</script>

<Page title={t('Feedback der Nutzer')}>
  <div class="flex flex-col gap-3.5 pt-1" data-testid="feedback-admin">
    <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Das bleibt auf dieser Stups-Installation: Stups sendet nichts an Dritte. Mit „Als Text kopieren“ gibst du es selbst weiter, zum Beispiel als Issue.')}</p>

    {#if loadError}
      <p class="text-danger">{loadError}</p>
    {:else if !loaded}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else}
      <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Stand')}>
        {#each CHIPS as c (c.id)}
          <Chip small active={filter === c.id} pressed={filter === c.id} count={c.n} onclick={() => (filter = c.id)}>{c.label}</Chip>
        {/each}
      </div>

      {#if shown.length === 0}
        <p class="py-10 text-center text-[15px] text-fg2" data-testid="feedback-empty">{items.length === 0 ? t('Noch kein Feedback.') : t('Nichts in dieser Auswahl.')}</p>
      {/if}

      <ul class="flex flex-col gap-2.5">
        {#each shown as item (item.id)}
          {@const k = kindInfo(item.kind)}
          <li>
            <article class="flex flex-col gap-3 rounded-row border bg-surface p-3.5 {item.status === 'neu' ? 'row-new' : 'border-line'}" data-testid="feedback-item" data-status={item.status}>
              <header class="flex items-center gap-3">
                <Tile color={k.color} size="sm">
                  {#if k.symbol}<SymbolIcon id={k.symbol} size={20} />{:else if k.icon}<Icon name={k.icon} size={18} stroke={1.9} />{/if}
                </Tile>
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="truncate text-[15px] font-bold tracking-tight">{kindLabel(item.kind)}</span>
                  <span class="truncate text-[13px] text-fg2">{item.personName ?? t('Unbekannt')} · {formatStamp(item.createdAt, deviceTz())}</span>
                </span>
                {#if item.status === 'neu'}<span class="inline-flex h-6 shrink-0 items-center rounded-full bg-accent/15 px-2.5 text-[12px] font-bold text-accent-text">{t('Neu')}</span>{/if}
              </header>

              <p class="text-[15px] leading-[1.45] wrap-anywhere whitespace-pre-wrap" data-testid="feedback-message">{item.message}</p>

              {#if item.hasImage}
                <button type="button" class="block h-28 w-28 overflow-hidden rounded-[14px] border border-line" aria-label={t('Bild ansehen')} onclick={() => showImage(item)}>
                  <img src="api/feedback/{item.id}/{item.hasThumb ? 'thumb' : 'image'}" alt="" class="h-full w-full object-cover" loading="lazy" />
                </button>
              {/if}

              {#if tech(item)}<p class="text-[12.5px] leading-[1.45] text-hint">{tech(item)}</p>{/if}

              <Segmented small items={STATUS} value={item.status} label={t('Stand')} onchange={(id) => setStatus(item, id as FeedbackStatus)} />
              <div class="grid grid-cols-2 gap-2">
                <button type="button" class="border-line-chip flex h-11 items-center justify-center gap-2 rounded-[14px] border bg-surface2 text-[14px] font-semibold" onclick={() => copy(item)}>
                  <Icon name="copy" size={18} stroke={1.8} />{t('Als Text kopieren')}
                </button>
                <button type="button" class="border-line-chip flex h-11 items-center justify-center gap-2 rounded-[14px] border bg-surface2 text-[14px] font-semibold text-danger" onclick={() => remove(item)}>
                  <Icon name="trash" size={18} stroke={1.8} />{t('Löschen')}
                </button>
              </div>
              {#if manual?.id === item.id}
                <textarea readonly rows="8" class="w-full rounded-row border border-line bg-surface-inset p-3 text-[13px] leading-[1.45]" aria-label={t('Text zum Kopieren')} onfocus={(e) => e.currentTarget.select()}>{manual.text}</textarea>
              {/if}
            </article>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Page>
