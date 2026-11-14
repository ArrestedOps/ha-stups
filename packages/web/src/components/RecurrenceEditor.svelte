<script lang="ts">
  import { untrack } from 'svelte';
  import { t, tn, tx } from '../lib/i18n/index.svelte';
  import { names } from '../lib/i18n/names';
  import { deviceTz } from '../lib/datetime';
  import { ui } from '../lib/store.svelte';
  import SelectField from './SelectField.svelte';
  import NumberField from './NumberField.svelte';
  import Icon from './Icon.svelte';
  import Chip from './ui/Chip.svelte';
  import Tile from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';
  import type { CarryField } from '../lib/api';
  import { CARRY_OPTIONS, toggleCarry } from '../lib/carry';
  import {
    DEFAULT_TOLERANCE,
    DEFAULT_WINDOW,
    allowsTolerance,
    baseOf,
    describeRecurrence,
    editorFromRule,
    firstDue,
    handlingOf,
    lateExamples,
    ruleFromEditor,
    shortWhen,
    upcoming,
    withBase,
    withHandling,
    type Example,
    type Freq,
    type Handling,
    type Recurrence,
    type RecurrenceEditor,
  } from '../lib/recurrence';

  let {
    value,
    dueAt,
    carryOver,
    onchange,
    oncarry,
  }: {
    value: Recurrence | null;
    /** Ohne Termin legt die Wahl einer Regel den ersten Termin automatisch fest (zweites Argument von `onchange`) */
    dueAt: string | null;
    /** Felder, die die nächste Aufgabe übernimmt */
    carryOver: CarryField[];
    onchange: (rule: Recurrence | null, autoDue?: string) => void;
    oncarry: (fields: CarryField[]) => unknown;
  } = $props();

  // Die eigene Wahl gilt, bis das Speichern durch ist: Zwei schnelle Klicks rechnen sonst beide vom alten Stand der Aufgabe, und der zweite
  // überschreibt den ersten. Gespeichert wird nacheinander, damit die letzte Wahl auch die ist, die der Server behält.
  let chosen = $state<CarryField[] | null>(null);
  const shownCarry = $derived(chosen ?? carryOver);
  let saving: Promise<unknown> = Promise.resolve();
  let latest = 0;
  function carry(field: CarryField, on: boolean) {
    const next = toggleCarry(shownCarry, field, on);
    const mine = ++latest;
    chosen = next;
    saving = saving
      .then(() => oncarry(next))
      .catch(() => undefined) // Fehler meldet das Speichern selbst
      .finally(() => {
        if (mine === latest) chosen = null;
      });
  }

  const tz = deviceTz();
  const defaultTime = $derived(ui.settings?.defaultDueTime ?? '09:00');

  // Der Editor wird feldweise geändert (tiefe Reaktivität), deshalb $state statt writable $derived; der Anfangswert gilt schon beim ersten Zeichnen
  // eslint-disable-next-line svelte/prefer-writable-derived
  let editor = $state<RecurrenceEditor>(untrack(() => editorFromRule(value)));
  $effect(() => {
    editor = editorFromRule(value);
  });

  /** Der Termin, den dieser Editor zuletzt selbst gesetzt hat: Er folgt der Wahl, solange niemand ihn anders festlegt */
  let autoDue = $state<string | null>(null);
  const auto = $derived(!dueAt || dueAt === autoDue);
  const startIso = $derived(auto && editor.mode !== 'none' ? firstDue(editor, Date.now(), tz, defaultTime) : dueAt);

  function commit() {
    if (editor.mode === 'none') return onchange(null);
    let due = dueAt;
    let setDue: string | undefined;
    if (!due || due === autoDue) {
      setDue = firstDue(editor, Date.now(), tz, defaultTime);
      autoDue = setDue;
      due = setDue;
    }
    onchange(ruleFromEditor(editor, due, tz), setDue);
  }

  const base = $derived(baseOf(editor));
  const handling = $derived(handlingOf(editor));

  // ---------- Wie oft? ----------
  type ChipId = 'none' | 'hourly' | 'daily' | 'weekly' | 'weekly2' | 'monthly' | 'yearly' | 'custom';
  const PRESETS: { id: Exclude<ChipId, 'custom'>; freq: Freq | null; every: number; label: () => string }[] = [
    { id: 'none', freq: null, every: 1, label: () => t('Nie') },
    { id: 'hourly', freq: 'hourly', every: 1, label: () => t('Stündlich') },
    { id: 'daily', freq: 'daily', every: 1, label: () => t('Täglich') },
    { id: 'weekly', freq: 'weekly', every: 1, label: () => t('Wöchentlich') },
    { id: 'weekly2', freq: 'weekly', every: 2, label: () => t('Alle 2 Wochen') },
    { id: 'monthly', freq: 'monthly', every: 1, label: () => t('Monatlich') },
    { id: 'yearly', freq: 'yearly', every: 1, label: () => t('Jährlich') },
  ];
  let customOpen = $state(false);
  const activeChip = $derived<ChipId>(
    customOpen ? 'custom' : !base ? 'none' : (PRESETS.find((p) => p.freq === base.freq && p.every === base.every)?.id ?? 'custom'),
  );

  function pick(p: (typeof PRESETS)[number]) {
    customOpen = false;
    if (!p.freq) editor = { ...editor, mode: 'none', tolerance: null };
    else editor = withBase(editor, p.freq, p.every);
    commit();
  }
  function openCustom() {
    customOpen = true;
    if (!base) {
      editor = withBase(editor, 'daily', 2);
      commit();
    }
  }
  const FREQS = $derived<[Freq, string][]>([
    ['hourly', t('Stunden')],
    ['daily', t('Tage')],
    ['weekly', t('Wochen')],
    ['monthly', t('Monate')],
    ['yearly', t('Jahre')],
  ]);

  // Zahlenfelder: der Wert bleibt ein Text (unfertige Eingaben sind erlaubt), gespeichert wird, sobald er gültig ist
  const asInt = (s: string, min: number, max: number): number | null => {
    const n = Number(s.trim());
    return s.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  let everyText = $state('2');
  $effect(() => {
    const e = base?.every;
    if (e !== undefined && untrack(() => asInt(everyText, 1, 999)) !== e) everyText = String(e);
  });
  $effect(() => {
    const n = asInt(everyText, 1, 999);
    const b = untrack(() => base);
    if (n !== null && b && n !== b.every) {
      editor = withBase(untrack(() => editor), b.freq, n);
      untrack(commit);
    }
  });

  let tolText = $state(String(DEFAULT_TOLERANCE));
  $effect(() => {
    const tol = editor.tolerance;
    if (tol !== null && tol !== undefined && untrack(() => asInt(tolText, 0, 365)) !== tol) tolText = String(tol);
  });
  $effect(() => {
    const n = asInt(tolText, 0, 365);
    const cur = untrack(() => editor.tolerance);
    if (n !== null && cur !== null && cur !== undefined && n !== cur) {
      editor = { ...untrack(() => editor), tolerance: n };
      untrack(commit);
    }
  });

  // ---------- An welchem Tag? ----------
  const DAYS = $derived([1, 2, 3, 4, 5, 6, 0].map((d) => names().weekdaysShort[d]!));
  const weekdayOf = (iso: string): number => {
    const l = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(iso));
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(l) + 1;
  };
  const shownDays = $derived(editor.weekdays.length ? editor.weekdays : startIso ? [weekdayOf(startIso)] : []);
  function toggleDay(d: number) {
    const next = shownDays.includes(d) ? shownDays.filter((x) => x !== d) : [...shownDays, d];
    if (next.length === 0) return; // ein Wochentag bleibt immer gewählt
    editor = { ...editor, weekdays: next.sort((a, b) => a - b) };
    commit();
  }
  function setMonthDay(v: number) {
    editor = { ...editor, monthDay: v };
    commit();
  }

  // ---------- Zeitfenster (stündlich) ----------
  function setWindow(on: boolean) {
    editor = { ...editor, window: on ? { ...DEFAULT_WINDOW } : null };
    commit();
  }
  function setWindowTime(key: 'from' | 'to', v: string) {
    const w = { ...(editor.window ?? DEFAULT_WINDOW), [key]: v };
    if (!/^\d\d:\d\d$/.test(w.from) || !/^\d\d:\d\d$/.test(w.to) || w.from >= w.to) return; // unfertig oder verkehrt herum
    editor = { ...editor, window: w };
    commit();
  }

  // ---------- Und wenn ich später fertig werde? ----------
  function setHandling(h: Handling) {
    if (h === handling) return;
    editor = withHandling(editor, h);
    commit();
  }
  const examples = $derived(startIso && editor.mode !== 'none' ? lateExamples(editor, startIso, tz) : null);
  const hourly = $derived(base?.freq === 'hourly');
  const fixedRule = $derived(startIso && base ? ruleFromEditor(withHandling(editor, 'fixed'), startIso, tz) : null);
  const afterRule = $derived(startIso && base ? ruleFromEditor(withHandling(editor, 'after'), startIso, tz) : null);
  const tolRule = $derived(startIso && base && allowsTolerance(base.freq) ? ruleFromEditor(withHandling(editor, 'tolerant'), startIso, tz) : null);
  const current = $derived(startIso && editor.mode !== 'none' ? ruleFromEditor(editor, startIso, tz) : null);
  const preview = $derived(current && startIso ? upcoming(current, startIso, tz).map((iso) => shortWhen(iso, tz, hourly)) : []);

  /** Wie der Plan nach zu großer Verspätung neu beginnt: „nächster Samstag nach 2 Wochen“ */
  const restartText = $derived.by(() => {
    if (!tolRule || tolRule.type !== 'fixed') return '';
    const n = tolRule.every;
    if (tolRule.freq === 'weekly') {
      const day = names().weekdaysLong[(tolRule.weekdays?.[0] ?? 1) % 7]!;
      return t('Plan beginnt neu, nächster {day} nach {wait}.', { day, wait: tn('{n} Woche', '{n} Wochen', n) });
    }
    const when = tolRule.monthDay === -1 ? t('am letzten Tag') : t('am {day}.', { day: tolRule.monthDay ?? 1 });
    return t('Plan beginnt neu, {when} nach {wait}.', { when, wait: tn('{n} Monat', '{n} Monate', n) });
  });
</script>

{#snippet example(ex: Example)}
  <span class="block">{t('Erledigt {when} → nächstes Mal', { when: shortWhen(ex.doneIso, tz, hourly) })} <b class="font-bold text-accent-text">{shortWhen(ex.nextIso, tz, hourly)}</b></span>
{/snippet}

{#snippet radio(id: Handling, title: string, sub: string, body: import('svelte').Snippet | null)}
  <div class="rounded-row bg-surface {handling === id ? 'ring-2 ring-accent' : ''}" data-handling={id}>
    <button type="button" role="radio" aria-checked={handling === id} class="flex min-h-14 w-full items-start gap-3 px-3.5 pt-3 pb-2.5 text-left" onclick={() => setHandling(id)}>
      <span class="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 {handling === id ? 'border-accent' : 'border-ring'}">
        {#if handling === id}<span class="h-[10px] w-[10px] rounded-full bg-accent"></span>{/if}
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-[15px] font-bold tracking-tight">{title}</span>
        <span class="text-[13px] text-fg2">{sub}</span>
      </span>
    </button>
    {#if body}<div class="flex flex-col gap-2 px-3 pb-3">{@render body()}</div>{/if}
  </div>
{/snippet}

<div class="flex flex-col gap-3" data-testid="recurrence-editor">
  {#if editor.mode !== 'none' && current}
    <!-- Vorschau: der Rhythmus und die nächsten Termine -->
    <div class="rounded-row bg-surface px-3.5 py-3" data-testid="recurrence-preview">
      <div class="text-[16px] font-extrabold tracking-tight">{describeRecurrence(current)}</div>
      <div class="mt-0.5 text-[13px] text-fg2">{auto ? t('Erster Termin wird automatisch gesetzt:') : t('Nächste Termine:')}</div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each preview as when, i (i)}<span class="inline-flex h-[28px] items-center rounded-full bg-surface2 px-2.5 text-[13px] font-semibold">{when}</span>{/each}
      </div>
    </div>
  {/if}

  <div class="px-1 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Wie oft?')}</div>
  <!-- Auswahlliste wie in iOS: eine Zeile je Rhythmus, die gewählte mit Haken -->
  <div class="list-group !mt-0" role="group" aria-label={t('Wie oft?')}>
    {#each PRESETS as p (p.id)}
      <button type="button" class="flex h-[46px] w-full items-center justify-between px-4 text-left text-[17px]" aria-pressed={activeChip === p.id} onclick={() => pick(p)}>
        {p.label()}{#if activeChip === p.id}<span class="text-accent-text"><Icon name="check" size={20} stroke={2.6} /></span>{/if}
      </button>
    {/each}
    <button type="button" class="flex h-[46px] w-full items-center justify-between px-4 text-left text-[17px]" aria-pressed={activeChip === 'custom'} onclick={openCustom}>
      {t('Eigene …')}{#if activeChip === 'custom'}<span class="text-accent-text"><Icon name="check" size={20} stroke={2.6} /></span>{/if}
    </button>
  </div>

  {#if activeChip === 'custom' && base}
    <div class="flex items-center gap-2 rounded-row bg-surface px-3.5 py-3 text-[15px]" data-testid="recurrence-custom">
      <span class="font-bold">{editor.mode === 'after' ? tx('Wiederholung', 'Nach') : tx('Wiederholung', 'Alle')}</span>
      <NumberField bind:value={everyText} label={t('Abstand')} />
      <SelectField variant="box" value={base.freq} onchange={(e) => { editor = withBase(editor, e.currentTarget.value as Freq, base.every); commit(); }} label={t('Einheit')}>
        {#each FREQS as [f, label] (f)}<option value={f}>{label}</option>{/each}
      </SelectField>
    </div>
  {/if}

  {#if base?.freq === 'weekly' && handling !== 'after'}
    <div class="px-1 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('An welchem Tag?')}</div>
    <div class="flex flex-wrap gap-1.5" role="group" aria-label={t('Wochentage')}>
      {#each DAYS as day, i (day)}
        <Chip small active={shownDays.includes(i + 1)} pressed={shownDays.includes(i + 1)} onclick={() => toggleDay(i + 1)}>{day}</Chip>
      {/each}
    </div>
  {/if}

  {#if base?.freq === 'monthly' && handling !== 'after'}
    <label class="flex items-center gap-2 text-[15px]">
      <span>{t('am')}</span>
      <SelectField variant="box" value={editor.monthDay} onchange={(e) => setMonthDay(Number(e.currentTarget.value))} label={t('Tag im Monat')}>
        <option value={0}>{t('Tag des Termins')}</option>
        {#each Array.from({ length: 31 }, (_, i) => i + 1) as d (d)}<option value={d}>{d}.</option>{/each}
        <option value={-1}>{t('letzten Tag')}</option>
      </SelectField>
    </label>
  {/if}

  {#if base?.freq === 'hourly' && handling === 'fixed'}
    <div class="rounded-row border border-line bg-surface px-3.5 py-2" data-testid="recurrence-window">
      <div class="flex items-center justify-between gap-3">
        <span class="flex min-w-0 flex-col">
          <span class="text-[15px] font-bold">{t('Nur zwischen bestimmten Uhrzeiten')}</span>
          <span class="text-[13px] text-fg2">{t('Spätere Termine rücken auf den nächsten Morgen')}</span>
        </span>
        <Toggle checked={!!editor.window} label={t('Nur zwischen bestimmten Uhrzeiten')} onchange={setWindow} />
      </div>
      {#if editor.window}
        <div class="flex items-center gap-2 pt-1 pb-2 text-[15px]">
          <span>{t('von')}</span>
          <input type="time" class="h-10 rounded-xl border border-track bg-bg px-2 text-[15px] font-bold" value={editor.window.from} aria-label={t('Fensteranfang')} onchange={(e) => setWindowTime('from', e.currentTarget.value)} />
          <span>{t('bis')}</span>
          <input type="time" class="h-10 rounded-xl border border-track bg-bg px-2 text-[15px] font-bold" value={editor.window.to} aria-label={t('Fensterende')} onchange={(e) => setWindowTime('to', e.currentTarget.value)} />
        </div>
      {/if}
    </div>
  {/if}

  {#if editor.mode !== 'none' && examples && fixedRule && afterRule}
    <div class="px-1 pt-1 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Und wenn ich später fertig werde?')}</div>
    <div class="flex flex-col gap-2.5" role="radiogroup" aria-label={t('Und wenn ich später fertig werde?')}>
      {#snippet fixedBody()}
        <div class="rounded-xl bg-surface2 px-3 py-2 text-[13px] leading-snug" data-testid="example-fixed">{@render example(examples.fixed)}</div>
      {/snippet}
      {@render radio('fixed', t('Plan bleibt fest'), t('Der Plan bleibt: {rule}, egal wann erledigt.', { rule: describeRecurrence(fixedRule) }), fixedBody)}

      {#if examples.tolerant}
        {@const tol = examples.tolerant}
        {#snippet tolBody()}
          {#if handling === 'tolerant'}
            <div class="flex items-center gap-3 rounded-row border border-line bg-bg px-3 py-2.5">
              <Tile color="blue" size="sm"><Icon name="clock" size={18} /></Tile>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-[15px] font-bold tracking-tight">{t('Toleranz')}</span>
                <span class="text-[13px] text-fg2">{t('so viele Tage darfst du zu spät sein')}</span>
              </span>
              <NumberField bind:value={tolText} label={t('Toleranz in Tagen')} unit={t('Tage')} />
            </div>
          {/if}
          <div class="rounded-xl bg-surface2 px-3 py-2 text-[13px] leading-snug" data-testid="example-tolerant-ok">
            <span class="block"><span aria-hidden="true">✓</span> <b class="font-bold text-accent-text">{tn('Bis {n} Tag zu spät:', 'Bis {n} Tage zu spät:', tol.days)}</b> {t('Plan bleibt.')}</span>
            {@render example(tol.ok)}
          </div>
          <div class="rounded-xl bg-surface2 px-3 py-2 text-[13px] leading-snug" data-testid="example-tolerant-late">
            <span class="block"><span aria-hidden="true">↻</span> <b class="font-bold text-accent-text">{tn('Mehr als {n} Tag zu spät:', 'Mehr als {n} Tage zu spät:', tol.days)}</b> {restartText}</span>
            {@render example(tol.late)}
          </div>
        {/snippet}
        {@render radio('tolerant', t('Kleine Verspätung ist okay'), t('Danach beginnt der Plan neu.'), tolBody)}
      {/if}

      {#snippet afterBody()}
        <div class="rounded-xl bg-surface2 px-3 py-2 text-[13px] leading-snug" data-testid="example-after">{@render example(examples.after)}</div>
      {/snippet}
      {@render radio('after', t('Neu zählen ab Erledigung'), t('Immer {rule}.', { rule: describeRecurrence(afterRule) }), afterBody)}
    </div>
    {#if !examples.tolerant}
      <p class="px-1 text-[13px] text-fg2">{t('„Kleine Verspätung ist okay“ gibt es nur bei wöchentlich und monatlich.')}</p>
    {/if}
  {/if}

  {#if editor.mode !== 'none'}
    <fieldset class="rounded-row bg-surface px-4 py-2" aria-label={t('Für die nächste Aufgabe übernehmen')}>
      <legend class="px-1 text-[13px] font-semibold text-fg2">{t('Für die nächste Aufgabe übernehmen')}</legend>
      {#each CARRY_OPTIONS as o (o.field)}
        <label class="flex min-h-10 items-center justify-between gap-3 text-[15px]">
          <span>{o.label}{#if o.hint}<span class="text-fg2"> · {o.hint}</span>{/if}</span>
          <input
            type="checkbox"
            class="h-5 w-5 accent-[var(--accent)]"
            checked={shownCarry.includes(o.field)}
            aria-label={t('{label} in die nächste Aufgabe übernehmen', { label: o.label })}
            onchange={(e) => carry(o.field, e.currentTarget.checked)}
          />
        </label>
      {/each}
      <p class="mt-1 mb-1 text-[13px] text-fg2">
        {t('Titel, Zuständige, Kategorien, Priorität und Erinnerungen kommen immer mit. Beim Erledigen bleibt die jetzige Aufgabe mit allem in „Erledigt“, die nächste wird neu angelegt.')}
      </p>
    </fieldset>
  {/if}
</div>
