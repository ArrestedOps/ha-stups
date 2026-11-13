<script lang="ts">
  import { createLatest } from '../lib/latest';
  import { t, tx } from '../lib/i18n/index.svelte';
  import { api, ApiError, type CardDetail, type Comment } from '../lib/api';
  import { formatBytes, prepareUpload, uploadProblem } from '../lib/image';
  import { autogrow } from '../lib/autogrow';
  import { describeActivity } from '../lib/activity';
  import { formatCost, formatDue } from '../lib/datetime';
  import { tick } from 'svelte';
  import { mayConfirm, waitingForConfirmation } from '../lib/confirm';
  import {
    actResult,
    answerConfirmation,
    closeDetail,
    closeSheet,
    completeCard,
    can,
    moveCard,
    openCardMenuAnywhere,
    openSheet,
    openViewer,
    personById,
    refresh,
    removeCard,
    shiftCards,
    toast,
    ui,
  } from '../lib/store.svelte';
  import { cardTargets } from '../lib/swipe';
  import { nudgesToMe } from '../lib/tasks';
  import { isFuture } from '../lib/datetime';
  import { canNudge } from '../lib/nudge';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import SubmitPill from './SubmitPill.svelte';
  import CardProps from './CardProps.svelte';
  import { detectSymbol } from '../lib/symbols/detect';
  import { loadKeywords } from '../lib/symbols/words.svelte';
  import { i18n } from '../lib/i18n/index.svelte';
  import { symbolName } from '../lib/symbols/library';
  import CardTile from './CardTile.svelte';
  import SymbolSheet from './SymbolSheet.svelte';
  import Avatar from './Avatar.svelte';
  import Banner from './ui/Banner.svelte';
  import StupsCard from './StupsCard.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * `inline`: auf dem Desktop (Aufgaben) klappt die Aufgabe direkt unter ihrer Zeile auf statt in einem Sheet: gleicher Inhalt und dieselbe
   * Logik, in zwei Spalten, mit „Stupsen“, „Erledigt“ und Schließen in einer Leiste oben. Alles speichert sofort.
   */
  let { id, inline = false }: { id: string; inline?: boolean } = $props();
  const close = () => (inline ? closeDetail() : closeSheet());

  // Jede Änderung speichert sofort. „Gespeichert" bestätigt das kurz, damit klar ist, dass nichts fehlt.
  let saved = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const result = await actResult(fn);
    if (result.ok) {
      saved = true;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (saved = false), 2200);
    }
    return result.ok ? result.value : undefined;
  }

  async function finish() {
    // Ein gerade bearbeitetes Feld speichert beim Verlassen; erst danach schließen
    (document.activeElement as HTMLElement | null)?.blur();
    await tick();
    close();
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

  // Eine langsame ältere Antwort darf eine neuere (oder die einer anderen Aufgabe) nicht überschreiben
  const latest = createLatest();
  async function load() {
    try {
      const res = await latest.run(async () => Promise.all([api.card(id), api.comments(id)]));
      if (!res.current) return;
      const [c, cm] = res.value;
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

  // Rolle „Kind": ansehen, eigene Aufgaben abhaken, kommentieren, Fotos und Links anhängen; sonst nichts (der Server prüft es auch)
  const child = $derived(ui.isChild);
  const mine = $derived(!!card && !!ui.me && card.assigneeIds.includes(ui.me.id));
  const canAct = $derived(!child || mine);
  // Bestätigung: das Kind hat abgehakt, ein Erwachsener antwortet
  const waiting = $derived(!!card && waitingForConfirmation(card));
  const requester = $derived(card ? ui.people.find((p) => p.id === card!.confirmRequestedBy) : undefined);
  const mayAnswer = $derived(waiting && mayConfirm(ui.me, can('confirm'), requester));
  // Wohin die Aufgabe verschoben werden darf; ihre aktuelle Spalte bleibt immer auswählbar
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

  // aufgeklappte Aufgabe: rechts Kommentare oder Verlauf
  let side = $state<'c' | 'h'>('c');

  // Symbol der Aufgabe: antippen öffnet „Symbol wählen" (nicht für ein Kind: es ändert keine Aufgaben)
  let symbolOpen = $state(false);
  const nudgeNames = $derived(
    card ? card.assigneeIds.filter((pid) => pid !== ui.me?.id).map((pid) => personById(pid)?.displayName ?? t('Jemand')).join(' & ') : '',
  );

  // „Erledigt“ (oder „Wieder öffnen“) in Kopf des Sheets und in der Detailspalte
  const canFinish = $derived(!!card && (!child || (mine && !waiting && !done)));
  async function toggleDone() {
    if (!card) return;
    if (done) {
      if (firstOpen) await moveCard(card, firstOpen.id, null);
    } else {
      await completeCard(card);
    }
    close();
  }
  // Ein Stups an mich zu dieser Aufgabe: die orange Karte mit den Antworten, wie in der Liste
  const stupsToMe = $derived(
    card && !card.completedAt && ui.me ? nudgesToMe([card], ui.me.id) : [],
  );
  const canStupse = $derived(!!card && !child && !card.completedAt && !!ui.me?.isPerson && canNudge(card, ui.me.id));

  const save = (patch: Parameters<typeof api.updateCard>[1]) => act(() => api.updateCard(id, patch));
  /** Das Symbol zum neuen Titel (nur bei Quelle „auto"): erkannt, sonst Standard */
  const retag = (title: string) => {
    const hit = detectSymbol(title, i18n.lang);
    return hit ? { icon: hit, iconSource: 'auto' as const } : { icon: null, iconSource: null };
  };

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

  const personByName = (name: string | null) => ui.people.find((p) => p.displayName === name);

  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };
</script>

<!-- Oben wie im Mockup: links „Erledigt", mittig klein „Gespeichert", rechts „Fertig" (schließt). Alles speichert sofort, „Fertig" schließt nur. Nichts liegt unten im Weg. -->

{#snippet saveButton()}
  <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text" onclick={finish}>{t('Fertig')}</button>
{/snippet}

{#snippet content()}
  {#if failed}
    <p class="py-10 text-center text-fg2">{t('Diese Aufgabe gibt es nicht mehr.')}</p>
  {:else if !card}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <div class={inline ? 'flex flex-col gap-5 pt-1' : 'flex flex-col gap-3.5 pt-1'}>
      <div class={inline ? 'flex min-w-0 flex-col gap-3.5' : 'contents'}>
      <div class="flex items-center gap-3">
        {#if child}
          <CardTile {card} size="lg" glyph={28} />
        {:else}
          <button
            type="button"
            class="relative block shrink-0 rounded-[14px]"
            aria-label={t('Symbol ändern, gerade: {name}', { name: symbolName(card.icon) })}
            data-testid="symbol-tile"
            onclick={() => (symbolOpen = true)}
          >
            <CardTile {card} size="lg" glyph={28} />
            {#if card.iconSource === 'auto'}
              <span class="bg-accent-grad absolute -right-[5px] -bottom-[5px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-bg !shadow-none" data-testid="symbol-spark"><Icon name="spark" size={12} fill /></span>
            {/if}
          </button>
        {/if}
        <textarea
          rows="1"
          use:autogrow={titleDraft}
          class="block min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-[24px] leading-[1.2] font-extrabold tracking-[-0.02em]"
          aria-label={t('Titel')}
          bind:value={titleDraft}
          readonly={child}
          onfocus={() => (editing = 'title')}
          onblur={() => {
            editing = null;
            const t = titleDraft.trim();
            // Ein erkanntes Symbol (Funken) folgt dem Titel; ein von Hand gewähltes bleibt, wie es ist
            if (!child && t && t !== card!.title) {
              // Die Suchwörter der Symbole sind ein eigenes Paket: erst sicherstellen, dass sie da sind, dann das Symbol zum neuen Titel wählen
              void loadKeywords()
                .catch(() => undefined)
                .then(() => save({ title: t, ...(card!.iconSource === 'auto' ? retag(t) : {}) }));
            } else titleDraft = card!.title;
          }}
        ></textarea>
      </div>

      {#if stupsToMe.length > 0}
        <StupsCard nudges={stupsToMe} onopen={() => {}} />
      {/if}

      <div>
        <CardProps card={card} {targets} onsave={save} onmove={(columnId) => moveCard(card!, columnId)} readonly={child} grid={inline} />
      </div>

      {#if !inline && canFinish}
        <button
          class="bg-accent-grad flex min-h-[52px] w-full items-center justify-center gap-2 rounded-row text-[17px] font-semibold"
          data-testid="detail-done"
          onclick={toggleDone}
        >
          <Icon name={done ? 'undo' : 'check'} size={18} stroke={2.6} />{done ? t('Wieder öffnen') : tx('Aktion', 'Erledigt')}
        </button>
        {#if !done && card.dueAt && !child}
          <button
            class="flex min-h-[46px] w-full items-center gap-3 rounded-row bg-surface px-4 text-left text-[16px] text-accent-text"
            onclick={async () => {
              await shiftCards([card!], 'tomorrow');
              close();
            }}
          >
            <Icon name="clock" size={20} stroke={2} />{t('Auf morgen verschieben')}
          </button>
        {/if}
      {/if}

      {#if waiting}
        <div class="rounded-xl bg-surface2 px-3.5 py-3" data-testid="confirm-note">
          <p class="flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="clock" size={16} />{requester ? t('{name} wartet auf Bestätigung', { name: requester.displayName }) : t('Wartet auf Bestätigung')}
          </p>
          {#if mayAnswer}
            <div class="mt-2.5 flex gap-2">
              <button
                class="min-h-11 flex-1 rounded-xl bg-accent text-[16px] font-semibold text-on-accent"
                onclick={async () => {
                  await answerConfirmation(card!, 'confirm');
                  close();
                }}
              >
                {t('Bestätigen')}
              </button>
              <button
                class="min-h-11 flex-1 rounded-xl border border-line text-[16px] font-semibold"
                onclick={async () => {
                  await answerConfirmation(card!, 'reject');
                  close();
                }}
              >
                {t('Nochmal')}
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if canStupse && !inline}
        <Banner title={t('{names} stupsen', { names: nudgeNames })} sub={t('Freundlich erinnern, mit Antwort-Knöpfen')} onclick={() => openSheet({ type: 'nudge', id: card!.id })}>
          {#snippet leading()}<span class="text-banner-icon"><Icon name="hand" size={30} /></span>{/snippet}
          {#snippet trailing()}<Icon name="chevron-right" size={20} stroke={2} />{/snippet}
        </Banner>
      {/if}

      {#if card.completedAt}
        <p class="flex items-center gap-2 rounded-xl bg-surface2 px-3.5 py-2.5 text-[15px]" data-testid="done-note">
          <Icon name="check" size={16} stroke={2.6} />
          <span>
            {t('Erledigt {when}', { when: formatDue(card.completedAt) })}{card.history[0]?.completedByName ? ` · ${card.history[0].completedByName}` : ''}
          </span>
        </p>
      {/if}

      </div>
      <div class={inline ? 'grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' : 'contents'}>
      <div class={inline ? 'flex min-w-0 flex-col gap-3.5' : 'contents'}>
      <!-- Beschreibung: das Feld trägt seine Beschriftung in sich -->
      <div class="flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20">
        <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="card-desc">{t('Beschreibung')}</label>
        <textarea
          id="card-desc"
          rows="3"
          placeholder={t('Notizen …')}
          use:autogrow={descDraft}
          class="block min-h-6 w-full resize-none overflow-hidden bg-transparent text-[15px] leading-[1.45] font-medium outline-none placeholder:text-dim"
          bind:value={descDraft}
          readonly={child}
          onfocus={() => (editing = 'desc')}
          onblur={() => {
            editing = null;
            if (!child && descDraft !== (card!.description ?? '')) void save({ description: descDraft.trim() || null });
          }}
        ></textarea>
      </div>

      <section aria-label={t('Checkliste')}>
        <SectionHeader title={t('Checkliste')} count={card.checklist.total ? `${card.checklist.done}/${card.checklist.total}` : undefined} />
        {#if inline && card.checklist.total > 0}<div class="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-surface2" aria-hidden="true"><i class="block h-full rounded-[3px] bg-sig-green" style:width="{Math.round((card.checklist.done / card.checklist.total) * 100)}%"></i></div>{/if}
        <div class="mt-2 flex flex-col divide-y divide-line overflow-hidden rounded-row border border-line bg-surface">
          {#each card.checklistItems as item (item.id)}
            <div class="flex min-h-[52px] items-center gap-3 px-3 text-[15px]">
              <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                aria-label={t('Erledigt')}
                disabled={!canAct}
                class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] {item.done ? 'bg-accent-grad !shadow-none' : 'border-2 border-ring'}"
                onclick={() => act(() => api.updateChecklist(item.id, { done: !item.done }))}
              >
                {#if item.done}<Icon name="check" size={14} stroke={3} />{/if}
              </button>
              <input
                class="min-w-0 flex-1 bg-transparent py-2 {item.done ? 'text-hint line-through' : ''}"
                value={item.text}
                readonly={child}
                aria-label={t('Eintrag')}
                onchange={(e) => {
                  const t = e.currentTarget.value.trim();
                  if (t) void act(() => api.updateChecklist(item.id, { text: t }));
                }}
              />
              {#if !child}
                <button class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Eintrag löschen')} onclick={() => act(() => api.deleteChecklist(item.id))}>
                  <Icon name="x" size={16} />
                </button>
              {/if}
            </div>
          {/each}
          {#if canAct}
            <form onsubmit={addItem} class="flex min-h-[52px] items-center gap-3 px-3 text-accent-text">
              <Icon name="plus" size={20} stroke={2} />
              <input
                bind:value={newItem}
                placeholder={t('Punkt hinzufügen')}
                enterkeyhint="done"
                class="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold text-fg placeholder:text-accent-text"
                aria-label={t('Neuer Eintrag')}
              />
              <SubmitPill show={!!newItem.trim()} />
            </form>
          {/if}
        </div>
      </section>

      <section aria-label={t('Links und Anhänge')} class="flex flex-col gap-2">
        <SectionHeader title={t('Links und Anhänge')} />
        {#each card.links as link (link.id)}
          <ListRow title={link.title ?? host(link.url)} href={link.url}>
            {#snippet tile()}<Tile color={link.kind === 'maps' ? 'green' : 'blue'}><Icon name={link.kind === 'maps' ? 'map-pin' : 'link'} size={22} /></Tile>{/snippet}
            {#snippet meta()}<span class="truncate">{link.kind === 'maps' ? `${t('In Aufgaben öffnen')} · ` : ''}{host(link.url)}</span>{/snippet}
            {#snippet right()}
              <span class="flex text-text-soft2"><Icon name="external" size={18} stroke={2} /></span>
              {#if !child}
                <button class="flex h-10 w-8 shrink-0 items-center justify-center text-fg2" aria-label={t('Link entfernen')} onclick={() => act(() => api.deleteLink(link.id))}>
                  <Icon name="x" size={16} />
                </button>
              {/if}
            {/snippet}
          </ListRow>
        {/each}
        {#if canAct}
          <form onsubmit={addLink} class="flex items-center gap-3 rounded-row border border-line bg-surface py-1.5 pr-1.5 pl-3.5 focus-within:border-accent">
            <Icon name="link" size={18} />
            <input
              bind:value={newLink}
              type="url"
              placeholder={t('Website oder Maps-Link einfügen')}
              enterkeyhint="done"
              class="min-h-10 min-w-0 flex-1 bg-transparent"
              aria-label={t('Neuer Link')}
              disabled={linkBusy}
            />
            <SubmitPill show={!!newLink.trim()} busy={linkBusy} />
          </form>
        {/if}

        <div class="flex flex-wrap gap-2">
          {#each card.attachments as a (a.id)}
            <div class="relative">
              <button
                class="flex h-24 w-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-[14px] border border-line bg-surface2 text-[11px] font-semibold text-fg2"
                aria-label={t('{name} ansehen ({size})', { name: a.filename, size: formatBytes(a.size) })}
                onclick={() => openViewer(card!.attachments, card!.attachments.indexOf(a))}
              >
                {#if a.hasThumb}
                  <img src="api/attachments/{a.id}/thumb" alt={a.filename} loading="lazy" class="h-full w-full object-cover" />
                {:else}
                  <Icon name={a.mime === 'application/pdf' ? 'file' : 'image'} size={26} stroke={1.6} />
                  <span class="line-clamp-2 max-w-full px-1 text-center break-all">{a.filename}</span>
                {/if}
              </button>
              {#if !child}
                <button
                  class="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-media/60 text-on-media"
                  aria-label={t('{name} entfernen', { name: a.filename })}
                  onclick={() => act(() => api.deleteAttachment(a.id))}
                >
                  <Icon name="x" size={14} />
                </button>
              {/if}
            </div>
          {/each}
          {#if canAct}
            <input bind:this={fileInput} type="file" accept="image/*,application/pdf" multiple class="hidden" onchange={onFiles} />
            <button
              class="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-line bg-surface text-[11px] font-semibold text-accent-text disabled:opacity-50"
              aria-label={t('Foto oder PDF hinzufügen')}
              disabled={uploading > 0}
              onclick={() => fileInput?.click()}
            >
              <Icon name="plus" size={26} stroke={2} />{uploading > 0 ? t('Lädt hoch …') : t('Hinzufügen')}
            </button>
          {/if}
        </div>
      </section>

      </div>
      <div class={inline ? 'flex min-w-0 flex-col gap-3.5' : 'contents'}>
      {#if inline}
        <div class="flex gap-1 border-b border-line" role="tablist" aria-label={t('Kommentare und Verlauf')}>
          <button type="button" role="tab" aria-selected={side === 'c'} class="h-9 border-b-2 px-3 text-[14px] font-semibold {side === 'c' ? 'border-accent text-fg' : 'border-transparent text-fg2'}" onclick={() => (side = 'c')}>{t('Kommentare')}{comments.length ? ` · ${comments.length}` : ''}</button>
          <button type="button" role="tab" aria-selected={side === 'h'} class="h-9 border-b-2 px-3 text-[14px] font-semibold {side === 'h' ? 'border-accent text-fg' : 'border-transparent text-fg2'}" onclick={() => (side = 'h')}>{t('Verlauf')}</button>
        </div>
      {/if}
      {#if !inline || side === 'c'}
      <section aria-label={t('Kommentare')} class="flex flex-col gap-2">
        <SectionHeader title={t('Kommentare')} count={comments.length || undefined} />
        {#each comments as c (c.id)}
          {@const author = personByName(c.authorName)}
          <div class="flex gap-2.5 rounded-row border border-line bg-surface p-3">
            {#if author}
              <Avatar person={author} size={28} />
            {:else}
              <span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-track text-[12px] font-extrabold">{(c.authorName ?? '?').charAt(0).toUpperCase()}</span>
            {/if}
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-1.5 text-[13px]"><b class="font-bold">{c.authorName ?? t('Unbekannt')}</b><span class="text-hint">{formatDue(c.createdAt)}</span></div>
              <p class="mt-1 text-[14px] leading-[1.45] whitespace-pre-wrap text-text-soft">{c.text}</p>
            </div>
            {#if !child}
              <button class="flex h-9 w-9 shrink-0 items-center justify-center text-fg2" aria-label={t('Kommentar löschen')} onclick={() => act(() => api.deleteComment(c.id))}>
                <Icon name="x" size={14} />
              </button>
            {/if}
          </div>
        {/each}
        {#if canAct}
          <form onsubmit={addComment} class="flex items-center gap-2 rounded-row border border-line bg-surface py-1.5 pr-1.5 pl-3.5 focus-within:border-accent">
            <input bind:value={newComment} placeholder={t('Kommentar schreiben …')} enterkeyhint="send" class="min-h-10 min-w-0 flex-1 bg-transparent text-[16px] font-semibold placeholder:text-dim" aria-label={t('Neuer Kommentar')} />
            <button class="bg-accent-grad glow-pill flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] disabled:opacity-40" aria-label={t('Senden')} disabled={!newComment.trim()}>
              <Icon name="send" size={16} stroke={2} />
            </button>
          </form>
        {/if}
      </section>
      {/if}

      {#if card.activity.length && (!inline || side === 'h')}
        <section aria-label={t('Verlauf')}>
          <SectionHeader title={t('Verlauf')} />
          <div class="flex flex-col gap-2.5 px-1.5 py-1">
            {#each card.activity as a (a.id)}
              {@const d = describeActivity(a)}
              <div class="flex gap-2.5 text-[13px] leading-[1.4] text-fg2">
                <span class="mt-[5px] h-2 w-2 shrink-0 rounded-full {a.kind === 'nudged' || a.kind === 'nudge_reply' ? 'bg-brand-dot' : 'bg-sep'}"></span>
                <span><b class="font-bold text-fg">{d.title}</b> · {d.detail}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <p class="px-1 text-[13px] text-fg2" data-testid="created-note">
        {t('Angelegt {when}', { when: formatDue(card.createdAt) })}{#if personById(card.createdBy ?? '')} · {personById(card.createdBy ?? '')?.displayName}{/if}
      </p>

      {#if ui.view && card.costCents !== null && !child}
        <p class="px-1 text-[13px] text-fg2">{t('Kosten dieser Aufgabe: {amount}', { amount: formatCost(card.costCents) })}</p>
      {/if}
      {#if !child}
        <button class="mb-2 min-h-11 w-full text-[15px] text-fg2" onclick={() => removeCard(card!)}>
          <span class="inline-flex items-center gap-2"><Icon name="trash" size={16} />{t('Aufgabe löschen')}</span>
        </button>
      {/if}
      </div>
      </div>
    </div>
  {/if}
{/snippet}

{#if inline}
  <section class="wrap-anywhere" aria-label={t('Aufgabe')} data-testid="detail">
    <div class="flex items-center gap-2 pb-1">
      <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-sig-green" aria-live="polite">{saved ? t('Gespeichert') : ''}</span>
      {#if card && canStupse}
        <button class="inline-flex h-10 items-center gap-2 rounded-full border border-line-chip bg-surface px-4 text-[14px] font-bold hover:border-sep" onclick={() => openSheet({ type: 'nudge', id: card!.id })}>
          <Icon name="hand" size={16} />{t('Stupsen')}
        </button>
      {/if}
      {#if card && canFinish}
        <button class="bg-accent-grad inline-flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-bold hover:brightness-110" data-testid="detail-done" onclick={toggleDone}>
          <Icon name={done ? 'undo' : 'check'} size={16} stroke={2.6} />{done ? t('Wieder öffnen') : tx('Aktion', 'Erledigt')}
        </button>
      {/if}
      {#if card && !child}
        <button class="flex h-10 w-10 items-center justify-center rounded-full text-text-soft hover:bg-surface2" aria-label={t('Mehr')} title={t('Mehr')} onclick={() => void openCardMenuAnywhere(card!)}>
          <Icon name="more" size={20} stroke={2} />
        </button>
      {/if}
      <button class="flex h-10 w-10 items-center justify-center rounded-full text-text-soft hover:bg-surface2" aria-label={t('Schließen')} title={t('Schließen')} data-testid="detail-close" onclick={finish}>
        <Icon name="x" size={20} stroke={2} />
      </button>
    </div>
    {@render content()}
  </section>
{:else}
  <Sheet title={saved ? t('Gespeichert') : t('Aufgabe')} titleClass={saved ? 'text-[13px] font-semibold text-sig-green' : ''} onclose={closeSheet} right={saveButton} hideClose>
    {@render content()}
  </Sheet>
{/if}

{#if symbolOpen && card}
  <SymbolSheet
    title={card.title}
    icon={card.icon}
    color={card.iconColor}
    source={card.iconSource}
    onpick={(v) => {
      symbolOpen = false;
      void save({ icon: v.icon, iconColor: v.color, iconSource: 'manual' });
    }}
    onclose={() => (symbolOpen = false)}
  />
{/if}
