<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { api, ApiError, type BoardAccessInput, type BoardAccessPreview, type BoardDeletePreview } from '../lib/api';
  import { boardWho, type Visibility } from '../lib/boardAccess';
  import { boardColorOfTile, lockText, QUICK_SYMBOLS } from '../lib/boardAdmin';
  import { CATEGORY_COLORS } from '../lib/colors';
  import { tileColorOf } from '../lib/cardTile';
  import { boardColorKey } from '../lib/schedule';
  import { symbolById, symbolName } from '../lib/symbols/library';
  import { act, closeSheet, openSheet, refresh, showBoard, toast, ui } from '../lib/store.svelte';
  import BoardAccessDialog from './BoardAccessDialog.svelte';
  import BoardArchiveDialog from './BoardArchiveDialog.svelte';
  import BoardDeleteDialog from './BoardDeleteDialog.svelte';
  import BoardDuplicateDialog from './BoardDuplicateDialog.svelte';
  import BoardTemplateDialog from './BoardTemplateDialog.svelte';
  import BoardTile from './BoardTile.svelte';
  import BoardVisibilityPicker from './BoardVisibilityPicker.svelte';
  import Icon from './Icon.svelte';
  import SelectField from './SelectField.svelte';
  import Sheet from './Sheet.svelte';
  import SubmitPill from './SubmitPill.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import SymbolSheet from './SymbolSheet.svelte';
  import Chip from './ui/Chip.svelte';
  import Field from './ui/Field.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  const view = $derived(ui.view);
  const columns = $derived(view?.columns ?? []);
  const categories = $derived(view?.categories ?? []);

  // Der Name im Feld folgt dem Board, nur nicht, solange man gerade darin tippt: eine neue Ansicht (nach Symbol oder Farbe) setzt sonst die Eingabe zurück
  let boardName = $state('');
  let nameOf = '';
  $effect(() => {
    const b = view?.board;
    if (!b) return;
    if (b.id !== nameOf || document.activeElement?.id !== 'board-title') {
      nameOf = b.id;
      boardName = b.name;
    }
  });
  let newColumn = $state('');
  let newCategory = $state('');
  let newColor = $state<string>('blue');
  let deletingColumn = $state<string | null>(null);
  let moveTo = $state('');
  /** Spalten und Kategorien klappen auf (Zeilen wie die übrigen Einstellungen) */
  let openColumns = $state(false);
  let openCategories = $state(false);
  /** der offene Dialog zum Board: Löschen, Archivieren, Duplizieren, Vorlage */
  let dialog = $state<null | 'delete' | 'archive' | 'duplicate' | 'template'>(null);
  let symbolOpen = $state(false);
  /** Was das Löschen trifft und ob es gesperrt ist (letztes Board, nicht verwaltbar) */
  let preview = $state<BoardDeletePreview | null>(null);
  /** die Spalte, deren Einstellungen (Geplant, Erledigt, Löschen) offen sind */
  let moreFor = $state<string | null>(null);
  /** die Kategorie, die gerade bearbeitet wird, und ob das Formular für eine neue offen ist */
  let editCat = $state<string | null>(null);
  let creatingCat = $state(false);
  let archivedCount = $state<number | null>(null);
  let trashCount = $state<number | null>(null);

  onMount(() => {
    // für ein bestimmtes Board geöffnet (zum Beispiel nach dem Duplizieren): erst dorthin wechseln
    const wanted = ui.sheet?.type === 'boardSettings' ? ui.sheet.boardId : undefined;
    if (wanted && wanted !== ui.boardId) void showBoard(wanted);
    void api.trash().then((l) => (trashCount = l.length)).catch(() => undefined);
  });
  // Archiv-Zahl und Sperre des Löschens folgen dem gewählten Board (und jedem Nachladen)
  $effect(() => {
    void ui.rev;
    const id = ui.boardId;
    if (!id) return;
    void api.archived(id).then((l) => (archivedCount = id === ui.boardId ? l.length : archivedCount)).catch(() => undefined);
    void api
      .boardDeletePreview(id)
      .then((p) => (preview = id === ui.boardId ? p : preview))
      .catch(() => undefined);
  });

  // ----- Wer sieht das Board, zählt es zur Fairness? Nur der Besitzer ändert das (bei Boards ohne Besitzer ein Administrator) -----
  const board = $derived(view?.board);
  const mayChangeAccess = $derived(!!board && (board.ownerId === ui.me?.id || (board.ownerId === null && ui.isAdmin)));
  /** Was gerade gilt; die Auswahl springt nach einem abgelehnten Wechsel hierher zurück */
  const visibility = $derived<Visibility>(board?.visibility ?? 'all');
  /** Ein Wechsel wartet auf die Bestätigung im Dialog (Personen entfernen) oder wurde abgelehnt (Wächter zeigen auf das Board) */
  let pending = $state<{ kind: 'remove' | 'blocked'; change: BoardAccessInput; preview: BoardAccessPreview; title: string } | null>(null);

  async function applyAccess(change: BoardAccessInput) {
    if (!board) return;
    try {
      await api.updateBoard(board.id, change);
    } catch (e) {
      // ein Wächter zeigt auf das Board: der Server liefert die Liste
      if (e instanceof ApiError && e.status === 409 && Array.isArray((e.data as { watchers?: unknown })?.watchers)) {
        const watchers = (e.data as { watchers: { id: string; name: string }[] }).watchers;
        pending = { kind: 'blocked', change, preview: { removedIds: [], watchers: [], blocking: watchers, assigneeCards: 0 }, title: t('Board kann nicht privat werden') };
      } else {
        toast(e instanceof Error ? e.message : t('Änderung fehlgeschlagen'), { tone: 'error' });
      }
    }
    await refresh();
  }

  /**
   * Sichtbarkeit oder Mitglieder ändern. Erst fragt der Server, was es kostet: Verhindern Wächter es (Board auf „Nur ich"), sagt ein Dialog
   * welche; verlieren Personen den Blick auf das Board, bestätigt ein Dialog mit allen betroffenen Wächtern („jetzt → danach").
   */
  async function changeAccess(change: BoardAccessInput) {
    if (!board) return;
    const next = { visibility: change.visibility ?? board.visibility, memberIds: change.memberIds ?? board.memberIds };
    let preview: BoardAccessPreview;
    try {
      preview = await api.boardAccessPreview(board.id, next);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Änderung fehlgeschlagen'), { tone: 'error' });
      return;
    }
    if (preview.blocking.length > 0) {
      pending = { kind: 'blocked', change, preview, title: t('Board kann nicht privat werden') };
      return;
    }
    const names = preview.removedIds.map((id) => ui.people.find((p) => p.id === id)?.displayName ?? '?').join(', ');
    if (next.visibility === 'private' && board.visibility !== 'private') {
      pending = { kind: 'remove', change, preview, title: t('„{board}“ nur für dich?', { board: board.name }) };
    } else if (preview.removedIds.length > 0) {
      pending = { kind: 'remove', change, preview, title: t('{names} aus „{board}“ entfernen?', { names, board: board.name }) };
    } else {
      await applyAccess(change);
    }
  }
  async function confirmAccess() {
    const p = pending;
    pending = null;
    if (p) await applyAccess(p.change);
  }
  function openWatcher(id: string) {
    pending = null;
    openSheet({ type: 'watcher', id });
  }

  const cardsIn = (columnId: string) => (view?.cards ?? []).filter((c) => c.columnId === columnId).length;
  const dot = (color: string) => `var(--c-${color}-fg)`;

  async function moveColumn(i: number, dir: -1 | 1) {
    const afterId = dir === -1 ? (columns[i - 2]?.id ?? null) : columns[i + 1]!.id;
    await act(() => api.moveColumn(columns[i]!.id, afterId));
  }

  function askDelete(id: string) {
    if (cardsIn(id) === 0) {
      void act(() => api.deleteColumn(id));
      return;
    }
    deletingColumn = id;
    moveTo = columns.find((c) => c.id !== id)?.id ?? '';
  }

  async function confirmDelete() {
    if (!deletingColumn) return;
    const id = deletingColumn;
    deletingColumn = null;
    await act(() => api.deleteColumn(id, moveTo));
  }

  async function addColumn(e: Event) {
    e.preventDefault();
    const n = newColumn.trim();
    if (!n || !ui.boardId) return;
    newColumn = '';
    await act(() => api.addColumn(ui.boardId!, n));
  }

  async function addCategory(e: Event) {
    e.preventDefault();
    const n = newCategory.trim();
    if (!n || !ui.boardId) return;
    newCategory = '';
    await act(() => api.addCategory(ui.boardId!, n, newColor));
    newColor = CATEGORY_COLORS[(CATEGORY_COLORS.indexOf(newColor as never) + 1) % CATEGORY_COLORS.length]!;
  }

  /** Das Symbol wurde gewählt (Schnellwahl oder Fenster „Symbol wählen"); eine gewählte Farbe wird die Farbe des Boards */
  function pickLook(v: { icon?: string; color?: string | null }) {
    if (!board) return;
    const patch: { icon?: string; color?: string | null } = {};
    if (v.icon) patch.icon = v.icon;
    if (v.color) patch.color = v.color;
    if (Object.keys(patch).length > 0) void act(() => api.updateBoard(board.id, patch));
  }
  const quick = $derived.by(() => {
    const cur = board?.icon;
    return cur && symbolById(cur) && !QUICK_SYMBOLS.includes(cur as never) ? [cur, ...QUICK_SYMBOLS] : [...QUICK_SYMBOLS];
  });
  const colorKey = $derived(board ? boardColorKey(board.color, ui.boards.findIndex((b) => b.id === board.id)) : 'gray');
  const lockedDelete = $derived(preview ? lockText(preview) : null);
  const lockedArchive = $derived(preview ? lockText(preview, 'archive') : null);

  /** Nach dem Löschen oder Archivieren: das Fenster schließt, die App zeigt ein anderes Board */
  function afterRemoved() {
    dialog = null;
    closeSheet();
  }
</script>

{#snippet colors(current: string, pick: (c: string) => void, label: string)}
  <div class="flex flex-wrap gap-2.5" role="radiogroup" aria-label={label}>
    {#each CATEGORY_COLORS as color (color)}
      <button
        type="button"
        role="radio"
        aria-checked={current === color}
        aria-label={color}
        class="h-[30px] w-[30px] rounded-full border-2 p-0 shadow-[inset_0_0_0_2px_var(--surface)] {current === color ? 'border-fg' : 'border-transparent'}"
        style:background={dot(color)}
        onclick={() => pick(color)}
      ></button>
    {/each}
  </div>
{/snippet}

{#snippet boardPicker()}
  <!-- Für welches Board? Die Zeile zeigt die Wahl, darüber liegt das Auswahlfeld des Handys -->
  <div class="relative flex min-h-row items-center gap-3 rounded-row border border-line bg-surface py-2 pr-2.5 pl-3 focus-within:ring-2 focus-within:ring-accent" data-testid="settings-board">
    {#if board}<BoardTile {board} />{/if}
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate text-[15px] font-bold tracking-tight">{board?.name ?? t('Board wählen')}</span>
      <span class="truncate text-[13px] text-fg2">{t('Board wählen')}</span>
    </span>
    <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-down" size={20} stroke={2} /></span>
    <select class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" value={ui.boardId ?? ''} aria-label={t('Für welches Board?')} onchange={(e) => void showBoard(e.currentTarget.value)}>
      {#each ui.boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
    </select>
  </div>
{/snippet}

{#snippet look()}
  {#if board}
    <div class="flex flex-col gap-3 rounded-row border border-line bg-surface px-3.5 py-3" data-testid="board-look">
      <div class="flex flex-col gap-2">
        <p class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Symbol')}</p>
        <div class="flex flex-wrap gap-2" role="group" aria-label={t('Symbol des Boards')}>
          {#each quick as id (id)}
            {@const on = board.icon === id}
            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-[12px] border-2 bg-surface2 text-fg {on ? 'border-accent' : 'border-transparent'}"
              aria-label={symbolName(id)}
              aria-pressed={on}
              onclick={() => pickLook({ icon: id })}
            >
              <SymbolIcon {id} size={22} />
            </button>
          {/each}
          <button type="button" class="flex h-11 w-11 items-center justify-center rounded-[12px] bg-surface2 text-fg" aria-label={t('Weitere Symbole')} onclick={() => (symbolOpen = true)}>
            <Icon name="plus" size={20} stroke={2} />
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <p class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Farbe')}</p>
        {@render colors(colorKey, (c) => pickLook({ color: c }), t('Farbe des Boards'))}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet manageRow(title: string, sub: string, icon: string, color: 'teal' | 'purple' | 'gray', onclick: () => void, disabled: string | null = null)}
  <ListRow {title} {onclick}>
    {#snippet tile()}<Tile {color}><Icon name={icon} size={22} stroke={1.8} /></Tile>{/snippet}
    {#snippet meta()}{disabled ?? sub}{/snippet}
    {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
  </ListRow>
{/snippet}

{#snippet columnsEditor()}
  <p class="px-1 pt-1 pb-2 text-[12.5px] leading-[1.45] text-hint">
    {t('Die mit Haken markierte Spalte zählt als „erledigt“ – wichtig für Wiederholungen und Push.')}
  </p>
  <div class="divide-y divide-line overflow-hidden rounded-row border border-line bg-surface">
    {#each columns as col, i (col.id)}
      <div>
        <div class="flex h-[60px] items-center gap-2.5 pr-1.5 pl-3.5">
          <span class="flex min-w-0 flex-1 items-center gap-2">
            <input
              class="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-bold"
              value={col.name}
              maxlength="60"
              aria-label={t('Name der Spalte')}
              onchange={(e) => {
                const n = e.currentTarget.value.trim();
                if (n) void act(() => api.updateColumn(col.id, { name: n }));
              }}
            />
            {#if col.isDone}
              <span class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-ok-bg px-2.5 text-[12px] font-bold text-ok"><Icon name="check" size={12} stroke={3} />{t('Erledigt-Spalte')}</span>
            {:else if col.isPlanned}
              <span class="inline-flex h-6 shrink-0 items-center rounded-full bg-count px-2.5 text-[12px] font-bold text-text-soft2">{t('Geplant')}</span>
            {/if}
          </span>
          <span class="shrink-0 text-[13px] text-fg2">{cardsIn(col.id)}</span>
          <button class="flex h-10 w-9 shrink-0 items-center justify-center rounded-[10px] text-text-soft2 disabled:text-sep" aria-label={t('Nach oben')} disabled={i === 0} onclick={() => moveColumn(i, -1)}>
            <Icon name="chevron-up" size={18} stroke={2} />
          </button>
          <button class="flex h-10 w-9 shrink-0 items-center justify-center rounded-[10px] text-text-soft2 disabled:text-sep" aria-label={t('Nach unten')} disabled={i === columns.length - 1} onclick={() => moveColumn(i, 1)}>
            <Icon name="chevron-down" size={18} stroke={2} />
          </button>
          <button
            class="flex h-10 w-9 shrink-0 items-center justify-center rounded-[10px] text-text-soft2"
            aria-label={t('Mehr zur Spalte {name}', { name: col.name })}
            aria-expanded={moreFor === col.id}
            onclick={() => (moreFor = moreFor === col.id ? null : col.id)}
          >
            <Icon name="more" size={18} stroke={2.6} />
          </button>
        </div>
        {#if moreFor === col.id}
          <div class="flex flex-col gap-1 border-t border-line bg-bg px-3.5 py-2">
            <div class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
              <span>{t('Erledigt-Spalte')}</span>
              <Toggle checked={col.isDone} disabled={col.isPlanned} label={t('Spalte „{name}“ als erledigt', { name: col.name })} onchange={(on) => act(() => api.updateColumn(col.id, { isDone: on }))} />
            </div>
            <div class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
              <span>{t('Geplant')}</span>
              <Toggle checked={col.isPlanned} disabled={col.isDone} label={t('Spalte „{name}“ als geplant', { name: col.name })} onchange={(on) => act(() => api.updateColumn(col.id, { isPlanned: on }))} />
            </div>
            <p class="text-[12.5px] leading-[1.45] text-hint">{t('„Geplant“ nimmt nur Karten mit Termin nach heute auf. Am Tag der Fälligkeit rücken sie von selbst nach „Offen“, beim Wischen wird die Spalte übersprungen.')}</p>
            <button class="flex min-h-11 items-center gap-2 text-left text-[15px] font-semibold text-danger" aria-label={t('Spalte löschen')} onclick={() => askDelete(col.id)}>
              <Icon name="trash" size={16} />{t('Spalte löschen')}
            </button>
          </div>
        {/if}
        {#if deletingColumn === col.id}
          <div class="flex flex-wrap items-center gap-2 border-t border-line bg-bg px-3.5 py-3 text-[15px]">
            <span>{t('{n} Karten verschieben nach', { n: cardsIn(col.id) })}</span>
            <SelectField bind:value={moveTo} variant="box" class="!min-h-10 !bg-surface" label={t('Zielspalte')}>
              {#each columns.filter((c) => c.id !== col.id) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </SelectField>
            <button class="min-h-10 rounded-xl bg-danger-bg px-3 font-semibold text-danger" onclick={confirmDelete}>{t('Löschen')}</button>
            <button class="min-h-10 px-2 text-fg2" onclick={() => (deletingColumn = null)}>{t('Abbrechen')}</button>
          </div>
        {/if}
      </div>
    {/each}
    <form onsubmit={addColumn} class="flex h-[52px] items-center gap-2 px-3.5 text-accent-text">
      <Icon name="plus" size={20} stroke={2} />
      <input bind:value={newColumn} placeholder={t('Spalte hinzufügen')} maxlength="60" enterkeyhint="done" class="min-w-0 flex-1 bg-transparent py-3 text-[15px] font-semibold placeholder:text-accent-text" aria-label={t('Name der neuen Spalte')} />
      <SubmitPill show={!!newColumn.trim()} />
    </form>
  </div>
{/snippet}

{#snippet categoriesEditor()}
  <p class="px-1 pt-1 pb-2 text-[12.5px] leading-[1.45] text-hint">{t('Frei wählbar. Kategorien erscheinen als Filter über der Liste.')}</p>
  <div class="flex flex-wrap gap-2">
    {#each categories as cat (cat.id)}
      <Chip pressed={editCat === cat.id} outline={editCat === cat.id} label={t('Kategorie {name} bearbeiten', { name: cat.name })} onclick={() => { creatingCat = false; editCat = editCat === cat.id ? null : cat.id; }}>
        <span class="h-[9px] w-[9px] shrink-0 rounded-full" style:background={dot(cat.color)}></span>{cat.name}
      </Chip>
    {/each}
    <button
      type="button"
      class="inline-flex h-10 shrink-0 items-center gap-[7px] rounded-full border border-dashed border-line-chip bg-surface px-4 text-[15px] font-semibold whitespace-nowrap text-accent-text"
      aria-label={t('Neue Kategorie')}
      aria-expanded={creatingCat}
      onclick={() => { editCat = null; creatingCat = !creatingCat; }}
    >
      <Icon name="plus" size={18} stroke={2} />{t('Neu')}
    </button>
  </div>
  {#each categories.filter((c) => c.id === editCat) as cat (cat.id)}
    <div class="mt-2 flex flex-col gap-2.5 rounded-row border border-line bg-surface px-3.5 py-3">
      <div class="flex items-center gap-2">
        <input
          class="h-11 min-w-0 flex-1 rounded-xl border border-track bg-bg px-3 text-[15px] font-semibold"
          value={cat.name}
          maxlength="40"
          aria-label={t('Name der Kategorie')}
          onchange={(e) => {
            const n = e.currentTarget.value.trim();
            if (n) void act(() => api.updateCategory(cat.id, { name: n }));
          }}
        />
        <button class="flex h-11 w-11 items-center justify-center rounded-xl text-danger" aria-label={t('Kategorie löschen')} onclick={() => { editCat = null; void act(() => api.deleteCategory(cat.id)); }}>
          <Icon name="trash" size={18} />
        </button>
      </div>
      {@render colors(cat.color, (color) => void act(() => api.updateCategory(cat.id, { color })), t('Farbe der Kategorie'))}
    </div>
  {/each}
  {#if creatingCat}
    <form onsubmit={addCategory} class="mt-2 flex flex-col gap-2.5 rounded-row border border-line bg-surface px-3.5 py-3" aria-label={t('Neue Kategorie')}>
      <div class="flex items-center gap-2">
        <input bind:value={newCategory} placeholder={t('Neue Kategorie')} maxlength="40" enterkeyhint="done" class="h-11 min-w-0 flex-1 rounded-xl border border-track bg-bg px-3 text-[15px] font-semibold placeholder:text-dim" aria-label={t('Name der neuen Kategorie')} />
        <SubmitPill show={!!newCategory.trim()} />
      </div>
      {@render colors(newColor, (c) => (newColor = c), t('Farbe der neuen Kategorie'))}
    </form>
  {/if}
{/snippet}

{#snippet sidebarList()}
  <!-- Desktop: links die Boards (wie die Seitenleiste), rechts die Einstellungen des gewählten -->
  <nav class="flex flex-col gap-1" aria-label="Boards" data-testid="settings-boards">
    <p class="px-3 pb-1 text-[12px] font-bold tracking-[0.12em] text-fg2 uppercase">Boards</p>
    {#each ui.boards as b (b.id)}
      {@const current = b.id === ui.boardId}
      <button class="side-board h-10 gap-3 px-3.5 text-[14px] font-semibold" aria-current={current ? 'true' : undefined} onclick={() => void showBoard(b.id)}>
        <span class="min-w-0 flex-1 truncate text-left">{b.name}</span>
        <span class="shrink-0 text-[13px] font-medium text-fg2" aria-label={t('{n} offen', { n: b.openCards })}>{b.openCards}</span>
      </button>
    {/each}
    <button class="side-board h-10 gap-3 px-3.5 text-[14px] font-medium text-fg2" onclick={() => openSheet({ type: 'newBoard' })}><Icon name="plus" size={16} stroke={2} />{t('Neues Board')}</button>
    {#if ui.archivedBoards.length > 0}
      <button class="side-board mt-2 h-10 gap-3 px-3.5 text-[14px] font-medium text-fg2" onclick={() => openSheet({ type: 'archivedBoards' })}>
        <Icon name="archive" size={16} stroke={2} />{t('Archivierte Boards')} ({ui.archivedBoards.length})
      </button>
    {/if}
    {#if ui.boards.length > 1}
      <button class="side-board h-10 gap-3 px-3.5 text-[14px] font-medium text-fg2" onclick={() => openSheet({ type: 'boardOrder' })}><Icon name="arrow-up" size={16} stroke={2} />{t('Reihenfolge ändern')}</button>
    {/if}
  </nav>
{/snippet}

<Sheet title={t('Board-Einstellungen')} onclose={closeSheet} wide={ui.desktop}>
  {#snippet left()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={() => openSheet({ type: 'boards' })}>{t('Zurück')}</button>
  {/snippet}
  {#snippet right()}
    <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text" onclick={closeSheet}>{t('Fertig')}</button>
  {/snippet}
  {#if view}
    <div class="pt-1 {ui.desktop ? 'grid grid-cols-[240px_minmax(0,1fr)] gap-6' : ''}">
      {#if ui.desktop}<aside class="pt-1">{@render sidebarList()}</aside>{/if}
      <div class="flex min-w-0 flex-col gap-3.5">
        {#if !ui.desktop}{@render boardPicker()}{/if}
        {#if ui.desktop}<h2 class="px-1 text-[22px] font-extrabold tracking-tight">{view.board.name}</h2>{/if}

        <div class="flex flex-col gap-2">
          <SectionHeader title={t('Name, Symbol, Farbe')} />
          <Field
            id="board-title"
            label={t('Name')}
            bind:value={boardName}
            maxlength={80}
            aria-label={t('Name des Boards')}
            onchange={() => {
              const n = boardName.trim();
              if (n && n !== view.board.name) void act(() => api.updateBoard(view.board.id, { name: n }));
            }}
          />
          {@render look()}
        </div>

        {#if mayChangeAccess && board}
          <BoardVisibilityPicker
            {visibility}
            memberIds={board.memberIds}
            counts={board.countsForFairness}
            ownerId={board.ownerId ?? ui.me?.id ?? null}
            onvisibility={(v) => void changeAccess({ visibility: v })}
            onmembers={(ids) => void changeAccess({ memberIds: ids })}
            oncounts={(on) => void act(() => api.updateBoard(board.id, { countsForFairness: on }))}
          />
        {:else if board}
          <p class="px-1 text-[13px] text-fg2" data-testid="board-who">{t('Sichtbar für: {who}', { who: boardWho(board, ui.people) })}</p>
        {/if}

        <div class="flex flex-col gap-2">
          <ListRow title={t('Spalten')} expanded={openColumns} onclick={() => (openColumns = !openColumns)}>
            {#snippet tile()}<Tile color="teal"><Icon name="columns" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{tn('{n} Spalte', '{n} Spalten', columns.length)}{/snippet}
            {#snippet right()}<span class="flex text-text-soft2"><Icon name={openColumns ? 'chevron-down' : 'chevron-right'} size={18} stroke={2} /></span>{/snippet}
          </ListRow>
          {#if openColumns}<div data-testid="columns-editor">{@render columnsEditor()}</div>{/if}

          <ListRow title={t('Kategorien')} expanded={openCategories} onclick={() => (openCategories = !openCategories)}>
            {#snippet tile()}<Tile color="orange"><Icon name="tag" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{tn('{n} Kategorie', '{n} Kategorien', categories.length)}{/snippet}
            {#snippet right()}<span class="flex text-text-soft2"><Icon name={openCategories ? 'chevron-down' : 'chevron-right'} size={18} stroke={2} /></span>{/snippet}
          </ListRow>
          {#if openCategories}<div data-testid="categories-editor">{@render categoriesEditor()}</div>{/if}

          <ListRow title={t('Erledigte archivieren')}>
            {#snippet tile()}<Tile color="blue"><Icon name="archive" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{t('hält die Erledigt-Spalte kurz')}{/snippet}
            {#snippet right()}
              <span class="flex items-center gap-1.5 text-[14px] text-fg2" title={t('Erledigte Karten wandern nach dieser Zeit ins Archiv. 0 bedeutet nie.')}>
                {t('nach')}
                <input
                  type="number"
                  min="0"
                  max="3650"
                  inputmode="numeric"
                  class="h-9 w-9 [appearance:textfield] rounded-xl border border-line bg-bg text-center text-[15px] font-semibold text-fg [&::-webkit-inner-spin-button]:appearance-none"
                  value={view.board.archiveAfterDays}
                  aria-label={t('Tage bis zum Archivieren')}
                  onchange={(e) => act(() => api.updateBoard(view.board.id, { archiveAfterDays: Number(e.currentTarget.value) }))}
                />
                {t('Tagen')}
              </span>
            {/snippet}
          </ListRow>

          <ListRow title={t('Archiv')} onclick={() => openSheet({ type: 'archive' })}>
            {#snippet tile()}<Tile color="gray"><Icon name="archive" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{archivedCount === null ? '' : tn('{n} erledigte Karte', '{n} erledigte Karten', archivedCount)}{/snippet}
            {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
          </ListRow>
          <ListRow title={t('Papierkorb')} onclick={() => openSheet({ type: 'trash' })}>
            {#snippet tile()}<Tile color="gray"><Icon name="trash" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{trashCount === null ? '' : `${tn('{n} Karte', '{n} Karten', trashCount)} • ${t('30 Tage wiederherstellbar')}`}{/snippet}
            {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
          </ListRow>
        </div>

        <div class="flex flex-col gap-2" data-testid="board-manage">
          <SectionHeader title={t('Board verwalten')} />
          {@render manageRow(t('Board duplizieren'), t('Kopie mit Spalten, Kategorien, optional Aufgaben'), 'copy', 'teal', () => (dialog = 'duplicate'))}
          {@render manageRow(t('Als Vorlage speichern'), t('für neue Boards'), 'file', 'purple', () => (dialog = 'template'))}
          {@render manageRow(t('Board archivieren'), t('ausblenden, nichts geht verloren'), 'archive', 'gray', () => (dialog = 'archive'), lockedArchive)}
          <!-- abgesetzt: Löschen steht ganz unten, mit Abstand zu allem anderen -->
          <div class="mt-3 flex flex-col gap-1.5">
            <button
              class="flex h-[52px] w-full items-center justify-center gap-2 rounded-row border border-danger/35 bg-danger/10 text-[15px] font-bold text-danger disabled:opacity-40"
              disabled={!preview || !!lockedDelete}
              data-testid="board-delete"
              onclick={() => (dialog = 'delete')}
            >
              <Icon name="trash" size={18} />{t('Board löschen')}
            </button>
            {#if lockedDelete}<p class="px-1 text-[13px] leading-[1.45] text-fg2" data-testid="board-delete-lock">{lockedDelete}</p>{/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</Sheet>

{#if pending && board}
  <BoardAccessDialog
    kind={pending.kind}
    boardName={board.name}
    title={pending.title}
    preview={pending.preview}
    confirmLabel={pending.change.visibility === 'private' ? t('Auf „Nur ich“ stellen') : t('Entfernen')}
    onconfirm={() => void confirmAccess()}
    onclose={() => (pending = null)}
    onopenwatcher={openWatcher}
  />
{/if}

{#if symbolOpen && board}
  <SymbolSheet
    title={board.name}
    icon={board.icon}
    color={tileColorOf(colorKey)}
    source={null}
    onpick={(v) => {
      symbolOpen = false;
      pickLook({ icon: v.icon, color: v.color ? boardColorOfTile(v.color) : null });
    }}
    onclose={() => (symbolOpen = false)}
  />
{/if}

{#if dialog && board && preview}
  {#if dialog === 'delete'}
    <BoardDeleteDialog {board} {preview} ondone={afterRemoved} onclose={() => (dialog = null)} />
  {:else if dialog === 'archive'}
    <BoardArchiveDialog {board} {preview} ondone={afterRemoved} onclose={() => (dialog = null)} />
  {/if}
{/if}
{#if dialog === 'duplicate' && board}
  <BoardDuplicateDialog {board} onclose={() => (dialog = null)} />
{:else if dialog === 'template' && board}
  <BoardTemplateDialog {board} onclose={() => (dialog = null)} />
{/if}
