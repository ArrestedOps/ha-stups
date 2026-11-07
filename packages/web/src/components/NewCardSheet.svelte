<script lang="ts">
  import { clock } from '../lib/clock.svelte';
  import { untrack } from 'svelte';
  import { api, ApiError, type CardPatch, type Priority } from '../lib/api';
  import { autogrow } from '../lib/autogrow';
  import { catKey, findCategory } from '../lib/colors';
  import { columnForNew } from '../lib/calendar';
  import { deviceTz, formatLead, fromInputValue, isFuture } from '../lib/datetime';
  import { summaryTitle } from '../lib/dateSheet';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { dayOfMonth, names } from '../lib/i18n/names';
  import { formatBytes, prepareUpload, uploadProblem } from '../lib/image';
  import { parseQuickAdd, type QuickToken } from '../lib/quickadd';
  import { blockingProblem, chipLabel } from '../lib/quickadd/labels';
  import { describeRecurrence } from '../lib/recurrence';
  import { act, closeSheet, openSheet, personById, revealNewCard, toast, ui } from '../lib/store.svelte';
  import { columnForDue } from '../lib/swipe';
  import { detectSymbol } from '../lib/symbols/detect';
  import { symbolName } from '../lib/symbols/library';
  import type { CardFields } from './CardProps.svelte';
  import Avatar from './Avatar.svelte';
  import CardTile from './CardTile.svelte';
  import DateSheet from './DateSheet.svelte';
  import Icon from './Icon.svelte';
  import RecurrenceSheet from './RecurrenceSheet.svelte';
  import Sheet from './Sheet.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import SymbolSheet from './SymbolSheet.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Segmented from './ui/Segmented.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /** dueAt: vorbelegter Termin, z. B. aus dem Kalender */
  let { columnId, dueAt = null, picked = false }: { columnId: string; dueAt?: string | null; picked?: boolean } = $props();

  const columns = $derived(ui.view?.columns ?? []);
  const board = $derived(ui.boards.find((b) => b.id === ui.boardId));
  // „Geplant" sortiert sich nach dem Termin von selbst, darum steht es nur zur Wahl, wenn man dort anlegt
  const choices = $derived(columns.filter((c) => !c.isPlanned || c.id === fields.columnId));
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
    effort: null,
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

  // ---------- Symbol: aus dem Titel erkannt (Funken), von Hand gewählt, oder zurückgenommen (dann Standard „Aufgabe") ----------
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
  let symbolOpen = $state(false);
  let dateOpen = $state(false);
  let repeatOpen = $state(false);

  let description = $state('');
  let items = $state<string[]>([]);
  let urls = $state<string[]>([]);
  let files = $state<File[]>([]);
  let newItem = $state('');
  let newLink = $state('');
  let busy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  // „Mehr": Checkliste und Foto/Link klappen auf; was schon eingetragen ist, bleibt sichtbar
  let showItems = $state(false);
  let showAttach = $state(false);

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

  function setDue(iso: string | null) {
    dateOpen = false;
    void onsave(iso ? { dueAt: iso } : { dueAt: null, recurrence: null, remindBeforeMin: null, overdueNag: false });
  }

  function addItem(e: Event) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    items.push(text);
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
        const made = await api.addCategory(ui.boardId!, c.name, nextCatColor(used));
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
        ...(symbol.icon ? { icon: symbol.icon, iconColor: symbol.iconColor, iconSource: symbol.iconSource } : symbol.iconColor ? { iconColor: symbol.iconColor } : {}),
      }),
    );
    if (!card) {
      busy = false;
      return;
    }
    revealNewCard(card);

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

  // ---------- Anzeige ----------
  const column = $derived(columns.find((c) => c.id === fields.columnId));
  const assignees = $derived(fields.assigneeIds.map(personById).filter((p) => p !== undefined));
  const hasToken = $derived(parsed.tokens.length > 0);
  const hint = $derived(
    !title.trim()
      ? t('Tipp: Datum, @Person, #Kategorie und „jede Woche“ einfach mitschreiben')
      : hasToken || symbol.icon
        ? t('Stups hat erkannt – zum Entfernen auf ✕ tippen')
        : t('Noch nichts erkannt – Standard-Symbol „Aufgabe“'),
  );

  /** Kurzes Datum für die Zeile: „Do, 30. Jan“ */
  function shortDay(iso: string): string {
    const l = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(l);
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    const wd = names().weekdaysShort[new Date(Date.UTC(get('year'), get('month') - 1, get('day'))).getUTCDay()];
    return `${wd}, ${dayOfMonth(get('day'))} ${names().monthsShort[get('month') - 1]}`;
  }
  const dueTitle = $derived((void clock.tick, fields.dueAt ? summaryTitle(fields.dueAt, Date.now(), tz) : t('Kein Termin')));
  const dueMeta = $derived(
    !fields.dueAt ? t('Ohne Termin gibt es keine Erinnerung') : assignees.length ? `${shortDay(fields.dueAt)} • ${t('Push zur Fälligkeit')}` : `${shortDay(fields.dueAt)} • ${t('Niemand zuständig, keine Erinnerung')}`,
  );
  const recurTitle = $derived(fields.recurrence ? describeRecurrence(fields.recurrence) : t('Nicht wiederholen'));
  const recurMeta = $derived(
    fields.recurrence ? (fields.recurrence.type === 'fixed' ? t('fester Rhythmus • ab Termin') : t('nach dem Erledigen')) : t('Einmalige Aufgabe'),
  );
  const remindOn = $derived(fields.remindBeforeMin !== null || fields.overdueNag);
  const remindTitle = $derived(t('Erinnern {lead} vorher', { lead: formatLead(fields.remindBeforeMin ?? 30) }));
  const remindMeta = $derived(
    assignees.length ? `${t('Push an {names}', { names: assignees.map((p) => (p.id === ui.me?.id ? t('dich') : p.displayName)).join(' & ') })} • ${t('Nachhaken, wenn überfällig')}` : t('Niemand zuständig, keine Erinnerung'),
  );

  const PRIOS: { id: Priority; label: string; icon: string }[] = $derived([
    { id: 'low', label: t('Niedrig'), icon: 'flag' },
    { id: 'medium', label: t('Mittel'), icon: 'flag' },
    { id: 'high', label: t('Hoch'), icon: 'flag' },
  ]);

  const people = $derived(ui.people.filter((p) => p.isPerson).sort((a, b) => (a.id === ui.me?.id ? -1 : b.id === ui.me?.id ? 1 : 0)));
  function toggleWho(id: string) {
    void onsave({ assigneeIds: fields.assigneeIds.includes(id) ? fields.assigneeIds.filter((x) => x !== id) : [...fields.assigneeIds, id] });
  }
  function toggleCategory(id: string) {
    void onsave({ categoryIds: fields.categoryIds.includes(id) ? fields.categoryIds.filter((x) => x !== id) : [...fields.categoryIds, id] });
  }

  // ---------- Kategorie gleich hier anlegen ----------
  const CAT_COLORS = $derived<[string, string][]>([
    ['orange', t('Orange')],
    ['blue', t('Blau')],
    ['green', t('Grün')],
    ['pink', t('Pink')],
    ['purple', t('Lila')],
    ['red', t('Rot')],
    ['teal', t('Türkis')],
  ]);
  const nextCatColor = (used: string[]) => CAT_COLORS.map((c) => c[0]).find((c) => !used.includes(c)) ?? 'orange';
  let newCat = $state(false);
  let catName = $state('');
  let catColor = $state<string | null>(null);
  let catBusy = $state(false);
  const shownCatColor = $derived(catColor ?? nextCatColor((ui.view?.categories ?? []).map((c) => c.color)));

  /** Anlegen und gleich für diese Karte wählen; gibt es den Namen schon, wird die vorhandene gewählt */
  async function addCategory(e: Event) {
    e.preventDefault();
    const n = catName.trim();
    if (!n || catBusy || !ui.boardId) return;
    const existing = findCategory(ui.view?.categories ?? [], n);
    if (existing) {
      if (!fields.categoryIds.includes(existing.id)) void onsave({ categoryIds: [...fields.categoryIds, existing.id] });
      catName = '';
      newCat = false;
      return;
    }
    catBusy = true;
    const made = await act(() => api.addCategory(ui.boardId!, n, shownCatColor));
    catBusy = false;
    if (made) {
      void onsave({ categoryIds: [...fields.categoryIds, made.id] });
      catName = '';
      catColor = null;
      newCat = false;
    }
  }

  const catDot = (color: string) => `var(--c-${catKey(color)}-fg)`;
  const tokenCategory = (tok: QuickToken) => (ui.view?.categories ?? []).find((c) => c.name.toLowerCase() === (tok.value ?? '').toLowerCase());
  const tokenPerson = (tok: QuickToken) => {
    const a = parsed.assignees.find((x) => x.name.toLowerCase() === (tok.value ?? '').toLowerCase() && x.personId);
    return a?.personId ? personById(a.personId) : undefined;
  };
  const tokenIcon = (k: QuickToken['kind']) => (k === 'recurrence' ? 'repeat' : k === 'priority' ? 'flag' : k === 'person' ? 'user' : 'calendar');
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

{#snippet go()}
  <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>
{/snippet}

<Sheet title={t('Neue Aufgabe')} onclose={closeSheet} left={cancel} footer={foot}>
  <form onsubmit={create} class="flex flex-col gap-3.5 pt-1">
    <!-- Schnell-Eingabe: Symbol, Titel, erkannte Teile -->
    <div class="flex flex-col gap-3 rounded-row border border-line bg-surface px-3.5 pt-3.5 pb-3">
      <div class="flex items-start gap-3">
        <button
          type="button"
          class="relative block shrink-0 rounded-[14px]"
          aria-label={t('Symbol ändern, gerade: {name}', { name: symbolName(symbol.icon) })}
          data-testid="symbol-tile"
          onclick={() => (symbolOpen = true)}
        >
          <CardTile card={symbol} glyph={28} />
          {#if symbol.iconSource === 'auto'}
            <span
              class="bg-accent-grad absolute -right-[5px] -bottom-[5px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface !shadow-none"
              data-testid="symbol-spark"
            ><Icon name="spark" size={12} fill /></span>
          {/if}
        </button>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="quick">{t('Was steht an?')}</label>
          <!-- svelte-ignore a11y_autofocus -->
          <textarea
            id="quick"
            rows="2"
            use:autogrow={title}
            bind:value={title}
            placeholder={t('z. B. Müll raus morgen 19 Uhr @Ben')}
            maxlength="200"
            enterkeyhint="done"
            autocapitalize="sentences"
            spellcheck="false"
            autofocus
            class="block min-h-[52px] w-full resize-none overflow-hidden bg-transparent p-0 text-[18px] leading-[1.35] font-bold outline-none placeholder:text-dim"
            onkeydown={(e) => {
              // Eingabetaste legt an, statt einen Zeilenumbruch in den Titel zu schreiben
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
          ></textarea>
        </div>
      </div>
      <p class="flex items-center gap-1.5 text-[12px] text-fg2" role="status">
        <span class="inline-flex shrink-0 text-accent-text"><Icon name="spark" size={14} stroke={2} /></span>{hint}
      </p>
      {#if hasToken || symbol.icon}
        <div class="flex flex-wrap gap-1.5" role="group" aria-label={t('Erkannt')} data-testid="quick-chips">
          {#if symbol.icon}
            <span class="tok" data-testid="symbol-chip">
              <button type="button" class="inline-flex items-center gap-1.5" onclick={() => (symbolOpen = true)}>
                <SymbolIcon id={symbol.icon} size={14} />{t('Symbol: {name}', { name: symbolName(symbol.icon) })}
              </button>
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded-full bg-(--count-on) text-tok-fg"
                aria-label={t('Symbol entfernen')}
                onclick={() => {
                  pickedSymbol = null;
                  symbolOff = true;
                }}
              ><Icon name="x" size={12} stroke={2.6} /></button>
            </span>
          {/if}
          {#each parsed.tokens as tok (tok.id + ':' + tok.start)}
            {@const label = chipLabel(tok, parsed, tz)}
            {@const warn = tok.status === 'unknown' || tok.status === 'ambiguous'}
            {@const who = tok.kind === 'person' && tok.status === 'ok' ? tokenPerson(tok) : undefined}
            {@const cat = tok.kind === 'category' ? tokenCategory(tok) : undefined}
            <button
              type="button"
              class="tok {warn ? 'tok-warn' : ''} {who ? '!pl-[3px]' : ''}"
              data-testid="quick-chip"
              data-kind={tok.kind}
              data-status={tok.status}
              aria-label={t('{label}: zurücknehmen', { label })}
              title={t('Antippen nimmt es zurück')}
              onclick={() => dropToken(tok.id)}
            >
              {#if who}<Avatar person={who} size={24} />
              {:else if tok.kind === 'category'}<span class="h-[9px] w-[9px] shrink-0 rounded-full" style:background={cat ? catDot(cat.color) : 'var(--sig-orange)'}></span>
              {:else}<Icon name={tokenIcon(tok.kind)} size={14} stroke={2} />{/if}
              {label}
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-(--count-on)"><Icon name="x" size={12} stroke={2.6} /></span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    {#if quickProblem}<p class="rounded-xl bg-danger-bg px-3 py-2 text-[14px] text-danger" role="alert">{quickProblem}</p>{/if}

    {@render sec(t('Wann und wo'))}
    <div class="flex flex-col gap-2">
      <div class="relative">
        <ListRow title={board?.name ?? t('Board')} variant="setting">
          {#snippet tile()}<Tile color="purple"><Icon name="layers" size={24} /></Tile>{/snippet}
          {#snippet meta()}<span class="truncate">{t('Board')} • {t('Spalte {name}', { name: column?.name ?? t('Offen') })}</span>{/snippet}
          {#snippet right()}{@render go()}{/snippet}
        </ListRow>
        <select
          class="absolute inset-0 h-full w-full opacity-0"
          value={fields.columnId}
          aria-label={t('Status der Karte')}
          onchange={(e) => pickColumn(e.currentTarget.value)}
        >
          {#each choices as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </div>

      <ListRow title={dueTitle} onclick={() => (dateOpen = true)} label={t('Termin wählen, gerade: {when}', { when: dueTitle })}>
        {#snippet tile()}<Tile color="red"><Icon name="calendar" size={24} /></Tile>{/snippet}
        {#snippet meta()}<span class="truncate">{dueMeta}</span>{/snippet}
        {#snippet right()}{@render go()}{/snippet}
      </ListRow>

      <ListRow title={recurTitle} onclick={() => (repeatOpen = true)} label={t('Wiederholung wählen, gerade: {rule}', { rule: recurTitle })}>
        {#snippet tile()}<Tile color="teal"><Icon name="repeat" size={24} /></Tile>{/snippet}
        {#snippet meta()}<span class="truncate">{recurMeta}</span>{/snippet}
        {#snippet right()}{@render go()}{/snippet}
      </ListRow>

      <ListRow title={remindTitle}>
        {#snippet tile()}<Tile color="blue"><Icon name="bell" size={24} /></Tile>{/snippet}
        {#snippet meta()}<span class="truncate">{remindMeta}</span>{/snippet}
        {#snippet right()}
          <Toggle
            checked={remindOn}
            label={t('Erinnerung')}
            disabled={!fields.dueAt}
            onchange={(v) => void onsave(v ? { remindBeforeMin: 30, overdueNag: true } : { remindBeforeMin: null, overdueNag: false })}
          />
        {/snippet}
      </ListRow>
    </div>

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
    <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Kategorie')}>
      {#each ui.view?.categories ?? [] as c (c.id)}
        <Chip active={fields.categoryIds.includes(c.id)} pressed={fields.categoryIds.includes(c.id)} onclick={() => toggleCategory(c.id)}>
          <span class="h-[9px] w-[9px] shrink-0 rounded-full" style:background={catDot(c.color)}></span>{c.name}
        </Chip>
      {/each}
      <Chip active={newCat} pressed={newCat} onclick={() => (newCat = !newCat)}><Icon name="plus" size={18} stroke={2} />{t('Neue Kategorie')}</Chip>
    </div>
    {#if newCat}
      <div class="focus-ring-in flex flex-col gap-2.5 rounded-row border border-line bg-surface px-3.5 py-3" role="group" aria-label={t('Neue Kategorie')}>
        <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="nc">{t('Neue Kategorie')}</label>
        <div class="flex items-center gap-2">
          <input
            id="nc"
            bind:value={catName}
            placeholder={t('Name, z. B. Garten')}
            maxlength="40"
            enterkeyhint="done"
            class="h-11 min-w-0 flex-1 rounded-xl border border-track bg-bg px-3 text-[15px] font-semibold outline-none placeholder:text-dim"
            onkeydown={(e) => e.key === 'Enter' && addCategory(e)}
          />
          <button
            type="button"
            class="bg-accent-grad glow-pill h-11 shrink-0 rounded-xl px-4 text-[14px] font-bold disabled:opacity-40"
            disabled={!catName.trim() || catBusy}
            onclick={addCategory}
          >{t('Anlegen')}</button>
        </div>
        <div class="flex gap-2.5" role="radiogroup" aria-label={t('Farbe der Kategorie')}>
          {#each CAT_COLORS as [key, label] (key)}
            <button
              type="button"
              role="radio"
              aria-checked={shownCatColor === key}
              aria-label={label}
              class="h-[30px] w-[30px] rounded-full border-2 p-0 shadow-[inset_0_0_0_2px_var(--surface)] {shownCatColor === key ? 'border-fg' : 'border-transparent'}"
              style:background={catDot(key)}
              onclick={() => (catColor = key)}
            ></button>
          {/each}
        </div>
      </div>
    {/if}

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

    {@render sec(t('Mehr'))}
    <div class="grid grid-cols-2 gap-2">
      <button
        type="button"
        class="more-btn"
        aria-expanded={showItems || items.length > 0}
        onclick={() => (showItems = !showItems)}
      ><span class="text-accent-text"><Icon name="task-check" size={22} stroke={1.8} /></span>{t('Checkliste')}{items.length ? ` · ${items.length}` : ''}</button>
      <button
        type="button"
        class="more-btn"
        aria-expanded={showAttach || urls.length > 0 || files.length > 0}
        onclick={() => (showAttach = !showAttach)}
      ><span class="text-accent-text"><Icon name="paperclip" size={22} stroke={1.8} /></span>{t('Foto / Link')}{urls.length + files.length ? ` · ${urls.length + files.length}` : ''}</button>
    </div>

    {#if showItems || items.length > 0}
      <div class="flex flex-col rounded-row border border-line bg-surface" role="group" aria-label={t('Checkliste')}>
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
            class="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-dim"
            aria-label={t('Neuer Eintrag')}
            onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(e))}
          />
          <button type="button" class="bg-accent-grad min-h-9 shrink-0 rounded-xl px-3.5 text-[15px] font-bold {newItem.trim() ? '' : 'hidden'}" onclick={addItem}>{t('Hinzufügen')}</button>
        </div>
      </div>
    {/if}

    {#if showAttach || urls.length > 0 || files.length > 0}
      <div class="flex flex-col rounded-row border border-line bg-surface" role="group" aria-label={t('Foto / Link')}>
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
            class="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-dim"
            aria-label={t('Neuer Link')}
            onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink(e))}
          />
          <button type="button" class="bg-accent-grad min-h-9 shrink-0 rounded-xl px-3.5 text-[15px] font-bold {newLink.trim() ? '' : 'hidden'}" onclick={addLink}>{t('Hinzufügen')}</button>
        </div>
        {#each files as f, i (i)}
          <div class="flex min-h-12 items-center gap-3 border-t border-line px-4">
            <Icon name="paperclip" size={16} />
            <span class="min-w-0 flex-1 truncate py-2">{f.name}</span>
            <span class="shrink-0 text-[13px] text-fg2">{formatBytes(f.size)}</span>
            <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Anhang entfernen')} onclick={() => files.splice(i, 1)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        {/each}
        <div class="border-t border-line px-4 py-1.5">
          <input bind:this={fileInput} type="file" accept="image/*,application/pdf" multiple class="hidden" onchange={onFiles} />
          <button type="button" class="flex min-h-11 w-full items-center gap-3 text-left text-[17px] text-accent-text" onclick={() => fileInput?.click()}>
            <Icon name="camera" size={18} />{t('Foto oder PDF hinzufügen')}
          </button>
        </div>
      </div>
    {/if}
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
