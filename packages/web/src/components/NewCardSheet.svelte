<script lang="ts">
  import { api, ApiError, type CardPatch } from '../lib/api';
  import { autogrow } from '../lib/autogrow';
  import { fromInputValue, isFuture } from '../lib/datetime';
  import { formatBytes, prepareUpload, uploadProblem } from '../lib/image';
  import { columnForDue } from '../lib/swipe';
  import { act, closeSheet, openSheet, toast, ui } from '../lib/store.svelte';
  import CardProps, { type CardFields } from './CardProps.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  /** dueAt: vorbelegter Termin, z. B. aus dem Kalender */
  let { columnId, dueAt = null }: { columnId: string; dueAt?: string | null } = $props();

  const columns = $derived(ui.view?.columns ?? []);
  // „Geplant" sortiert sich nach dem Termin von selbst, darum steht es nur zur Wahl, wenn man dort anlegt
  const choices = $derived(columns.filter((c) => !c.isPlanned || c.id === columnId));

  // Wer in „Geplant" anlegt, braucht einen Termin nach heute: Morgen 09:00 ist vorbelegt
  const tomorrowNine = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return fromInputValue(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`);
  };

  // Alles, was eine Karte haben kann, lässt sich schon beim Anlegen ausfüllen
  const startsPlanned = ui.view?.columns.find((c) => c.id === columnId)?.isPlanned ?? false;
  let fields = $state<CardFields>({
    // svelte-ignore state_referenced_locally
    columnId,
    // Erinnerungen gehen nur an Zuständige: Wer die Karte anlegt, ist zuerst selbst zuständig und kann das ändern
    assigneeIds: ui.me?.isPerson ? [ui.me.id] : [],
    // svelte-ignore state_referenced_locally
    dueAt: dueAt ?? (startsPlanned ? tomorrowNine() : null),
    recurrence: null,
    remindBeforeMin: null,
    overdueNag: false,
    priority: null,
    categoryIds: [],
    costCents: null,
  });
  let title = $state('');
  let description = $state('');
  let items = $state<string[]>([]);
  let urls = $state<string[]>([]);
  let files = $state<File[]>([]);
  let newItem = $state('');
  let newLink = $state('');
  let busy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  async function onsave(patch: CardPatch) {
    Object.assign(fields, patch);
    // „Geplant" gilt nur mit einem Termin nach heute: Wer den Termin auf heute stellt oder entfernt, landet in „Offen"
    if (patch.dueAt !== undefined) {
      const wanted = columnForDue(columns, fields.columnId, isFuture(fields.dueAt));
      if (wanted !== fields.columnId) {
        fields.columnId = wanted;
        toast(`Termin heute oder keiner: Die Karte kommt nach „${columns.find((c) => c.id === wanted)?.name ?? 'Offen'}".`);
      }
    }
    return { dueAt: fields.dueAt };
  }

  function pickColumn(id: string) {
    const fitting = columnForDue(columns, id, isFuture(fields.dueAt));
    fields.columnId = fitting;
    if (fitting !== id) toast('„Geplant" nimmt nur Karten mit einem Termin nach heute. Stell zuerst den Termin ein.');
  }

  function addItem(e: Event) {
    e.preventDefault();
    const t = newItem.trim();
    if (!t) return;
    items.push(t);
    newItem = '';
  }

  function addLink(e: Event) {
    e.preventDefault();
    const u = newLink.trim();
    if (!u) return;
    urls.push(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`);
    newLink = '';
  }

  function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    for (const f of input.files ?? []) {
      const problem = uploadProblem(f);
      if (problem) toast(`${f.name}: ${problem}`, { tone: 'error' });
      else files.push(f);
    }
    input.value = '';
  }

  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  function focus(node: HTMLElement) {
    node.focus();
  }

  async function create(e?: Event) {
    e?.preventDefault();
    if (!title.trim() || busy || !ui.boardId) return;
    // Das gerade getippte, aber noch nicht bestätigte Eintrag/Link nicht verlieren
    if (newItem.trim()) addItem(new Event('submit'));
    if (newLink.trim()) addLink(new Event('submit'));

    // Zur Sicherheit noch einmal, falls Spalte oder Termin anders gesetzt wurden: kein Fehler, sondern „Offen"
    fields.columnId = columnForDue(columns, fields.columnId, isFuture(fields.dueAt));
    busy = true;
    const card = await act(() =>
      api.createCard(ui.boardId!, {
        ...fields,
        title: title.trim(),
        description: description.trim() || null,
      }),
    );
    if (!card) {
      busy = false;
      return;
    }

    // Checkliste, Links und Anhänge gehören zur fertigen Karte; was schiefgeht, wird gemeldet, die Karte bleibt
    const problems: string[] = [];
    for (const text of items) {
      try {
        await api.addChecklist(card.id, text);
      } catch {
        problems.push(`Eintrag „${text}"`);
      }
    }
    for (const url of urls) {
      try {
        await api.addLink(card.id, url);
      } catch {
        problems.push(`Link ${host(url)}`);
      }
    }
    for (const f of files) {
      try {
        const p = await prepareUpload(f);
        await api.uploadAttachment(card.id, p.file, p.filename, p.thumb);
      } catch (err) {
        problems.push(err instanceof ApiError || err instanceof Error ? `${f.name}: ${err.message}` : f.name);
      }
    }

    busy = false;
    closeSheet();
    if (problems.length) toast(`Karte angelegt, aber nicht gespeichert: ${problems.join(', ')}`, { tone: 'error' });
    else toast('Karte angelegt', { action: { label: 'Öffnen', run: () => openSheet({ type: 'card', id: card.id }) } });
  }
</script>

{#snippet createButton()}
  <button
    class="min-h-11 px-3 text-[17px] font-semibold text-accent-text disabled:opacity-40"
    disabled={!title.trim() || busy}
    onclick={() => create()}
  >
    {busy ? 'Lege an …' : 'Anlegen'}
  </button>
{/snippet}

<Sheet title="Neue Karte" onclose={closeSheet} right={createButton}>
  <form onsubmit={create} class="pt-1 pb-2">
    <textarea
      use:focus
      use:autogrow={title}
      rows="1"
      bind:value={title}
      placeholder="Titel, z. B. Bad putzen"
      maxlength="200"
      enterkeyhint="done"
      class="mt-1 block w-full resize-none overflow-hidden bg-transparent text-[26px] leading-tight font-bold tracking-tight"
      aria-label="Titel"
      onkeydown={(e) => {
        // Eingabetaste legt an, statt einen Zeilenumbruch in den Titel zu schreiben
        if (e.key === 'Enter') {
          e.preventDefault();
          void create();
        }
      }}
    ></textarea>

    <CardProps card={fields} targets={choices} {onsave} onmove={pickColumn} />

    <Group title="Beschreibung">
      <textarea
        rows="3"
        placeholder="Notizen …"
        use:autogrow={description}
        class="block min-h-[84px] w-full resize-none overflow-hidden bg-transparent px-4 py-3 text-[17px] leading-snug"
        aria-label="Beschreibung"
        bind:value={description}
      ></textarea>
    </Group>

    <Group title="Checkliste {items.length ? `· ${items.length}` : ''}">
      {#each items as item, i (i)}
        <div class="flex min-h-[46px] items-center gap-3 px-4">
          <Icon name="check" size={16} />
          <span class="min-w-0 flex-1 py-2">{item}</span>
          <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label="Eintrag entfernen" onclick={() => items.splice(i, 1)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <div class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="plus" size={18} />
        <input
          bind:value={newItem}
          placeholder="Eintrag hinzufügen"
          enterkeyhint="done"
          class="min-w-0 flex-1 bg-transparent py-2"
          aria-label="Neuer Eintrag"
          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(e))}
        />
        <button type="button" class="min-h-9 shrink-0 rounded-xl bg-accent px-3.5 text-[15px] font-bold text-on-accent {newItem.trim() ? '' : 'hidden'}" onclick={addItem}>Hinzufügen</button>
      </div>
    </Group>

    <Group title="Links" hint="Websites oder Maps-Links, zum Beispiel für Date-Ideen. Der Seitentitel wird automatisch geholt.">
      {#each urls as url, i (i)}
        <div class="flex min-h-12 items-center gap-3 px-4">
          <Icon name="link" size={16} />
          <span class="min-w-0 flex-1 truncate py-2">{host(url)}</span>
          <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label="Link entfernen" onclick={() => urls.splice(i, 1)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <div class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="link" size={18} />
        <input
          bind:value={newLink}
          type="url"
          placeholder="Website oder Maps-Link einfügen"
          enterkeyhint="done"
          class="min-w-0 flex-1 bg-transparent py-2"
          aria-label="Neuer Link"
          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink(e))}
        />
        <button type="button" class="min-h-9 shrink-0 rounded-xl bg-accent px-3.5 text-[15px] font-bold text-on-accent {newLink.trim() ? '' : 'hidden'}" onclick={addLink}>Hinzufügen</button>
      </div>
    </Group>

    <Group title="Anhänge">
      {#each files as f, i (i)}
        <div class="flex min-h-12 items-center gap-3 px-4">
          <Icon name="paperclip" size={16} />
          <span class="min-w-0 flex-1 truncate py-2">{f.name}</span>
          <span class="shrink-0 text-[13px] text-fg2">{formatBytes(f.size)}</span>
          <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label="Anhang entfernen" onclick={() => files.splice(i, 1)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <div class="px-4 py-1.5">
        <input bind:this={fileInput} type="file" accept="image/*,application/pdf" multiple class="hidden" onchange={onFiles} />
        <button type="button" class="flex min-h-11 w-full items-center gap-3 text-left text-[17px] text-accent-text" onclick={() => fileInput?.click()}>
          <Icon name="camera" size={18} />Foto oder PDF hinzufügen
        </button>
      </div>
    </Group>

    <p class="mt-3 px-3 text-[13px] text-fg2">
      Benachrichtigungen bekommen nur zugewiesene Personen, und nur wenn eine Fälligkeit gesetzt ist.
    </p>
  </form>
</Sheet>
