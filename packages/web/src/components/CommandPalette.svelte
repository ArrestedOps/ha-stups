<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { agenda } from '../lib/agenda.svelte';
  import { columnForNew } from '../lib/calendar';
  import { t } from '../lib/i18n/index.svelte';
  import { matchesQuery } from '../lib/search';
  import { goTasks, openCardAnywhere, openSettings, openSheet, selectBoard, selectTab, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  /**
   * Befehlspalette des Desktops (Strg/Cmd + K, oder der Eintrag „Suchen oder Befehl“ in der Seitenleiste): ein Feld, darunter Befehle, Seiten,
   * Boards und Aufgaben, die zum Text passen. Pfeiltasten wählen, Enter führt aus, Escape schließt. Ein eigener Text bietet „Aufgabe anlegen“ an.
   */
  type Item = { id: string; group: string; label: string; icon: string; hint?: string; run: () => void };

  let query = $state('');
  let index = $state(0);
  let input: HTMLInputElement | undefined = $state();
  const close = () => (ui.palette = false);
  const column = $derived(columnForNew(ui.view?.columns ?? [], false));
  const canCreate = $derived(!ui.isChild && !!column);

  const all = $derived.by<Item[]>(() => {
    const items: Item[] = [];
    const q = query.trim();
    if (canCreate && q) items.push({ id: 'create', group: t('Befehle'), label: t('Aufgabe anlegen: „{title}“', { title: q }), icon: 'plus', run: () => openSheet({ type: 'new', columnId: column!, title: q }) });
    if (canCreate) items.push({ id: 'new', group: t('Befehle'), label: t('Neue Aufgabe'), icon: 'plus', hint: 'N', run: () => openSheet({ type: 'new', columnId: column! }) });
    items.push({ id: 'settings', group: t('Befehle'), label: t('Einstellungen öffnen'), icon: 'gear', run: () => openSettings() });
    items.push({ id: 'bell', group: t('Befehle'), label: t('Mitteilungen'), icon: 'bell', run: () => openSheet({ type: 'notifications' }) });
    const views: [typeof ui.taskView, string, string][] = [
      ['all', t('Alle offen'), 'checklist'],
      ['nudged', t('Gestupst'), 'hand'],
      ['today', t('Heute'), 'calendar'],
      ['overdue', t('Überfällig'), 'alert'],
      ['week', t('Diese Woche'), 'calendar'],
      ['done', t('Erledigt'), 'done'],
    ];
    for (const [id, label, icon] of views) {
      items.push({ id: `view-${id}`, group: t('Seiten'), label, icon, hint: id === 'all' ? 'G T' : undefined, run: () => { ui.taskView = id; goTasks('list'); } });
    }
    items.push({ id: 'p-boards', group: t('Seiten'), label: 'Boards', icon: 'layers', hint: 'G B', run: () => selectTab('boards') });
    items.push({ id: 'p-cal', group: t('Seiten'), label: t('Kalender'), icon: 'calendar', hint: 'G C', run: () => goTasks('calendar') });
    if (!ui.isChild) items.push({ id: 'p-watch', group: t('Seiten'), label: t('Wächter'), icon: 'shield', hint: 'G W', run: () => selectTab('watchers') });
    for (const b of ui.boards) items.push({ id: `b-${b.id}`, group: 'Boards', label: b.name, icon: 'layers', run: () => { selectTab('boards'); void selectBoard(b.id); } });
    if (q) {
      for (const c of [...agenda.open, ...agenda.undated].filter((c) => matchesQuery(q, c.title, c.boardName)).slice(0, 8)) {
        items.push({ id: `c-${c.id}`, group: t('Aufgaben'), label: c.title, icon: 'checklist', hint: c.boardName, run: () => void openCardAnywhere(c) });
      }
    }
    const hits = items.filter((i) => i.id !== 'create' && (!q || matchesQuery(q, i.label, i.group)));
    // Passt etwas zum Text, steht es vorn; „Aufgabe anlegen“ folgt dahinter (ohne Treffer ist es der erste und einzige Eintrag mit dem Text)
    const create = items.find((i) => i.id === 'create');
    const fresh = q ? hits.filter((i) => i.id !== 'new') : hits;
    return create ? (fresh.length > 0 ? [...fresh, create] : [create]) : hits;
  });
  $effect(() => {
    void query;
    index = 0;
  });
  const groups = $derived.by(() => {
    const out: { name: string; items: (Item & { n: number })[] }[] = [];
    all.forEach((it, n) => {
      let g = out.find((x) => x.name === it.group);
      if (!g) out.push((g = { name: it.group, items: [] }));
      g.items.push({ ...it, n });
    });
    return out;
  });

  function run(it: Item | undefined) {
    if (!it) return;
    close();
    void tick().then(it.run);
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(index + 1, all.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(index - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(all[index]);
    }
  }
  onMount(() => input?.focus());
  $effect(() => {
    document.querySelector(`[data-palette-item="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div class="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
  <button class="absolute inset-0 cursor-default bg-(--scrim)" aria-label={t('Schließen')} tabindex="-1" onclick={close}></button>
  <div class="relative flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-[16px] bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.35)]" role="dialog" aria-label={t('Befehlspalette')} aria-modal="true" tabindex="-1" onkeydown={keydown}>
    <label class="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 text-text-soft">
      <Icon name="search" size={20} stroke={2} />
      <input bind:this={input} bind:value={query} class="min-w-0 flex-1 bg-transparent text-[17px] text-fg outline-none placeholder:text-text-soft" placeholder={t('Suchen oder Befehl')} aria-label={t('Suchen oder Befehl')} autocomplete="off" />
      <kbd class="rounded-md bg-surface2 px-1.5 py-0.5 font-sans text-[11px] font-semibold">Esc</kbd>
    </label>
    <div class="min-h-0 flex-1 overflow-y-auto py-1.5" role="listbox">
      {#each groups as g (g.name)}
        <p class="side-head mt-1 !px-4">{g.name}</p>
        {#each g.items as it (it.id)}
          <button class="flex h-10 w-full items-center gap-3 px-4 text-left text-[15px] {it.n === index ? 'bg-accent/14 text-accent-text' : ''}" role="option" aria-selected={it.n === index} data-palette-item={it.n} onmousemove={() => (index = it.n)} onclick={() => run(it)}>
            <Icon name={it.icon} size={18} stroke={1.8} /><span class="min-w-0 flex-1 truncate">{it.label}</span>
            {#if it.hint}<span class="shrink-0 text-[12px] text-text-soft">{it.hint}</span>{/if}
          </button>
        {/each}
      {/each}
      {#if all.length === 0}<p class="px-4 py-6 text-center text-text-soft">{t('Keine Treffer')}</p>{/if}
    </div>
  </div>
</div>
