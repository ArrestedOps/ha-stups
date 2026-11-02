<script lang="ts">
  import { untrack } from 'svelte';
  import { api, ApiError, type CardPatch } from '../lib/api';
  import { autogrow } from '../lib/autogrow';
  import { nextColor } from '../lib/colors';
  import { deviceTz, fromInputValue, isFuture } from '../lib/datetime';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { formatBytes, prepareUpload, uploadProblem } from '../lib/image';
  import { parseQuickAdd } from '../lib/quickadd';
  import { blockingProblem } from '../lib/quickadd/labels';
  import { columnForNew } from '../lib/calendar';
  import { columnForDue } from '../lib/swipe';
  import { act, closeSheet, openSheet, toast, ui } from '../lib/store.svelte';
  import CardProps, { type CardFields } from './CardProps.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import QuickChips from './QuickChips.svelte';
  import QuickText from './QuickText.svelte';
  import Sheet from './Sheet.svelte';

  /** dueAt: vorbelegter Termin, z. B. aus dem Kalender */
  let { columnId, dueAt = null }: { columnId: string; dueAt?: string | null } = $props();

  const columns = $derived(ui.view?.columns ?? []);
  // „Geplant" sortiert sich nach dem Termin von selbst, darum steht es nur zur Wahl, wenn man dort anlegt
  const choices = $derived(columns.filter((c) => !c.isPlanned || c.id === fields.columnId));
  // Ohne eigene Wahl richtet sich die Spalte nach dem Termin: nach heute → „Geplant", sonst „Offen"
  let columnPicked = false;
  const followDue = () => {
    if (columnPicked) return;
    const target = columnForNew(columns, isFuture(fields.dueAt));
    if (target) fields.columnId = target;
  };

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

  // ---------- Schnell-Eingabe: aus einer Zeile Text werden Titel, Termin, Zuständige, Kategorie, Wiederholung, Priorität ----------
  const tz = deviceTz();
  // Zurückgenommene Teile (Kennungen) und Felder, die von Hand geändert wurden: Dort gewinnt die Handeingabe
  let ignored = $state<string[]>([]);
  let manual = $state<string[]>([]);
  const parsed = $derived(
    parseQuickAdd(title, {
      now: Date.now(),
      tz,
      lang: i18n.lang,
      defaultTime: ui.settings?.defaultDueTime ?? '09:00',
      people: ui.people.filter((p) => p.isPerson),
      categories: ui.view?.categories ?? [],
      ignore: new Set(ignored),
    }),
  );
  const quickProblem = $derived(blockingProblem(parsed));
  // Vorgaben, auf die ein Feld zurückfällt, wenn der erkannte Teil wegfällt
  const defaults = { dueAt: fields.dueAt, assigneeIds: [...fields.assigneeIds] };
  $effect(() => {
    const r = parsed;
    untrack(() => {
      if (!manual.includes('dueAt')) fields.dueAt = r.dueAt ?? defaults.dueAt;
      if (!manual.includes('recurrence')) fields.recurrence = r.recurrence;
      if (!manual.includes('priority')) fields.priority = r.priority;
      if (!manual.includes('assigneeIds')) {
        const ids = r.assignees.flatMap((a) => (a.personId ? [a.personId] : []));
        fields.assigneeIds = ids.length ? ids : [...defaults.assigneeIds];
      }
      if (!manual.includes('categoryIds')) fields.categoryIds = r.categories.flatMap((c) => (c.categoryId ? [c.categoryId] : []));
      followDue();
    });
  });
  const dropToken = (id: string) => {
    if (!ignored.includes(id)) ignored = [...ignored, id];
  };

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
    // Was von Hand geändert wurde, überschreibt die Schnell-Eingabe nicht mehr
    for (const key of ['dueAt', 'recurrence', 'priority', 'assigneeIds', 'categoryIds']) {
      if (key in patch && !manual.includes(key)) manual = [...manual, key];
    }
    // „Geplant" gilt nur mit einem Termin nach heute: Wer den Termin auf heute stellt oder entfernt, landet in „Offen"
    if (patch.dueAt !== undefined) followDue();
    if (patch.dueAt !== undefined && columnPicked) {
      const wanted = columnForDue(columns, fields.columnId, isFuture(fields.dueAt));
      if (wanted !== fields.columnId) {
        fields.columnId = wanted;
        toast(t('Termin heute oder keiner: Die Karte kommt nach „{column}".', { column: columns.find((c) => c.id === wanted)?.name ?? t('Offen') }));
      }
    }
    return { dueAt: fields.dueAt };
  }

  function pickColumn(id: string) {
    columnPicked = true;
    const fitting = columnForDue(columns, id, isFuture(fields.dueAt));
    fields.columnId = fitting;
    if (fitting !== id) toast(t('„Geplant" nimmt nur Karten mit einem Termin nach heute. Stell zuerst den Termin ein.'));
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

  /** Neue Kategorien aus der Schnell-Eingabe: erst fragen, dann anlegen und der Karte geben */
  async function createCategories(): Promise<string[] | null> {
    const wanted = parsed.categories.filter((c) => c.categoryId === null && c.status === 'new');
    const ids: string[] = [];
    const used = (ui.view?.categories ?? []).map((c) => c.color);
    for (const c of wanted) {
      try {
        const made = await api.addCategory(ui.boardId!, c.name, nextColor(used));
        used.push(made.color);
        ids.push(made.id);
      } catch (err) {
        toast(err instanceof ApiError ? err.message : t('Kategorie „{name}“ konnte nicht angelegt werden', { name: c.name }), { tone: 'error' });
        return null;
      }
    }
    return ids;
  }

  async function create(e?: Event, confirmedCategories = false) {
    e?.preventDefault();
    if (!parsed.title || busy || !ui.boardId || quickProblem) return;
    const fresh = parsed.categories.filter((c) => c.categoryId === null && c.status === 'new');
    if (fresh.length > 0 && !confirmedCategories) {
      const names = fresh.map((c) => `„${c.name}“`).join(', ');
      ui.confirm = {
        title: fresh.length === 1 ? t('Kategorie anlegen?') : t('Kategorien anlegen?'),
        text: t('{names} gibt es in diesem Board noch nicht. Neu anlegen und der Karte geben? Zum Weglassen schließ diese Frage und tippe auf den Chip.', { names }),
        label: t('Anlegen'),
        run: () => create(undefined, true),
      };
      return;
    }
    // Das gerade getippte, aber noch nicht bestätigte Eintrag/Link nicht verlieren
    if (newItem.trim()) addItem(new Event('submit'));
    if (newLink.trim()) addLink(new Event('submit'));

    // Zur Sicherheit noch einmal, falls Spalte oder Termin anders gesetzt wurden: kein Fehler, sondern „Offen"
    followDue();
    fields.columnId = columnForDue(columns, fields.columnId, isFuture(fields.dueAt));
    busy = true;
    const newCategoryIds = confirmedCategories ? await createCategories() : [];
    if (newCategoryIds === null) {
      busy = false;
      return;
    }
    const card = await act(() =>
      api.createCard(ui.boardId!, {
        ...fields,
        categoryIds: [...fields.categoryIds, ...newCategoryIds],
        title: parsed.title,
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
    if (problems.length) toast(t('Karte angelegt, aber nicht gespeichert: {problems}', { problems: problems.join(', ') }), { tone: 'error' });
    else toast(t('Karte angelegt'), { action: { label: t('Öffnen'), run: () => openSheet({ type: 'card', id: card.id }) } });
  }
</script>

{#snippet createButton()}
  <button
    class="min-h-11 px-3 text-[17px] font-semibold text-accent-text disabled:opacity-40"
    disabled={!parsed.title || busy || !!quickProblem}
    onclick={() => create()}
  >
    {busy ? t('Lege an …') : t('Anlegen')}
  </button>
{/snippet}

<Sheet title={t('Neue Karte')} onclose={closeSheet} right={createButton}>
  <form onsubmit={create} class="pt-1 pb-2">
    <QuickText bind:value={title} tokens={parsed.tokens} placeholder={t('z. B. Müll raus morgen 19 Uhr @Ben')} onenter={() => void create()} />
    <QuickChips result={parsed} {tz} ondrop={dropToken} />
    {#if quickProblem}<p class="mt-2 rounded-xl bg-danger-bg px-3 py-2 text-[14px] text-danger" role="alert">{quickProblem}</p>{/if}

    <CardProps card={fields} targets={choices} {onsave} onmove={pickColumn} />

    <Group title={t('Beschreibung')}>
      <textarea
        rows="3"
        placeholder="Notizen …"
        use:autogrow={description}
        class="block min-h-[84px] w-full resize-none overflow-hidden bg-transparent px-4 py-3 text-[17px] leading-snug"
        aria-label={t('Beschreibung')}
        bind:value={description}
      ></textarea>
    </Group>

    <Group title={`${t('Checkliste')} ${items.length ? `· ${items.length}` : ''}`}>
      {#each items as item, i (i)}
        <div class="flex min-h-[46px] items-center gap-3 px-4">
          <Icon name="check" size={16} />
          <span class="min-w-0 flex-1 py-2">{item}</span>
          <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Eintrag entfernen')} onclick={() => items.splice(i, 1)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <div class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="plus" size={18} />
        <input
          bind:value={newItem}
          placeholder={t('Eintrag hinzufügen')}
          enterkeyhint="done"
          class="min-w-0 flex-1 bg-transparent py-2"
          aria-label={t('Neuer Eintrag')}
          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(e))}
        />
        <button type="button" class="min-h-9 shrink-0 rounded-xl bg-accent px-3.5 text-[15px] font-bold text-on-accent {newItem.trim() ? '' : 'hidden'}" onclick={addItem}>{t('Hinzufügen')}</button>
      </div>
    </Group>

    <Group title="Links" hint={t('Websites oder Maps-Links, zum Beispiel für Date-Ideen. Der Seitentitel wird automatisch geholt.')}>
      {#each urls as url, i (i)}
        <div class="flex min-h-12 items-center gap-3 px-4">
          <Icon name="link" size={16} />
          <span class="min-w-0 flex-1 truncate py-2">{host(url)}</span>
          <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Link entfernen')} onclick={() => urls.splice(i, 1)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <div class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="link" size={18} />
        <input
          bind:value={newLink}
          type="url"
          placeholder={t('Website oder Maps-Link einfügen')}
          enterkeyhint="done"
          class="min-w-0 flex-1 bg-transparent py-2"
          aria-label={t('Neuer Link')}
          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink(e))}
        />
        <button type="button" class="min-h-9 shrink-0 rounded-xl bg-accent px-3.5 text-[15px] font-bold text-on-accent {newLink.trim() ? '' : 'hidden'}" onclick={addLink}>{t('Hinzufügen')}</button>
      </div>
    </Group>

    <Group title={t('Anhänge')}>
      {#each files as f, i (i)}
        <div class="flex min-h-12 items-center gap-3 px-4">
          <Icon name="paperclip" size={16} />
          <span class="min-w-0 flex-1 truncate py-2">{f.name}</span>
          <span class="shrink-0 text-[13px] text-fg2">{formatBytes(f.size)}</span>
          <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Anhang entfernen')} onclick={() => files.splice(i, 1)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      {/each}
      <div class="px-4 py-1.5">
        <input bind:this={fileInput} type="file" accept="image/*,application/pdf" multiple class="hidden" onchange={onFiles} />
        <button type="button" class="flex min-h-11 w-full items-center gap-3 text-left text-[17px] text-accent-text" onclick={() => fileInput?.click()}>
          <Icon name="camera" size={18} />{t('Foto oder PDF hinzufügen')}
        </button>
      </div>
    </Group>

    <p class="mt-3 px-3 text-[13px] text-fg2">
      {t('Benachrichtigungen bekommen nur zugewiesene Personen, und nur wenn eine Fälligkeit gesetzt ist.')}
    </p>
  </form>
</Sheet>
