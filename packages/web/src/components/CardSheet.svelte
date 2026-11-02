<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api, ApiError, type CardDetail, type Comment } from '../lib/api';
  import { formatBytes, prepareUpload, uploadProblem } from '../lib/image';
  import { autogrow } from '../lib/autogrow';
  import { describeActivity } from '../lib/activity';
  import { formatCost, formatDue } from '../lib/datetime';
  import { tick } from 'svelte';
  import {
    act as rawAct,
    closeSheet,
    completeCard,
    moveCard,
    openSheet,
    openViewer,
    personById,
    refresh,
    removeCard,
    toast,
    ui,
  } from '../lib/store.svelte';
  import { cardTargets } from '../lib/swipe';
  import { isFuture } from '../lib/datetime';
  import { canNudge } from '../lib/nudge';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import SubmitPill from './SubmitPill.svelte';
  import CardProps from './CardProps.svelte';

  let { id }: { id: string } = $props();

  // Jede Änderung speichert sofort. „Gespeichert" bestätigt das kurz, damit klar ist, dass nichts fehlt.
  let saved = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const result = await rawAct(fn);
    if (result !== undefined) {
      saved = true;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (saved = false), 2200);
    }
    return result;
  }

  async function finish() {
    // Ein gerade bearbeitetes Feld speichert beim Verlassen; erst danach schließen
    (document.activeElement as HTMLElement | null)?.blur();
    await tick();
    closeSheet();
  }

  let card = $state<CardDetail | null>(null);
  let comments = $state<Comment[]>([]);
  let failed = $state(false);

  // Entwürfe: werden vom Server nur überschrieben, solange das Feld nicht gerade bearbeitet wird
  let editing = $state<string | null>(null);
  let titleDraft = $state('');
  let descDraft = $state('');
  let newItem = $state('');
  let newLink = $state('');
  let newComment = $state('');
  let linkBusy = $state(false);

  async function load() {
    try {
      const [c, cm] = await Promise.all([api.card(id), api.comments(id)]);
      card = c;
      comments = cm;
      failed = false;
      if (editing !== 'title') titleDraft = c.title;
      if (editing !== 'desc') descDraft = c.description ?? '';
    } catch {
      failed = true;
    }
  }

  $effect(() => {
    void ui.rev;
    void id;
    load();
  });

  const columns = $derived(ui.view?.columns ?? []);
  const column = $derived(columns.find((c) => c.id === card?.columnId));
  const firstOpen = $derived(columns.find((c) => !c.isDone) ?? columns[0]);
  const done = $derived(!!card && (column?.isDone ?? false) && card.completedAt !== null);
  // Wohin die Karte verschoben werden darf; ihre aktuelle Spalte bleibt immer auswählbar
  const targets = $derived(
    card
      ? columns.filter(
          (c) =>
            c.id === card!.columnId ||
            cardTargets(columns, isFuture(card!.dueAt), columns.find((x) => !x.isDone && !x.isPlanned)?.id).some(
              (t) => t.id === c.id,
            ),
        )
      : columns,
  );

  const save = (patch: Parameters<typeof api.updateCard>[1]) => act(() => api.updateCard(id, patch));

  async function addItem(e: Event) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    newItem = '';
    await act(() => api.addChecklist(id, text));
  }

  async function addLink(e: Event) {
    e.preventDefault();
    const url = newLink.trim();
    if (!url || linkBusy) return;
    linkBusy = true;
    const ok = await act(() => api.addLink(id, url));
    linkBusy = false;
    if (ok) newLink = '';
  }

  async function addComment(e: Event) {
    e.preventDefault();
    const text = newComment.trim();
    if (!text) return;
    newComment = '';
    await act(() => api.addComment(id, text));
  }

  let fileInput: HTMLInputElement | undefined = $state();
  let uploading = $state(0);

  async function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const list = [...(input.files ?? [])];
    input.value = '';
    for (const f of list) {
      const problem = uploadProblem(f);
      if (problem) {
        toast(`${f.name}: ${problem}`, { tone: 'error' });
        continue;
      }
      uploading += 1;
      try {
        const p = await prepareUpload(f);
        await api.uploadAttachment(id, p.file, p.filename, p.thumb);
        await refresh();
      } catch (err) {
        toast(err instanceof ApiError || err instanceof Error ? err.message : t('Upload fehlgeschlagen'), { tone: 'error' });
      } finally {
        uploading -= 1;
      }
    }
  }

  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };
</script>

<!-- Oben wie in iOS: links „Erledigt", mittig kurz „Gespeichert", rechts „Fertig" (schließt). Alles speichert sofort, „Fertig" schließt nur. Nichts liegt unten im Weg. -->
{#snippet doneButton()}
  {#if card}
    <button
      class="flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-[15px] font-semibold"
      onclick={async () => {
        if (done) {
          if (firstOpen) await moveCard(card!, firstOpen.id, null);
        } else {
          await completeCard(card!);
        }
        closeSheet();
      }}
    >
      <Icon name={done ? 'undo' : 'check'} size={16} stroke={2.6} />{done ? 'Wieder öffnen' : 'Erledigt'}
    </button>
  {/if}
{/snippet}

{#snippet saveButton()}
  <button class="min-h-11 px-3 text-[17px] font-semibold text-accent-text" onclick={finish}>{t('Fertig')}</button>
{/snippet}

<Sheet title={saved ? `✓ ${t('Gespeichert')}` : ''} onclose={closeSheet} left={doneButton} right={saveButton} hideClose>
  {#if failed}
    <p class="py-10 text-center text-fg2">{t('Diese Karte gibt es nicht mehr.')}</p>
  {:else if !card}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <textarea
      rows="1"
      use:autogrow={titleDraft}
      class="mt-1 block w-full resize-none overflow-hidden bg-transparent text-[26px] leading-tight font-bold tracking-tight"
      aria-label={t('Titel')}
      bind:value={titleDraft}
      onfocus={() => (editing = 'title')}
      onblur={() => {
        editing = null;
        const t = titleDraft.trim();
        if (t && t !== card!.title) void save({ title: t });
        else titleDraft = card!.title;
      }}
    ></textarea>

    <CardProps
      card={card}
      {targets}
      onsave={save}
      onmove={(columnId) => moveCard(card!, columnId)}
    />

    <p class="mt-2.5 px-1 text-[13px] text-fg2" data-testid="created-note">
      {t('Angelegt {when}', { when: formatDue(card.createdAt) })}{#if personById(card.createdBy ?? '')} · {personById(card.createdBy ?? '')?.displayName}{/if}
    </p>

    {#if !card.completedAt && ui.me?.isPerson && canNudge(card, ui.me.id)}
      <button
        class="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-accent/60 text-[16px] font-semibold text-accent-text"
        onclick={() => openSheet({ type: 'nudge', id: card!.id })}
      >
        <Icon name="hand" size={18} />{t('Stupsen')}
      </button>
    {/if}

    {#if card.completedAt}
      <p class="mt-3 flex items-center gap-2 rounded-xl bg-surface2 px-3.5 py-2.5 text-[15px]" data-testid="done-note">
        <Icon name="check" size={16} stroke={2.6} />
        <span>
          {t('Erledigt {when}', { when: formatDue(card.completedAt) })}{card.history[0]?.completedByName ? ` · ${card.history[0].completedByName}` : ''}
        </span>
      </p>
    {/if}

    <Group title={t('Beschreibung')}>
      <textarea
        rows="3"
        placeholder="Notizen …"
        use:autogrow={descDraft}
        class="block min-h-[84px] w-full resize-none overflow-hidden bg-transparent px-4 py-3 text-[17px] leading-snug"
        aria-label={t('Beschreibung')}
        bind:value={descDraft}
        onfocus={() => (editing = 'desc')}
        onblur={() => {
          editing = null;
          if (descDraft !== (card!.description ?? '')) void save({ description: descDraft.trim() || null });
        }}
      ></textarea>
    </Group>

    <Group title="Checkliste {card.checklist.total ? `· ${card.checklist.done} von ${card.checklist.total}` : ''}">
      {#each card.checklistItems as item (item.id)}
        <div class="flex min-h-[46px] items-center gap-3 px-4">
          <input
            type="checkbox"
            class="h-6 w-6 shrink-0 accent-[var(--accent)]"
            checked={item.done}
            aria-label={t('Erledigt')}
            onchange={(e) => act(() => api.updateChecklist(item.id, { done: e.currentTarget.checked }))}
          />
          <input
            class="min-w-0 flex-1 bg-transparent py-2 {item.done ? 'text-fg2 line-through' : ''}"
            value={item.text}
            aria-label="Eintrag"
            onchange={(e) => {
              const t = e.currentTarget.value.trim();
              if (t) void act(() => api.updateChecklist(item.id, { text: t }));
            }}
          />
          <button class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Eintrag löschen')} onclick={() => act(() => api.deleteChecklist(item.id))}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <form onsubmit={addItem} class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="plus" size={18} />
        <input bind:value={newItem} placeholder={t('Eintrag hinzufügen')} enterkeyhint="done" class="min-w-0 flex-1 bg-transparent py-2" aria-label={t('Neuer Eintrag')} />
        <SubmitPill show={!!newItem.trim()} />
      </form>
    </Group>

    <Group title="Links">
      {#each card.links as link (link.id)}
        <div class="flex min-h-14 items-center gap-3 px-3 py-2">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex min-w-0 flex-1 items-center gap-3"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {link.kind === 'maps' ? 'cat-green' : 'cat-blue'}">
              <Icon name={link.kind === 'maps' ? 'map-pin' : 'globe'} size={20} />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[16px] font-semibold">{link.title ?? host(link.url)}</span>
              <span class="block truncate text-[13px] text-fg2">{link.kind === 'maps' ? 'In Karten öffnen · ' : ''}{host(link.url)}</span>
            </span>
            <Icon name="external" size={16} />
          </a>
          <button class="flex h-10 w-10 shrink-0 items-center justify-center text-fg2" aria-label={t('Link entfernen')} onclick={() => act(() => api.deleteLink(link.id))}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <form onsubmit={addLink} class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="link" size={18} />
        <input
          bind:value={newLink}
          type="url"
          placeholder={t('Website oder Maps-Link einfügen')}
          enterkeyhint="done"
          class="min-w-0 flex-1 bg-transparent py-2"
          aria-label={t('Neuer Link')}
          disabled={linkBusy}
        />
        <SubmitPill show={!!newLink.trim()} busy={linkBusy} />
      </form>
    </Group>

    <Group title={t('Anhänge')}>
      {#if card.attachments.length}
        <div class="grid grid-cols-3 gap-2 p-3">
          {#each card.attachments as a (a.id)}
            <div class="relative">
              <button
                class="block aspect-square w-full overflow-hidden rounded-xl bg-surface2"
                aria-label="{a.filename} ansehen ({formatBytes(a.size)})"
                onclick={() => openViewer(card!.attachments, card!.attachments.indexOf(a))}
              >
                {#if a.hasThumb}
                  <img src="api/attachments/{a.id}/thumb" alt={a.filename} loading="lazy" class="h-full w-full object-cover" />
                {:else}
                  <span class="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-[12px]">
                    <span class="text-[15px] font-bold text-danger">{a.mime === 'application/pdf' ? 'PDF' : 'Datei'}</span>
                    <span class="line-clamp-2 break-all text-fg2">{a.filename}</span>
                  </span>
                {/if}
              </button>
              <button
                class="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label="{a.filename} entfernen"
                onclick={() => act(() => api.deleteAttachment(a.id))}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          {/each}
        </div>
      {/if}
      <div class="px-4 py-1.5">
        <input bind:this={fileInput} type="file" accept="image/*,application/pdf" multiple class="hidden" onchange={onFiles} />
        <button class="flex min-h-11 w-full items-center gap-3 text-left text-[17px] text-accent-text disabled:opacity-50" disabled={uploading > 0} onclick={() => fileInput?.click()}>
          <Icon name="camera" size={18} />{uploading > 0 ? 'Lädt hoch …' : 'Foto oder PDF hinzufügen'}
        </button>
      </div>
    </Group>

    <Group title={t('Kommentare')}>
      {#each comments as c (c.id)}
        <div class="flex gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <div class="text-[13px] text-fg2">{c.authorName ?? 'Unbekannt'} · {formatDue(c.createdAt)}</div>
            <div class="text-[16px] leading-snug whitespace-pre-wrap">{c.text}</div>
          </div>
          <button class="flex h-9 w-9 shrink-0 items-center justify-center text-fg2" aria-label={t('Kommentar löschen')} onclick={() => act(() => api.deleteComment(c.id))}>
            <Icon name="x" size={14} />
          </button>
        </div>
      {/each}
      <form onsubmit={addComment} class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="message" size={18} />
        <input bind:value={newComment} placeholder={t('Kommentar schreiben')} enterkeyhint="send" class="min-w-0 flex-1 bg-transparent py-2" aria-label={t('Neuer Kommentar')} />
        <SubmitPill show={!!newComment.trim()} label="Senden" />
      </form>
    </Group>

    {#if card.activity.length}
      <Group title="Verlauf">
        {#each card.activity as a (a.id)}
          {@const d = describeActivity(a)}
          <div class="px-4 py-2.5">
            <div class="text-[15px] font-medium">{d.title}</div>
            <div class="text-[13px] text-fg2">{d.detail}</div>
          </div>
        {/each}
      </Group>
    {/if}

    {#if ui.view && card.costCents !== null}
      <p class="mt-3 px-3 text-[13px] text-fg2">{t('Kosten dieser Karte: {amount}', { amount: formatCost(card.costCents) })}</p>
    {/if}
    <button class="mt-8 mb-2 min-h-11 w-full text-[15px] text-fg2" onclick={() => removeCard(card!)}>
      <span class="inline-flex items-center gap-2"><Icon name="trash" size={16} />{t('Karte löschen')}</span>
    </button>
  {/if}
</Sheet>
