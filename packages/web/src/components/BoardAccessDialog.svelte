<script lang="ts">
  import { fade } from 'svelte/transition';
  import { afterText } from '../lib/boardAccess';
  import type { BoardAccessPreview } from '../lib/api';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * Zwei Dialoge zu den Personen eines Boards. `remove`: vor dem Entfernen von Personen (oder dem Wechsel auf „Nur ich") mit ALLEN betroffenen
   * Wächtern, je Zeile „Zuständige jetzt → Danach"; bleibt niemand, steht es orange da (der Wächter legt dann keine Aufgaben an). `blocked`: das
   * Board kann nicht privat werden, solange Wächter darauf zeigen (mit „Wächter öffnen"). Am Desktop breit (≈ 860 px): Wächter und
   * „Zuständige jetzt" in einer Zeile (nowrap, feste Breiten), nur „Danach" darf umbrechen.
   */
  let {
    kind,
    boardName,
    title,
    preview,
    confirmLabel,
    onconfirm,
    onclose,
    onopenwatcher,
  }: {
    kind: 'remove' | 'blocked';
    boardName: string;
    title: string;
    preview: BoardAccessPreview;
    confirmLabel?: string;
    onconfirm?: () => void;
    onclose: () => void;
    onopenwatcher?: (id: string) => void;
  } = $props();

  const name = (id: string) => ui.people.find((p) => p.id === id)?.displayName ?? '?';
  const names = (ids: string[]) => ids.map(name).join(', ');
  const wide = $derived(ui.desktop);
  const sub = $derived(
    preview.watchers.length > 0
      ? tn('Das ändert {n} Wächter. Es gehen keine Aufgaben verloren.', 'Das ändert {n} Wächter. Es gehen keine Aufgaben verloren.', preview.watchers.length)
      : preview.assigneeCards > 0
        ? t('Zuständigkeiten anderer werden entfernt. Es gehen keine Aufgaben verloren.')
        : t('Es gehen keine Aufgaben verloren.'),
  );

  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onclose();
  }
</script>

<svelte:window onkeydowncapture={key} />

<div class="fixed inset-0 z-[70] flex items-center justify-center px-4" transition:fade={{ duration: 120 }}>
  <button class="absolute inset-0 bg-(--scrim)" aria-label={t('Abbrechen')} tabindex="-1" onclick={onclose}></button>
  <div
    role="alertdialog"
    aria-modal="true"
    aria-label={title}
    data-testid="board-access-dialog"
    class="border-line-chip relative flex max-h-[90vh] w-full flex-col gap-3 overflow-y-auto rounded-3xl border bg-surface px-5 pt-5 pb-4 shadow-[0_20px_60px_rgba(0,0,0,0.7)] {wide ? 'max-w-[860px]' : 'max-w-[420px]'}"
  >
    <div class="flex items-start gap-3">
      <Tile color={kind === 'blocked' ? 'red' : 'orange'} size="md" radius={14}><Icon name={kind === 'blocked' ? 'shield' : 'user'} size={24} stroke={1.8} /></Tile>
      <div class="min-w-0 flex-1">
        <h2 class="text-[19px] leading-tight font-extrabold">{title}</h2>
        {#if kind === 'remove'}
          <p class="mt-1 text-[13px] text-fg2" data-testid="access-sub">{sub}</p>
        {:else}
          <p class="mt-1 text-[14px] leading-[1.45] text-fg2">{t('Diese Wächter legen Aufgaben in „{board}“ an. Ändere zuerst ihr Ziel-Board, dann kann das Board privat werden.', { board: boardName })}</p>
        {/if}
      </div>
    </div>

    {#if kind === 'remove' && preview.watchers.length > 0}
      {#if wide}
        <!-- Desktop: Tabelle; „Wächter" und „Zuständige jetzt" einzeilig mit festen Breiten, nur „Danach" bricht um -->
        <table class="w-full table-fixed border-collapse text-left text-[14px]" data-testid="access-table">
          <colgroup><col style="width: 220px" /><col style="width: 200px" /><col /></colgroup>
          <thead>
            <tr class="text-[11px] font-bold tracking-[0.08em] text-fg2 uppercase">
              <th class="py-2 pr-3 font-bold whitespace-nowrap">{t('Wächter')}</th>
              <th class="py-2 pr-3 font-bold whitespace-nowrap">{t('Zuständige jetzt')}</th>
              <th class="py-2 font-bold">{t('Danach')}</th>
            </tr>
          </thead>
          <tbody>
            {#each preview.watchers as w (w.watcherId)}
              <tr class="border-t border-line {w.missing ? 'bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]' : ''}" data-missing={w.missing ? '' : undefined}>
                <td class="overflow-hidden py-2.5 pr-3 font-bold text-ellipsis whitespace-nowrap" title={w.name}>{w.name}</td>
                <td class="overflow-hidden py-2.5 pr-3 text-ellipsis whitespace-nowrap" title={names(w.before)}>{names(w.before)}</td>
                <td class="py-2.5">
                  {#if w.missing}<span class="text-accent-text"><b>{t('niemand')}:</b> {t('Wächter legt keine Aufgaben an, bis neue Zuständige gewählt sind')}</span>{:else}{afterText(w.after.map(name), w.mode)}{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <ul class="flex flex-col gap-2" data-testid="access-list">
          {#each preview.watchers as w (w.watcherId)}
            <li class="flex flex-col gap-1 rounded-row border px-3 py-2.5 text-[14px] {w.missing ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]' : 'border-line bg-surface2'}" data-missing={w.missing ? '' : undefined}>
              <span class="font-bold">{w.name}</span>
              <span class="text-fg2">{names(w.before)} →</span>
              {#if w.missing}<span class="text-accent-text"><b>{t('niemand')}:</b> {t('Wächter legt keine Aufgaben an, bis neue Zuständige gewählt sind')}</span>{:else}<span>{afterText(w.after.map(name), w.mode)}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else if kind === 'blocked'}
      <ul class="flex flex-col gap-2" data-testid="blocked-list">
        {#each preview.blocking as w (w.id)}
          <li class="flex items-center gap-3 rounded-row border border-line bg-surface2 px-3 py-2.5">
            <span class="min-w-0 flex-1 truncate text-[15px] font-bold" title={w.name}>{w.name}</span>
            <button type="button" class="inline-flex h-10 shrink-0 items-center rounded-xl bg-surface px-3 text-[14px] font-bold text-accent-text" onclick={() => onopenwatcher?.(w.id)}>{t('Wächter öffnen')}</button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="mt-1 flex gap-2">
      <button class="border-line-chip min-h-[46px] rounded-[14px] border bg-surface2 px-5 text-[15px] font-bold" onclick={onclose}>{kind === 'blocked' ? t('Schließen') : t('Abbrechen')}</button>
      {#if kind === 'remove'}
        <button class="bg-accent-grad glow-cta min-h-[46px] rounded-[14px] px-5 text-[15px] font-bold" data-testid="access-confirm" onclick={onconfirm}>{confirmLabel ?? t('Entfernen')}</button>
      {/if}
    </div>
  </div>
</div>
