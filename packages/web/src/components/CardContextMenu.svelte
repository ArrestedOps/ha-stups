<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import type { Card } from '../lib/api';
  import { canNudge } from '../lib/nudge';
  import { act, completeCard, openCardAnywhere, openSheet, removeCard, shiftCards, toast, ui } from '../lib/store.svelte';
  import { api } from '../lib/api';
  import Icon from './Icon.svelte';

  /**
   * Rechtsklick-Menü einer Aufgabe am Desktop (Entwurf): erscheint am Zeiger, nicht als Blatt von unten. Pfeiltasten und Enter, Escape schließt.
   */
  const ctx = $derived(ui.ctx);
  let menu: HTMLElement | undefined = $state();
  let index = $state(0);

  type Item = { id: string; label: string; icon: string; danger?: boolean; run: (c: Card) => void };
  const items = $derived.by<Item[]>(() => {
    const c = ctx?.card;
    if (!c) return [];
    const out: Item[] = [{ id: 'open', label: t('Öffnen'), icon: 'external', run: (x) => void openCardAnywhere(x) }];
    if (!c.completedAt) out.push({ id: 'done', label: t('Erledigt'), icon: 'check', run: (x) => void completeCard(x) });
    if (!ui.isChild && canNudge(c, ui.me?.id ?? null)) out.push({ id: 'nudge', label: t('Stupsen'), icon: 'hand', run: (x) => openSheet({ type: 'nudge', id: x.id }) });
    if (!ui.isChild && c.dueAt && !c.completedAt) out.push({ id: 'later', label: t('Später (morgen)'), icon: 'clock', run: (x) => void shiftCards([x], 'tomorrow') });
    if (!ui.isChild) out.push({ id: 'dup', label: t('Duplizieren'), icon: 'copy', run: async (x) => {
      const copy = await act(() => api.duplicateCard(x.id));
      if (copy) toast(t('Aufgabe dupliziert'), { action: { label: t('Öffnen'), run: () => openSheet({ type: 'card', id: copy.id }) } });
    } });
    if (!ui.isChild) out.push({ id: 'del', label: t('Löschen'), icon: 'trash', danger: true, run: (x) => removeCard(x) });
    return out;
  });

  const close = () => (ui.ctx = null);
  function run(it: Item | undefined) {
    const c = ctx?.card;
    close();
    if (it && c) it.run(c);
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(index + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(index - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[index]);
    }
  }
  // am Rand des Fensters nach innen schieben
  const pos = $derived.by(() => {
    const w = 220;
    const h = items.length * 40 + 12;
    return { x: Math.max(8, Math.min(ctx?.x ?? 0, window.innerWidth - w - 8)), y: Math.max(8, Math.min(ctx?.y ?? 0, window.innerHeight - h - 8)) };
  });
  onMount(() => menu?.focus());
</script>

{#if ctx}
  <div class="fixed inset-0 z-[55]" role="presentation" oncontextmenu={(e) => { e.preventDefault(); close(); }}>
    <button class="absolute inset-0 cursor-default" aria-label={t('Schließen')} tabindex="-1" onclick={close}></button>
    <div
      bind:this={menu}
      class="absolute w-[220px] overflow-hidden rounded-[12px] bg-surface py-1 shadow-[0_12px_36px_rgba(0,0,0,0.28)] outline-none"
      style:left="{pos.x}px"
      style:top="{pos.y}px"
      role="menu"
      aria-label={t('Aufgaben-Menü')}
      tabindex="-1"
      onkeydown={keydown}
    >
      {#each items as it, n (it.id)}
        <button
          class="flex h-10 w-full items-center gap-3 px-3.5 text-left text-[15px] {n === index ? 'bg-accent/14' : ''} {it.danger ? 'text-danger' : ''}"
          role="menuitem"
          onmousemove={() => (index = n)}
          onclick={() => run(it)}
        ><Icon name={it.icon} size={18} stroke={1.9} />{it.label}</button>
      {/each}
    </div>
  </div>
{/if}
