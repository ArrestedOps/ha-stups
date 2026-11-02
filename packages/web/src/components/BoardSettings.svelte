<script lang="ts">
  import { api } from '../lib/api';
  import { CATEGORY_COLORS, catClass } from '../lib/colors';
  import { act, closeSheet, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Row from './Row.svelte';
  import SelectField from './SelectField.svelte';
  import Sheet from './Sheet.svelte';
  import SubmitPill from './SubmitPill.svelte';

  const view = $derived(ui.view);
  const columns = $derived(view?.columns ?? []);
  const categories = $derived(view?.categories ?? []);

  let newColumn = $state('');
  let newCategory = $state('');
  let newColor = $state<string>('blue');
  let deletingColumn = $state<string | null>(null);
  let moveTo = $state('');
  let colorFor = $state<string | null>(null);
  let confirmBoard = $state(false);

  const cardsIn = (columnId: string) => (view?.cards ?? []).filter((c) => c.columnId === columnId).length;

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

  async function deleteBoard() {
    if (!ui.boardId) return;
    await act(() => api.deleteBoard(ui.boardId!));
    closeSheet();
  }
</script>

<Sheet title="Board-Einstellungen" onclose={closeSheet}>
  {#if view}
    <Group>
      <Row label="Name">
        <input
          class="min-h-10 w-48 bg-transparent text-right text-fg2"
          value={view.board.name}
          maxlength="80"
          aria-label="Name des Boards"
          onchange={(e) => {
            const n = e.currentTarget.value.trim();
            if (n) void act(() => api.updateBoard(view.board.id, { name: n }));
          }}
        />
      </Row>
      <Row label="Archivieren nach">
        <span class="flex items-center gap-2 text-fg2">
          <input
            type="number"
            min="0"
            max="3650"
            inputmode="numeric"
            class="min-h-10 w-16 rounded-xl bg-surface2 text-center"
            value={view.board.archiveAfterDays}
            aria-label="Tage bis zum Archivieren"
            onchange={(e) => act(() => api.updateBoard(view.board.id, { archiveAfterDays: Number(e.currentTarget.value) }))}
          />
          Tagen
        </span>
      </Row>
    </Group>
    <p class="mt-1.5 px-3 text-[13px] text-fg2">Erledigte Karten wandern nach dieser Zeit ins Archiv. 0 bedeutet nie.</p>

    <Group
      title="Spalten"
      hint="„Erledigt“: die Spalte für fertige Karten. „Geplant“: nimmt nur Karten mit Termin nach heute auf, damit „Offen“ übersichtlich bleibt. Am Tag der Fälligkeit rücken sie von selbst nach „Offen“. Beim Wischen wird „Geplant“ übersprungen."
    >
      {#each columns as col, i (col.id)}
        <div class="flex min-h-[52px] items-center gap-1 px-2">
          <div class="flex flex-col">
            <button class="flex h-5 w-9 items-center justify-center text-fg2 disabled:opacity-25" aria-label="Nach oben" disabled={i === 0} onclick={() => moveColumn(i, -1)}>
              <Icon name="arrow-up" size={14} />
            </button>
            <button class="flex h-5 w-9 items-center justify-center text-fg2 disabled:opacity-25" aria-label="Nach unten" disabled={i === columns.length - 1} onclick={() => moveColumn(i, 1)}>
              <Icon name="arrow-down" size={14} />
            </button>
          </div>
          <input
            class="min-w-0 flex-1 bg-transparent py-2"
            value={col.name}
            maxlength="60"
            aria-label="Name der Spalte"
            onchange={(e) => {
              const n = e.currentTarget.value.trim();
              if (n) void act(() => api.updateColumn(col.id, { name: n }));
            }}
          />
          <button
            class="min-h-9 rounded-lg px-2.5 text-[13px] {col.isPlanned ? 'cat cat-purple' : 'bg-surface2 text-fg2'} disabled:opacity-30"
            aria-pressed={col.isPlanned}
            disabled={col.isDone}
            onclick={() => act(() => api.updateColumn(col.id, { isPlanned: !col.isPlanned }))}
          >
            {col.isPlanned ? '✓ Geplant' : 'Geplant?'}
          </button>
          <button
            class="min-h-9 rounded-lg px-2.5 text-[13px] {col.isDone ? 'cat cat-green' : 'bg-surface2 text-fg2'} disabled:opacity-30"
            aria-pressed={col.isDone}
            disabled={col.isPlanned}
            onclick={() => act(() => api.updateColumn(col.id, { isDone: !col.isDone }))}
          >
            {col.isDone ? '✓ Erledigt' : 'Erledigt?'}
          </button>
          <button class="flex h-10 w-10 items-center justify-center text-danger" aria-label="Spalte löschen" onclick={() => askDelete(col.id)}>
            <Icon name="trash" size={16} />
          </button>
        </div>
        {#if deletingColumn === col.id}
          <div class="flex flex-wrap items-center gap-2 bg-surface2 px-4 py-3 text-[15px]">
            <span>{cardsIn(col.id)} Karten verschieben nach</span>
            <SelectField bind:value={moveTo} variant="box" class="!min-h-10 !bg-surface" label="Zielspalte">
              {#each columns.filter((c) => c.id !== col.id) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </SelectField>
            <button class="min-h-10 rounded-xl bg-danger-bg px-3 font-semibold text-danger" onclick={confirmDelete}>Löschen</button>
            <button class="min-h-10 px-2 text-fg2" onclick={() => (deletingColumn = null)}>Abbrechen</button>
          </div>
        {/if}
      {/each}
      <form onsubmit={addColumn} class="flex min-h-[52px] items-center gap-3 px-4">
        <Icon name="plus" size={18} />
        <input bind:value={newColumn} placeholder="Neue Spalte" maxlength="60" enterkeyhint="done" class="min-w-0 flex-1 bg-transparent py-3" aria-label="Name der neuen Spalte" />
        <SubmitPill show={!!newColumn.trim()} />
      </form>
    </Group>

    <Group title="Kategorien" hint="Frei wählbar, zum Beispiel Putzen, Garten oder Date. Kategorien erscheinen als Filter über der Liste.">
      {#each categories as cat (cat.id)}
        <div class="px-4 py-2">
          <div class="flex min-h-10 items-center gap-3">
            <button
              class="{catClass(cat.color)} !px-3 !py-1.5"
              aria-label="Farbe ändern"
              onclick={() => (colorFor = colorFor === cat.id ? null : cat.id)}
            >
              Farbe
            </button>
            <input
              class="min-w-0 flex-1 bg-transparent py-2"
              value={cat.name}
              maxlength="40"
              aria-label="Name der Kategorie"
              onchange={(e) => {
                const n = e.currentTarget.value.trim();
                if (n) void act(() => api.updateCategory(cat.id, { name: n }));
              }}
            />
            <button class="flex h-10 w-10 items-center justify-center text-danger" aria-label="Kategorie löschen" onclick={() => act(() => api.deleteCategory(cat.id))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
          {#if colorFor === cat.id}
            <div class="flex flex-wrap gap-2 pt-2 pb-1">
              {#each CATEGORY_COLORS as color (color)}
                <button
                  class="{catClass(color)} h-9 w-9 !p-0 {cat.color === color ? 'ring-2 ring-accent' : ''}"
                  aria-label={color}
                  onclick={() => act(() => api.updateCategory(cat.id, { color }))}
                >
                  ●
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      <form onsubmit={addCategory} class="flex min-h-[52px] items-center gap-3 px-4">
        <span class="{catClass(newColor)} !px-2.5">●</span>
        <input bind:value={newCategory} placeholder="Neue Kategorie" maxlength="40" enterkeyhint="done" class="min-w-0 flex-1 bg-transparent py-3" aria-label="Name der neuen Kategorie" />
        <SubmitPill show={!!newCategory.trim()} />
      </form>
    </Group>

    <div class="mt-6">
      {#if confirmBoard}
        <p class="mb-2 px-3 text-[15px] text-fg2">Das Board landet 30 Tage im Papierkorb und lässt sich dort wiederherstellen.</p>
        <div class="flex gap-2">
          <button class="min-h-12 flex-1 rounded-2xl bg-danger-bg font-semibold text-danger" onclick={deleteBoard}>Board löschen</button>
          <button class="min-h-12 flex-1 rounded-2xl bg-surface2" onclick={() => (confirmBoard = false)}>Abbrechen</button>
        </div>
      {:else}
        <button class="min-h-12 w-full text-[16px] text-danger" onclick={() => (confirmBoard = true)}>Board löschen</button>
      {/if}
    </div>
  {/if}
</Sheet>
