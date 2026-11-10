<script lang="ts">
  import { untrack } from 'svelte';
  import { deviceTz, formatLead } from '../lib/datetime';
  import { t, tx } from '../lib/i18n/index.svelte';
  import {
    DEFAULT_MAX,
    FIRST_PRESETS,
    REPEAT_PRESETS,
    firstChoiceOf,
    normalize,
    plan,
    repeatChoiceOf,
    splitMinutes,
    toMinutes,
    usesClock,
    validMax,
    validMinutes,
    type FirstChoice,
    type ReminderSpec,
    type RepeatChoice,
    type Unit,
  } from '../lib/reminder';
  import { shortWhen } from '../lib/recurrence';
  import { ui } from '../lib/store.svelte';
  import NumberField from './NumberField.svelte';
  import SelectField from './SelectField.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';

  /**
   * „Erinnerung“ einer Aufgabe: „Vorher erinnern“ wie bisher, darunter „Nachhaken, wenn nicht erledigt“ (persönlich, nur für dich):
   * eine Wahl (Chips, bei „Eigene …“ Zahl und Einheit), „Danach wiederholen?“, Uhrzeit (nur bei Tagen und Wochen), Höchstzahl und der
   * Ablauf als Text mit den nächsten Zeitpunkten. Mit der Erledigung endet alles von selbst. Jede Änderung gilt sofort.
   */
  let {
    dueAt,
    remindBeforeMin,
    reminder,
    onremind,
    onnag,
    fromNow = false,
  }: {
    dueAt: string | null;
    remindBeforeMin: number | null;
    reminder: ReminderSpec | null;
    onremind: (min: number | null) => unknown;
    onnag: (spec: ReminderSpec | null) => unknown;
    /** Karte gibt es schon: ohne Termin zählt es ab jetzt (bei einer neuen Karte ab dem Anlegen) */
    fromNow?: boolean;
  } = $props();

  const REMINDERS = [15, 30, 60, 120, 1440, 2880];
  const tz = deviceTz();
  const defaultTime = $derived(ui.settings?.effectiveOverdueNagTime ?? '18:00');
  const anchor = $derived<'due' | 'created'>(dueAt ? 'due' : 'created');

  // Die eigene Wahl gilt sofort; vom Server zurückkommende Werte gleichen sie nur an, wenn sie anders sind
  let spec = $state<ReminderSpec | null>(untrack(() => reminder));
  $effect(() => {
    const r = reminder;
    untrack(() => {
      if (JSON.stringify(r) !== JSON.stringify(spec)) spec = r;
    });
  });

  let customFirst = $state(false);
  let customRepeat = $state(false);
  const firstChoice = $derived<FirstChoice>(customFirst ? 'custom' : firstChoiceOf(spec));
  const repeatChoice = $derived<RepeatChoice>(!spec ? 'no' : customRepeat ? 'custom' : repeatChoiceOf(spec));

  // Zahlenfelder bleiben Text (unfertige Eingaben sind erlaubt), gespeichert wird, sobald der Wert gültig ist
  const startFirst = untrack(() => splitMinutes(spec?.afterMin ?? 120));
  let firstText = $state(String(startFirst.n));
  let firstUnit = $state<Unit>(startFirst.unit);
  const startEvery = untrack(() => splitMinutes(spec?.everyMin ?? 120));
  let everyText = $state(String(startEvery.n));
  let everyUnit = $state<Unit>(startEvery.unit);
  let maxText = $state(String(untrack(() => spec?.max ?? DEFAULT_MAX)));
  let timeText = $state(untrack(() => spec?.atTime ?? ui.settings?.effectiveOverdueNagTime ?? '18:00'));

  const maxN = () => validMax(maxText) ?? DEFAULT_MAX;

  function commit(next: ReminderSpec | null) {
    spec = next ? normalize({ ...next, anchor, atTime: timeText }, defaultTime) : null;
    void onnag(spec);
  }

  const FIRST_LABEL = $derived<Record<(typeof FIRST_PRESETS)[number]['id'], string>>({
    h1: t('Nach 1 Std.'),
    d1: t('Morgen'),
    d3: t('Nach 3 Tagen'),
    w1: t('Nach 1 Woche'),
  });
  const REPEAT_LABEL = $derived<Record<(typeof REPEAT_PRESETS)[number]['id'], string>>({
    hourly: t('Stündlich'),
    daily: t('Täglich'),
    weekly: t('Wöchentlich'),
  });
  const UNITS = $derived<[Unit, string][]>([
    ['min', t('Min.')],
    ['h', t('Std.')],
    ['d', t('Tage')],
    ['w', t('Wochen')],
  ]);

  function pickFirst(id: FirstChoice) {
    if (id === 'off') {
      customFirst = false;
      customRepeat = false;
      commit(null);
    } else if (id === 'custom') {
      customFirst = true;
      const s = splitMinutes(spec?.afterMin ?? toMinutes(Number(firstText) || 2, firstUnit));
      firstText = String(s.n);
      firstUnit = s.unit;
      commit({ anchor, afterMin: spec?.afterMin ?? 120, everyMin: spec?.everyMin ?? null, max: maxN(), atTime: timeText });
    } else {
      customFirst = false;
      commit({ anchor, afterMin: FIRST_PRESETS.find((p) => p.id === id)!.min, everyMin: spec?.everyMin ?? null, max: maxN(), atTime: timeText });
    }
  }

  function pickRepeat(id: RepeatChoice) {
    if (!spec) return;
    if (id === 'no') {
      customRepeat = false;
      commit({ ...spec, everyMin: null });
    } else if (id === 'custom') {
      customRepeat = true;
      const s = splitMinutes(spec.everyMin ?? toMinutes(Number(everyText) || 2, everyUnit));
      everyText = String(s.n);
      everyUnit = s.unit;
      commit({ ...spec, everyMin: spec.everyMin ?? 120 });
    } else {
      customRepeat = false;
      commit({ ...spec, everyMin: REPEAT_PRESETS.find((p) => p.id === id)!.min });
    }
  }

  // Eigene Zeit: Zahl und Einheit
  $effect(() => {
    const min = validMinutes(firstText, firstUnit);
    untrack(() => {
      if ((customFirst || firstChoiceOf(spec) === 'custom') && spec && min !== null && min !== spec.afterMin) commit({ ...spec, afterMin: min });
    });
  });
  $effect(() => {
    const min = validMinutes(everyText, everyUnit);
    untrack(() => {
      if ((customRepeat || (spec && repeatChoiceOf(spec) === 'custom')) && spec && spec.everyMin !== null && min !== null && min !== spec.everyMin) commit({ ...spec, everyMin: min });
    });
  });
  $effect(() => {
    const n = validMax(maxText);
    untrack(() => {
      if (spec && spec.everyMin !== null && n !== null && n !== spec.max) commit({ ...spec, max: n });
    });
  });
  function setTime(v: string) {
    if (!/^\d\d:\d\d$/.test(v)) return;
    timeText = v;
    if (spec) commit({ ...spec });
  }

  // Ablauf: die nächsten Zeitpunkte (ab Termin; ohne Termin ab jetzt bzw. ab dem Anlegen)
  const base = $derived(dueAt ? Date.parse(dueAt) : Date.now());
  const steps = $derived(spec ? plan(spec, base, tz, defaultTime) : []);
  const planTitle = $derived(
    dueAt ? t('Dein Ablauf (Termin: {when})', { when: shortWhen(dueAt, tz) }) : fromNow ? t('Dein Ablauf (ab jetzt)') : t('Dein Ablauf (ab dem Anlegen)'),
  );
</script>

<div class="flex flex-col gap-3" data-testid="reminder-editor">
  {#if dueAt}
    <ListRow title={t('Vorher erinnern')} wrap>
      {#snippet meta()}<span>{t('wie bisher')}</span>{/snippet}
      {#snippet right()}
        <SelectField
          variant="box"
          class="!min-h-10"
          value={remindBeforeMin ?? ''}
          label={t('Vorab-Erinnerung')}
          onchange={(e) => void onremind(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
        >
          <option value="">{t('Nur zur Fälligkeit')}</option>
          {#each REMINDERS as m (m)}<option value={m}>{t('{lead} vorher', { lead: formatLead(m) })}</option>{/each}
        </SelectField>
      {/snippet}
    </ListRow>
  {/if}

  <div class="px-1 text-[15px] font-extrabold tracking-tight">{t('Nachhaken, wenn nicht erledigt')}</div>
  <div class="flex flex-wrap gap-2" role="group" aria-label={t('Nachhaken, wenn nicht erledigt')} data-testid="nag-first">
    <Chip active={firstChoice === 'off'} pressed={firstChoice === 'off'} onclick={() => pickFirst('off')}>{t('Aus')}</Chip>
    {#each FIRST_PRESETS as p (p.id)}
      <Chip active={firstChoice === p.id} pressed={firstChoice === p.id} onclick={() => pickFirst(p.id)}>{FIRST_LABEL[p.id]}</Chip>
    {/each}
    <Chip active={firstChoice === 'custom'} pressed={firstChoice === 'custom'} onclick={() => pickFirst('custom')}>{t('Eigene …')}</Chip>
  </div>

  {#if firstChoice === 'custom' && spec}
    <div class="flex items-center gap-2 rounded-row border border-line bg-surface px-3.5 py-3 text-[15px]" data-testid="nag-first-custom">
      <span class="font-bold">{tx('Wiederholung', 'Nach')}</span>
      <NumberField bind:value={firstText} label={t('Zeit bis zum Nachhaken')} />
      <SelectField variant="box" value={firstUnit} label={t('Einheit')} onchange={(e) => { firstUnit = e.currentTarget.value as Unit; }}>
        {#each UNITS as [u, label] (u)}<option value={u}>{label}</option>{/each}
      </SelectField>
    </div>
  {/if}

  {#if spec}
    <div class="px-1 pt-1 text-[15px] font-extrabold tracking-tight">{t('Danach wiederholen?')}</div>
    <div class="flex flex-wrap gap-2" role="group" aria-label={t('Danach wiederholen?')} data-testid="nag-repeat">
      <Chip active={repeatChoice === 'no'} pressed={repeatChoice === 'no'} onclick={() => pickRepeat('no')}>{t('Nein')}</Chip>
      {#each REPEAT_PRESETS as p (p.id)}
        <Chip active={repeatChoice === p.id} pressed={repeatChoice === p.id} onclick={() => pickRepeat(p.id)}>{REPEAT_LABEL[p.id]}</Chip>
      {/each}
      <Chip active={repeatChoice === 'custom'} pressed={repeatChoice === 'custom'} onclick={() => pickRepeat('custom')}>{t('Eigene …')}</Chip>
    </div>

    {#if repeatChoice === 'custom' && spec.everyMin !== null}
      <div class="flex items-center gap-2 rounded-row border border-line bg-surface px-3.5 py-3 text-[15px]" data-testid="nag-repeat-custom">
        <span class="font-bold">{tx('Wiederholung', 'Alle')}</span>
        <NumberField bind:value={everyText} label={t('Abstand')} />
        <SelectField variant="box" value={everyUnit} label={t('Einheit')} onchange={(e) => { everyUnit = e.currentTarget.value as Unit; }}>
          {#each UNITS as [u, label] (u)}<option value={u}>{label}</option>{/each}
        </SelectField>
      </div>
    {/if}

    {#if usesClock(spec)}
      <ListRow title={t('Uhrzeit')} wrap>
        {#snippet right()}
          <input type="time" class="h-10 rounded-xl border border-track bg-bg px-2 text-[15px] font-bold" value={spec?.atTime ?? timeText} aria-label={t('Uhrzeit')} onchange={(e) => setTime(e.currentTarget.value)} />
        {/snippet}
      </ListRow>
    {/if}

    {#if spec.everyMin !== null}
      <ListRow title={t('Höchstens')} wrap>
        {#snippet right()}<NumberField bind:value={maxText} label={t('Höchstens so oft')} unit="×" />{/snippet}
      </ListRow>
    {/if}

    <div class="rounded-row border border-accent/40 bg-surface px-3.5 py-3" data-testid="nag-plan">
      <div class="text-[13px] text-fg2">{planTitle}</div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each steps as s, i (i)}
          <span class="inline-flex h-[28px] items-center rounded-full bg-surface2 px-2.5 text-[13px] font-semibold {s.gap ? 'text-fg2' : ''}">{s.last ? `${s.when} ${t('(letzte)')}` : s.when}</span>
        {/each}
      </div>
    </div>
    <p class="px-1 text-[13px] text-fg2" data-testid="nag-hint">{t('Mit der Erledigung endet alles automatisch. Ruhezeiten gelten. Nur für dich.')}</p>
  {/if}
</div>
