<script module lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { CarryField, Priority } from '../lib/api';
  import type { Recurrence } from '../lib/recurrence';
  import type { ReminderSpec } from '../lib/reminder';

  /** Die Felder, die eine neue und eine bestehende Aufgabe gemeinsam haben */
  export interface CardFields {
    columnId: string;
    assigneeIds: string[];
    dueAt: string | null;
    recurrence: Recurrence | null;
    remindBeforeMin: number | null;
    /** mein Nachhaken (persönlich); null = keins */
    reminder: ReminderSpec | null;
    priority: Priority | null;
    effort?: Effort | null;
    categoryIds: string[];
    costCents: number | null;
    /** gesetzt, wenn die Aufgabe erledigt ist: dann ist der Termin nicht mehr „überfällig" */
    completedAt?: string | null;
    /** Was die nächste Aufgabe übernimmt; ohne Angabe gilt die Voreinstellung */
    carryOver?: CarryField[];
    /** Bestätigung beim Erledigen durch ein Kind; fehlt bei einer neuen Aufgabe (dort gibt es die Wahl noch nicht) */
    confirm?: 'on' | 'off' | null;
  }
</script>

<script lang="ts">
  import type { CardPatch, Column, Effort } from '../lib/api';
  import { formatCost, formatDue, formatLead, fromInputValue, isOverdue, parseCost, toInputValue } from '../lib/datetime';
  import { DEFAULT_CARRY } from '../lib/carry';
  import { describeRecurrence } from '../lib/recurrence';
  import { toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import CategoryPicker from './CategoryPicker.svelte';
  import DateSheet from './DateSheet.svelte';
  import Icon from './Icon.svelte';
  import PeoplePicker from './PeoplePicker.svelte';
  import RecurrenceEditor from './RecurrenceEditor.svelte';
  import ReminderEditor from './ReminderEditor.svelte';

  let {
    card,
    targets,
    onsave,
    onmove,
    readonly = false,
  }: {
    card: CardFields;
    /** Spalten, die zur Wahl stehen */
    targets: Column[];
    /** Speichert eine Änderung und gibt den neuen Stand zurück (undefined bei Fehler) */
    onsave: (patch: CardPatch) => Promise<{ dueAt: string | null } | undefined | void>;
    onmove: (columnId: string) => void;
    /** Nur ansehen (Rolle „Kind"): eine Zeile mit den Werten statt der Knöpfe */
    readonly?: boolean;
  } = $props();

  const column = $derived(ui.view?.columns.find((c) => c.id === card.columnId));
  // Eine erledigte Aufgabe ist nicht überfällig, auch wenn ihr Termin in der Vergangenheit liegt
  const late = $derived(isOverdue(card.dueAt) && !card.completedAt && !column?.isDone);

  // Welches Eigenschaftsfeld unter den Chips offen ist (immer nur eines)
  let panel = $state<string | null>(null);
  const toggle = (name: string) => (panel = panel === name ? null : name);
  const people = $derived(ui.people.filter((p) => card.assigneeIds.includes(p.id)));
  const cats = $derived((ui.view?.categories ?? []).filter((c) => card.categoryIds.includes(c.id)));
  const catNames = $derived(cats.map((c) => c.name));

  const PRIORITIES: [Priority | null, string][] = $derived([
    [null, t('Keine')],
    ['low', t('Niedrig')],
    ['medium', t('Mittel')],
    ['high', t('Hoch')],
  ]);
  const EFFORTS: [Effort | null, string][] = $derived([
    [null, t('Nicht angegeben')],
    ['small', t('Klein')],
    ['medium', t('Mittel')],
    ['large', t('Groß')],
  ]);
  const effortLabel = $derived(card.effort ? (EFFORTS.find((e) => e[0] === card.effort)?.[1] ?? '') : t('Aufwand'));

  // Bestätigung: nur sinnvoll, wenn der Aufgabe ein Kind zugewiesen ist
  const hasChild = $derived(ui.people.some((p) => p.isChild && card.assigneeIds.includes(p.id)));
  const CONFIRMS: [('on' | 'off') | null, string][] = $derived([
    [null, t('Vorgabe der Person')],
    ['on', t('Immer bestätigen')],
    ['off', t('Nie bestätigen')],
  ]);
  const confirmLabel = $derived(card.confirm === 'on' ? t('Mit Bestätigung') : card.confirm === 'off' ? t('Ohne Bestätigung') : t('Bestätigung'));

  // Kosten: wird beim Verlassen des Feldes übernommen
  let costDraft = $state('');
  let editingCost = $state(false);
  $effect(() => {
    if (!editingCost) costDraft = card.costCents === null ? '' : (card.costCents / 100).toFixed(2).replace('.', ',');
  });

  function saveCost() {
    editingCost = false;
    const cents = parseCost(costDraft);
    if (Number.isNaN(cents)) {
      toast(t('Bitte einen Betrag wie 49,90 eingeben'), { tone: 'error' });
      return;
    }
    if (cents !== card.costCents) void onsave({ costCents: cents });
  }

  // Nach jeder Terminänderung sagt ein Hinweis, was jetzt gilt, sonst sieht man es kaum
  async function saveDue(patch: CardPatch) {
    const unassigned = card.assigneeIds.length === 0;
    const res = await onsave(patch);
    if (!res) return;
    if (!res.dueAt) {
      toast(t('Termin entfernt'));
    } else if (unassigned) {
      // Erinnerungen gehen nur an Zuständige: ohne sie kommt zur Fälligkeit nichts, das merkt man sonst erst zu spät
      const me = ui.me?.isPerson ? ui.me : null;
      toast(t('Fällig: {when}. Niemand ist zuständig, deshalb gibt es keine Erinnerung.', { when: formatDue(res.dueAt) }), {
        action: me ? { label: t('Mir zuweisen'), run: () => void onsave({ assigneeIds: [me.id] }) } : undefined,
      });
    } else {
      toast(t('Fällig: {when}', { when: formatDue(res.dueAt) }));
    }
  }

  function setDue(value: string) {
    const iso = fromInputValue(value);
    if (iso) void saveDue({ dueAt: iso });
  }

  const quickValue = (daysAhead: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return `${toInputValue(d.toISOString()).slice(0, 10)}T${String(hour).padStart(2, '0')}:00`;
  };

  function quickDue(daysAhead: number, hour: number) {
    void saveDue({ dueAt: fromInputValue(quickValue(daysAhead, hour)) });
  }

  function clearDue() {
    void saveDue({ dueAt: null, recurrence: null, remindBeforeMin: null });
  }

  // „Termin wählen“: Monatskalender und Uhrzeit-Rad (Termin-Fenster)
  let dateOpen = $state(false);
</script>

{#if readonly}
  <!-- Rolle „Kind": die Werte nur zum Ansehen (Aufwand und Kosten gehören nicht dazu) -->
  <div class="flex flex-wrap gap-2" role="group" aria-label={t('Eigenschaften')} data-testid="card-props-readonly">
    <span class="flex h-[34px] items-center gap-1.5 rounded-full border border-line-chip bg-surface px-3 text-[13px] font-semibold text-text-soft"><Icon name="kanban" size={16} stroke={2} />{column?.name ?? 'Status'}</span>
    {#if people.length}
      <span class="flex h-[34px] items-center gap-1.5 rounded-full border border-line-chip bg-surface px-3 text-[13px] font-semibold text-text-soft"><Icon name="user" size={16} />{people.map((p) => p.displayName).join(' & ')}</span>
    {/if}
    {#if card.dueAt}
      <span class="flex h-[34px] items-center gap-1.5 rounded-full border border-line-chip bg-surface px-3 text-[13px] font-semibold {late ? 'text-danger' : 'text-text-soft'}">
        <Icon name="clock" size={16} />{formatDue(card.dueAt)}{late ? ` · ${t('überfällig')}` : ''}
      </span>
    {/if}
    {#if card.recurrence}
      <span class="flex h-[34px] items-center gap-1.5 rounded-full border border-line-chip bg-surface px-3 text-[13px] font-semibold text-text-soft"><Icon name="repeat" size={16} />{describeRecurrence(card.recurrence)}</span>
    {/if}
    {#if card.priority}
      <span class="flex h-[34px] items-center gap-1.5 rounded-full border border-line-chip bg-surface px-3 text-[13px] font-semibold text-text-soft"><Icon name="flag" size={16} />{PRIORITIES.find((p) => p[0] === card.priority)?.[1] ?? ''}</span>
    {/if}
    {#if catNames.length}
      <span class="flex h-[34px] items-center gap-1.5 rounded-full border border-line-chip bg-surface px-3 text-[13px] font-semibold text-text-soft"><Icon name="tag" size={16} />{catNames.join(', ')}</span>
    {/if}
  </div>
{:else}
<!-- Eigenschaften als gruppierte Liste wie in iOS: links der Name, rechts der Wert. Antippen klappt darunter das Feld auf (immer nur eines). -->
<div class="list-group kv mt-0" role="group" aria-label={t('Eigenschaften')}>
  <div>
    <label class="relative flex min-h-[46px] items-center gap-3 px-4 text-[16px]">
      <span class="flex-1">{t('Status')}</span>
      <span class="flex min-w-0 items-center gap-1.5 truncate text-fg2"><Icon name="kanban" size={16} stroke={2} />{column?.name ?? 'Status'}</span>
      <span class="flex shrink-0 text-dim"><Icon name="chevron-right" size={16} stroke={2.2} /></span>
      <select class="absolute inset-0 h-full w-full opacity-0" value={card.columnId} aria-label={t('Status der Aufgabe')} onchange={(e) => onmove(e.currentTarget.value)}>
        {#each targets as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </label>
  </div>

  {@render row('due', t('Fällig'), card.dueAt ? formatDue(card.dueAt) + (late ? ` · ${t('überfällig')}` : '') : t('Kein Termin'), late ? 'text-danger' : '')}
  {@render row('who', t('Zuständig'), people.length ? people.map((p) => p.displayName).join(' & ') : t('Niemand'), '', true)}
  {@render row('rec', t('Wiederholung'), card.recurrence ? describeRecurrence(card.recurrence) : t('Nie'))}
  {@render row('rem', t('Erinnerung'), card.remindBeforeMin ? t('{lead} vorher', { lead: formatLead(card.remindBeforeMin) }) : card.reminder ? t('Nachhaken') : t('Keine'))}
  {@render row('prio', t('Priorität'), card.priority ? (PRIORITIES.find((p) => p[0] === card.priority)?.[1] ?? '') : t('Normal'))}
  {@render row('cat', t('Kategorie'), catNames.length ? catNames.join(', ') : t('Keine'))}
  {@render row('effort', t('Aufwand'), card.effort ? (EFFORTS.find((e) => e[0] === card.effort)?.[1] ?? '') : t('Nicht angegeben'))}
  {@render row('cost', t('Kosten'), card.costCents !== null ? formatCost(card.costCents) : t('Nicht angegeben'))}
  {#if card.confirm !== undefined && hasChild}
    {@render row('confirm', t('Bestätigung'), confirmLabel === t('Bestätigung') ? t('Vorgabe der Person') : confirmLabel)}
  {/if}
</div>
{/if}

{#snippet row(name: string, label: string, value: string, tone = '', avatars = false)}
  <div>
    <button
      type="button"
      class="flex min-h-[46px] w-full items-center gap-3 px-4 text-left text-[16px]"
      aria-expanded={panel === name}
      aria-label="{label}: {value}"
      onclick={() => toggle(name)}
    >
      <span class="flex-1">{label}</span>
      {#if avatars && people.length}
        <span class="flex shrink-0 items-center -space-x-1.5" aria-hidden="true">
          {#each people.slice(0, 4) as p (p.id)}<Avatar person={p} size={26} ring={1.5} />{/each}
        </span>
      {:else}
        <span class="min-w-0 truncate text-right {tone || 'text-fg2'}" aria-hidden="true">{value}</span>
      {/if}
      <span class="flex shrink-0 text-dim transition-transform {panel === name ? 'rotate-90' : ''}"><Icon name="chevron-right" size={16} stroke={2.2} /></span>
    </button>
    {#if panel === name}
      <div class="px-4 pt-1 pb-4">{@render editor(name)}</div>
    {/if}
  </div>
{/snippet}

{#snippet editor(name: string)}
    {#if name === 'who'}
      <PeoplePicker selected={card.assigneeIds} onchange={(ids) => onsave({ assigneeIds: ids })} />
      <p class="mt-3 text-[13px] text-fg2">{t('Benachrichtigt werden nur zugewiesene Personen.')}</p>
    {:else if name === 'due'}
      <div class="flex flex-wrap gap-2">
        {#each [[0, 18, t('Heute 18:00')], [1, 9, t('Morgen 09:00')]] as [days, hour, label] (label)}
          <button
            type="button"
            class="min-h-11 rounded-xl px-4 text-[15px] font-semibold {toInputValue(card.dueAt) === quickValue(days as number, hour as number)
              ? 'bg-accent text-on-accent'
              : 'bg-surface2'}"
            aria-pressed={toInputValue(card.dueAt) === quickValue(days as number, hour as number)}
            onclick={() => quickDue(days as number, hour as number)}
          >
            {label}
          </button>
        {/each}
        <button type="button" class="min-h-11 rounded-xl bg-surface2 px-4 text-[15px] font-semibold" onclick={() => (dateOpen = true)}>
          {t('Kalender …')}
        </button>
        {#if card.dueAt}
          <button type="button" class="min-h-11 rounded-xl bg-surface2 px-4 text-[15px] font-semibold text-danger" onclick={clearDue}>{t('Entfernen')}</button>
        {/if}
      </div>
      <label class="mt-3 flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-fg2">{t('Anderes Datum und Uhrzeit')}</span>
        <input
          type="datetime-local"
          class="min-h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-[17px]"
          value={toInputValue(card.dueAt)}
          aria-label={t('Fälligkeit mit Datum und Uhrzeit')}
          onchange={(e) => setDue(e.currentTarget.value)}
        />
      </label>
      {#if !card.dueAt}<p class="mt-3 text-[13px] text-fg2">{t('Mit einem Termin kannst du auch wiederholen und erinnern.')}</p>{/if}
    {:else if name === 'rec'}
      <RecurrenceEditor
        value={card.recurrence}
        dueAt={card.dueAt}
        carryOver={card.carryOver ?? DEFAULT_CARRY}
        onchange={(rule: Recurrence | null, autoDue?: string) => onsave({ recurrence: rule, ...(autoDue ? { dueAt: autoDue } : {}) })}
        oncarry={(fields: CarryField[]) => onsave({ carryOver: fields })}
      />
    {:else if name === 'rem'}
      <ReminderEditor
        fromNow
        dueAt={card.dueAt}
        remindBeforeMin={card.remindBeforeMin}
        reminder={card.reminder}
        onremind={(min) => onsave({ remindBeforeMin: min })}
        onnag={(spec) => onsave({ reminder: spec })}
      />
    {:else if name === 'prio'}
      <div class="flex flex-wrap gap-2" role="group" aria-label={t('Priorität')}>
        {#each PRIORITIES as [value, label] (label)}
          <button
            type="button"
            class="min-h-11 rounded-xl px-4 text-[15px] font-semibold {card.priority === value
              ? value === 'high'
                ? 'cat cat-red !px-4 !text-[15px]'
                : 'bg-accent text-on-accent'
              : 'bg-surface2'}"
            aria-pressed={card.priority === value}
            onclick={() => onsave({ priority: value })}
          >
            {label}
          </button>
        {/each}
      </div>
    {:else if name === 'effort'}
      <div class="flex flex-wrap gap-2" role="group" aria-label={t('Aufwand')}>
        {#each EFFORTS as [value, label] (label)}
          <button
            type="button"
            class="min-h-11 rounded-xl px-4 text-[15px] font-semibold {card.effort === value || (!card.effort && value === null) ? 'bg-accent text-on-accent' : 'bg-surface2'}"
            aria-pressed={card.effort === value || (!card.effort && value === null)}
            onclick={() => onsave({ effort: value })}
          >
            {label}
          </button>
        {/each}
      </div>
      <p class="mt-3 text-[13px] text-fg2">{t('Zählt in der Fairness-Ansicht: eine große Aufgabe wiegt mehr als eine kleine. Ohne Angabe zählt sie wie „Mittel“.')}</p>
    {:else if name === 'cat'}
      <CategoryPicker selected={card.categoryIds} onchange={(ids) => onsave({ categoryIds: ids })} />
    {:else if name === 'cost'}
      <input
        inputmode="decimal"
        placeholder={t('z. B. 49,90')}
        class="min-h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-[17px]"
        aria-label={t('Kosten in Euro')}
        bind:value={costDraft}
        onfocus={() => (editingCost = true)}
        onblur={saveCost}
      />
    {:else if name === 'confirm'}
      <div class="flex flex-wrap gap-2" role="group" aria-label={t('Bestätigung')}>
        {#each CONFIRMS as [value, label] (label)}
          <button
            type="button"
            class="min-h-11 rounded-xl px-4 text-[15px] font-semibold {card.confirm === value ? 'bg-accent text-on-accent' : 'bg-surface2'}"
            aria-pressed={card.confirm === value}
            onclick={() => onsave({ confirm: value })}
          >
            {label}
          </button>
        {/each}
      </div>
      <p class="mt-3 text-[13px] text-fg2">{t('Ist die Aufgabe einem Kind zugewiesen, kann „Erledigt“ erst nach einem Ja der Eltern zählen. „Vorgabe der Person“ folgt der Einstellung unter Personen & Zugriff.')}</p>
    {/if}
{/snippet}

{#if dateOpen}
  <DateSheet
    value={card.dueAt}
    onpick={(iso) => {
      dateOpen = false;
      if (iso) void saveDue({ dueAt: iso });
      else clearDue();
    }}
    onclose={() => (dateOpen = false)}
  />
{/if}
