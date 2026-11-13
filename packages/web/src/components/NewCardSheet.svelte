<script lang="ts">
  import { untrack } from 'svelte';
  import { api, ApiError, type CardPatch, type Priority } from '../lib/api';
  import { autogrow } from '../lib/autogrow';
  import { columnForNew } from '../lib/calendar';
  import { deviceTz, fromInputValue, isFuture } from '../lib/datetime';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { loadKeywords } from '../lib/symbols/words.svelte';
  import { prepareUpload } from '../lib/image';
  import { hostOf, nextCategoryColor } from '../lib/newCard';
  import { parseQuickAdd } from '../lib/quickadd';
  import { blockingProblem } from '../lib/quickadd/labels';
  import { act, closeSheet, openSheet, revealNewCard, toast, ui } from '../lib/store.svelte';
  import { columnForDue } from '../lib/swipe';
  import { detectSymbol } from '../lib/symbols/detect';
  import type { CardFields } from './CardProps.svelte';
  import Avatar from './Avatar.svelte';
  import DateSheet from './DateSheet.svelte';
  import CategoryPicker from './newcard/CategoryPicker.svelte';
  import MoreSection from './newcard/MoreSection.svelte';
  import QuickLine from './newcard/QuickLine.svelte';
  import WhenWhere from './newcard/WhenWhere.svelte';
  import Icon from './Icon.svelte';
  import RecurrenceSheet from './RecurrenceSheet.svelte';
  import ReminderSheet from './ReminderSheet.svelte';
  import Sheet from './Sheet.svelte';
  import SymbolSheet from './SymbolSheet.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import Segmented from './ui/Segmented.svelte';
  import type { TileColor } from './ui/Tile.svelte';

  /** dueAt: vorbelegter Termin, z. B. aus dem Kalender */
  let { columnId, dueAt = null, picked = false, initialTitle = '' }: { columnId: string; dueAt?: string | null; picked?: boolean; initialTitle?: string } = $props();

  const columns = $derived(ui.view?.columns ?? []);
  // Ohne eigene Wahl richtet sich die Spalte nach dem Termin: nach heute → „Geplant", sonst „Offen"
  let columnPicked = untrack(() => picked);
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

  // Alles, was eine Aufgabe haben kann, lässt sich schon beim Anlegen ausfüllen
  const startsPlanned = ui.view?.columns.find((c) => c.id === columnId)?.isPlanned ?? false;
  let fields = $state<CardFields>({
    // svelte-ignore state_referenced_locally
    columnId,
    // Erinnerungen gehen nur an Zuständige: Wer die Aufgabe anlegt, ist zuerst selbst zuständig und kann das ändern
    assigneeIds: ui.me?.isPerson ? [ui.me.id] : [],
    // svelte-ignore state_referenced_locally
    dueAt: dueAt ?? (startsPlanned ? tomorrowNine() : null),
    recurrence: null,
    remindBeforeMin: null,
    reminder: null,
    priority: null,
    effort: null,
    categoryIds: [],
    costCents: null,
  });
  // svelte-ignore state_referenced_locally
  let title = $state(initialTitle);

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

  // ---------- Symbol: aus dem Titel erkannt (Funken), von Hand gewählt, oder zurückgenommen (dann Standard „Aufgabe") ----------
  // Die Suchwörter der Symbole sind ein eigenes Paket: schon beim Öffnen anstoßen, damit sie da sind, bevor der Titel fertig getippt ist
  void loadKeywords().catch(() => undefined);
  let pickedSymbol = $state<{ icon: string; color: TileColor | null } | null>(null);
  let symbolOff = $state(false);
  const detected = $derived(pickedSymbol || symbolOff ? null : detectSymbol(parsed.title, i18n.lang));
  const symbol = $derived(
    pickedSymbol
      ? { icon: pickedSymbol.icon, iconColor: pickedSymbol.color, iconSource: 'manual' as const }
      : detected
        ? { icon: detected, iconColor: null, iconSource: 'auto' as const }
        : { icon: null, iconColor: null, iconSource: null },
  );

  // Die Fenster stehen neben dem Blatt, nicht in seinem Formular
  let symbolOpen = $state(false);
  let dateOpen = $state(false);
  let repeatOpen = $state(false);
  let remindOpen = $state(false);

  let description = $state('');
  let items = $state<string[]>([]);
  let urls = $state<string[]>([]);
  let files = $state<File[]>([]);
  let more: MoreSection | undefined = $state();
  let busy = $state(false);

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
        toast(t('Termin heute oder keiner: Die Aufgabe kommt nach „{column}".', { column: columns.find((c) => c.id === wanted)?.name ?? t('Offen') }));
      }
    }
    return { dueAt: fields.dueAt };
  }

  function setDue(iso: string | null) {
    dateOpen = false;
    void onsave(iso ? { dueAt: iso } : { dueAt: null, recurrence: null, remindBeforeMin: null });
  }

  function pickColumn(id: string) {
    columnPicked = true;
    const fitting = columnForDue(columns, id, isFuture(fields.dueAt));
    fields.columnId = fitting;
    if (fitting !== id) toast(t('„Geplant" nimmt nur Aufgaben mit einem Termin nach heute. Stell zuerst den Termin ein.'));
  }

  /** Neue Kategorien aus der Schnell-Eingabe: erst fragen, dann anlegen und der Aufgabe geben */
  async function createCategories(): Promise<string[] | null> {
    const wanted = parsed.categories.filter((c) => c.categoryId === null && c.status === 'new');
    const ids: string[] = [];
    const used = (ui.view?.categories ?? []).map((c) => c.color);
    for (const c of wanted) {
      try {
        const made = await api.addCategory(ui.boardId!, c.name, nextCategoryColor(used));
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
        text: t('{names} gibt es in diesem Board noch nicht. Neu anlegen und der Aufgabe geben? Zum Weglassen schließ diese Frage und tippe auf den Chip.', { names }),
        label: t('Anlegen'),
        run: () => create(undefined, true),
      };
      return;
    }
    // Das gerade getippte, aber noch nicht bestätigte Eintrag/Link nicht verlieren
    more?.flush();

    // Zur Sicherheit noch einmal, falls Spalte oder Termin anders gesetzt wurden: kein Fehler, sondern „Offen"
    followDue();
    fields.columnId = columnForDue(columns, fields.columnId, isFuture(fields.dueAt));
    busy = true;
    await loadKeywords().catch(() => undefined); // ein sehr schnelles Speichern wartet auf die Suchwörter, damit das erkannte Symbol nicht fehlt
    const newCategoryIds = confirmedCategories ? await createCategories() : [];
    if (newCategoryIds === null) {
      busy = false;
      return;
    }
    const card = await act(() =>
      api.createCard(ui.boardId!, {
        ...fields,
        // Zählt ab Termin, wenn es einen gibt (er kann nach der Wahl noch geändert worden sein), sonst ab dem Anlegen
        reminder: fields.reminder ? { ...fields.reminder, anchor: fields.dueAt ? 'due' : 'created' } : null,
        categoryIds: [...fields.categoryIds, ...newCategoryIds],
        title: parsed.title,
        description: description.trim() || null,
        ...(symbol.icon ? { icon: symbol.icon, iconColor: symbol.iconColor, iconSource: symbol.iconSource } : symbol.iconColor ? { iconColor: symbol.iconColor } : {}),
      }),
    );
    if (!card) {
      busy = false;
      return;
    }
    revealNewCard(card);

    // Checkliste, Links und Anhänge gehören zur fertigen Aufgabe; was schiefgeht, wird gemeldet, die Aufgabe bleibt
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
        problems.push(`Link ${hostOf(url)}`);
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
    if (problems.length) toast(t('Aufgabe angelegt, aber nicht gespeichert: {problems}', { problems: problems.join(', ') }), { tone: 'error' });
    else toast(t('Aufgabe angelegt'), { action: { label: t('Öffnen'), run: () => openSheet({ type: 'card', id: card.id }) } });
  }

  // ---------- Anzeige ----------
  const PRIOS: { id: Priority; label: string; icon: string }[] = $derived([
    { id: 'low', label: t('Niedrig'), icon: 'flag' },
    { id: 'medium', label: t('Mittel'), icon: 'flag' },
    { id: 'high', label: t('Hoch'), icon: 'flag' },
  ]);

  const people = $derived(ui.people.filter((p) => p.isPerson).sort((a, b) => (a.id === ui.me?.id ? -1 : b.id === ui.me?.id ? 1 : 0)));
  function toggleWho(id: string) {
    void onsave({ assigneeIds: fields.assigneeIds.includes(id) ? fields.assigneeIds.filter((x) => x !== id) : [...fields.assigneeIds, id] });
  }
</script>

{#snippet cancel()}
  <button type="button" class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={closeSheet}>{t('Abbrechen')}</button>
{/snippet}

{#snippet foot()}
  <CtaButton disabled={!parsed.title || busy || !!quickProblem} onclick={() => create()}>
    <Icon name="check" size={22} stroke={2.6} />{busy ? t('Lege an …') : t('Aufgabe anlegen')}
  </CtaButton>
{/snippet}

{#snippet sec(label: string)}
  <div class="mt-1 flex h-[30px] items-center gap-2 px-1"><h2 class="text-[17px] font-extrabold tracking-tight">{label}</h2></div>
{/snippet}

<Sheet title={t('Neue Aufgabe')} onclose={closeSheet} left={cancel} footer={foot} lgWidth={880}>
  <form onsubmit={create} class="flex flex-col gap-3.5 pt-1 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
    <div class="max-lg:order-0 lg:col-span-2">
    <QuickLine
      bind:title
      {parsed}
      {symbol}
      {quickProblem}
      ondrop={dropToken}
      onopensymbol={() => (symbolOpen = true)}
      onclearsymbol={() => {
        pickedSymbol = null;
        symbolOff = true;
      }}
      oncreate={() => void create()}
    />
    </div>

    <div class="flex flex-col gap-3.5 max-lg:contents" data-testid="new-left">
      <div class="flex flex-col gap-3.5 max-lg:order-1">
    {@render sec(t('Wann und wo'))}
    <WhenWhere
      {fields}
      {columns}
      onpickcolumn={pickColumn}
      onopen={(what) => {
        if (what === 'date') dateOpen = true;
        else if (what === 'repeat') repeatOpen = true;
        else remindOpen = true;
      }}
    />

      </div>
      <div class="flex flex-col gap-3.5 max-lg:order-5">
    {@render sec(t('Notiz'))}
    <div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3">
      <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="note">{t('Freitext, Details, Maße …')}</label>
      <textarea
        id="note"
        rows="3"
        bind:value={description}
        use:autogrow={description}
        placeholder={t('z. B. Gelbe Tonne steht im Hof, Schlüssel hängt am Brett.')}
        class="block min-h-[66px] w-full resize-none overflow-hidden bg-transparent p-0 text-[15px] leading-[1.45] font-medium outline-none placeholder:text-dim"
      ></textarea>
    </div>

      </div>
      <div class="flex flex-col gap-3.5 max-lg:order-6">
    {@render sec(t('Mehr'))}
    <MoreSection bind:this={more} bind:items bind:urls bind:files />
      </div>
    </div>
    <div class="flex flex-col gap-3.5 max-lg:order-2" data-testid="new-right">
    {@render sec(t('Wer kümmert sich?'))}
    <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Wer kümmert sich?')}>
      {#each people as p (p.id)}
        <Chip photo active={fields.assigneeIds.includes(p.id)} pressed={fields.assigneeIds.includes(p.id)} onclick={() => toggleWho(p.id)}>
          <Avatar person={p} size={32} />{p.id === ui.me?.id ? t('Ich') : p.displayName}
        </Chip>
      {/each}
    </div>

    {@render sec(t('Priorität'))}
    <Segmented
      large
      label={t('Priorität')}
      items={PRIOS}
      value={fields.priority}
      onchange={(id) => void onsave({ priority: id === fields.priority ? null : (id as Priority) })}
    />

    {@render sec(t('Kategorie'))}
    <CategoryPicker {fields} {onsave} />

    </div>
  </form>
</Sheet>

{#if symbolOpen}
  <SymbolSheet
    title={parsed.title}
    icon={symbol.icon}
    color={symbol.iconColor}
    source={symbol.iconSource}
    onpick={(v) => {
      pickedSymbol = v;
      symbolOff = false;
      symbolOpen = false;
    }}
    onclose={() => (symbolOpen = false)}
  />
{/if}
{#if dateOpen}
  <DateSheet value={fields.dueAt} onpick={setDue} onclose={() => (dateOpen = false)} />
{/if}
{#if repeatOpen}
  <RecurrenceSheet
    value={fields.recurrence}
    dueAt={fields.dueAt}
    carryOver={fields.carryOver}
    onchange={(rule, autoDue) => void onsave({ recurrence: rule, ...(autoDue ? { dueAt: autoDue } : {}) })}
    oncarry={(c) => void onsave({ carryOver: c })}
    onclose={() => (repeatOpen = false)}
  />
{/if}
{#if remindOpen}
  <ReminderSheet
    dueAt={fields.dueAt}
    remindBeforeMin={fields.remindBeforeMin}
    reminder={fields.reminder}
    onremind={(min) => void onsave({ remindBeforeMin: min })}
    onnag={(spec) => void onsave({ reminder: spec })}
    onclose={() => (remindOpen = false)}
  />
{/if}
