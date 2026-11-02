<script module lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { CarryField, Priority } from '../lib/api';
  import type { Recurrence } from '../lib/recurrence';

  /** Die Felder, die eine neue und eine bestehende Karte gemeinsam haben */
  export interface CardFields {
    columnId: string;
    assigneeIds: string[];
    dueAt: string | null;
    recurrence: Recurrence | null;
    remindBeforeMin: number | null;
    overdueNag: boolean;
    priority: Priority | null;
    categoryIds: string[];
    costCents: number | null;
    /** gesetzt, wenn die Karte erledigt ist: dann ist der Termin nicht mehr „überfällig" */
    completedAt?: string | null;
    /** Was die nächste Karte übernimmt; ohne Angabe gilt die Voreinstellung */
    carryOver?: CarryField[];
  }
</script>

<script lang="ts">
  import type { CardPatch, Column } from '../lib/api';
  import { formatCost, formatDue, formatLead, fromInputValue, isOverdue, parseCost, toInputValue } from '../lib/datetime';
  import { DEFAULT_CARRY } from '../lib/carry';
  import { describeRecurrence } from '../lib/recurrence';
  import { toast, ui } from '../lib/store.svelte';
  import CategoryPicker from './CategoryPicker.svelte';
  import Icon from './Icon.svelte';
  import PeoplePicker from './PeoplePicker.svelte';
  import RecurrenceEditor from './RecurrenceEditor.svelte';
  import SelectField from './SelectField.svelte';

  let {
    card,
    targets,
    onsave,
    onmove,
  }: {
    card: CardFields;
    /** Spalten, die zur Wahl stehen */
    targets: Column[];
    /** Speichert eine Änderung und gibt den neuen Stand zurück (undefined bei Fehler) */
    onsave: (patch: CardPatch) => Promise<{ dueAt: string | null } | undefined | void>;
    onmove: (columnId: string) => void;
  } = $props();

  const column = $derived(ui.view?.columns.find((c) => c.id === card.columnId));
  // Eine erledigte Karte ist nicht überfällig, auch wenn ihr Termin in der Vergangenheit liegt
  const late = $derived(isOverdue(card.dueAt) && !card.completedAt && !column?.isDone);

  // Welches Eigenschaftsfeld unter den Chips offen ist (immer nur eines)
  let panel = $state<string | null>(null);
  const toggle = (name: string) => (panel = panel === name ? null : name);
  const people = $derived(ui.people.filter((p) => card.assigneeIds.includes(p.id)));
  const catNames = $derived((ui.view?.categories ?? []).filter((c) => card.categoryIds.includes(c.id)).map((c) => c.name));

  const PRIORITIES: [Priority | null, string][] = $derived([
    [null, t('Keine')],
    ['low', t('Niedrig')],
    ['medium', t('Mittel')],
    ['high', t('Hoch')],
  ]);
  const REMINDERS = [15, 30, 60, 120, 1440, 2880];

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
</script>

{#snippet chip(name: string, icon: string, text: string, filled: boolean, tone = '')}
  <button
    type="button"
    class="flex min-h-10 max-w-full items-center gap-1.5 rounded-full px-3.5 text-[15px] {panel === name
      ? 'bg-accent font-semibold text-on-accent'
      : filled
        ? `bg-surface2 text-fg ${tone}`
        : 'border border-dashed border-line text-fg2'}"
    aria-expanded={panel === name}
    onclick={() => toggle(name)}
  >
    <Icon name={icon} size={16} /><span class="truncate">{text}</span>
  </button>
{/snippet}

<!-- Eigenschaften als kleine Chips: leer gestrichelt, gefüllt mit Wert. Antippen öffnet darunter ein Feld. -->
<div class="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('Eigenschaften')}>
  <label class="relative flex min-h-10 items-center gap-1.5 rounded-full bg-surface2 px-3.5 text-[15px]">
    <Icon name="columns" size={16} />{column?.name ?? 'Status'}<Icon name="chevron-down" size={14} />
    <select
      class="absolute inset-0 h-full w-full opacity-0"
      value={card.columnId}
      aria-label={t('Status der Karte')}
      onchange={(e) => onmove(e.currentTarget.value)}
    >
      {#each targets as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
  </label>

  {@render chip('who', 'user', people.length ? people.map((p) => p.displayName).join(' & ') : t('Zuständig'), people.length > 0)}
  {@render chip(
    'due',
    'clock',
    card.dueAt ? formatDue(card.dueAt) + (late ? ` · ${t('überfällig')}` : '') : t('Fälligkeit'),
    !!card.dueAt,
    late ? 'text-danger' : '',
  )}
  {#if card.dueAt}
    {@render chip('rec', 'repeat', card.recurrence ? describeRecurrence(card.recurrence) : t('Wiederholen'), !!card.recurrence)}
    {@render chip(
      'rem',
      'bell',
      card.remindBeforeMin ? t('{lead} vorher', { lead: formatLead(card.remindBeforeMin) }) : card.overdueNag ? t('Nachhaken') : t('Erinnerung'),
      !!card.remindBeforeMin || card.overdueNag,
    )}
  {/if}
  {@render chip('prio', 'flag', card.priority ? (PRIORITIES.find((p) => p[0] === card.priority)?.[1] ?? '') : t('Priorität'), !!card.priority)}
  {@render chip('cat', 'tag', catNames.length ? catNames.join(', ') : t('Kategorie'), catNames.length > 0)}
  {@render chip('cost', 'euro', card.costCents !== null ? formatCost(card.costCents) : t('Kosten'), card.costCents !== null)}
</div>

{#if panel}
  <div class="mt-3 rounded-[18px] border border-line bg-surface p-4">
    {#if panel === 'who'}
      <PeoplePicker selected={card.assigneeIds} onchange={(ids) => onsave({ assigneeIds: ids })} />
      <p class="mt-3 text-[13px] text-fg2">{t('Benachrichtigt werden nur zugewiesene Personen.')}</p>
    {:else if panel === 'due'}
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
    {:else if panel === 'rec'}
      <RecurrenceEditor
        value={card.recurrence}
        dueAt={card.dueAt}
        carryOver={card.carryOver ?? DEFAULT_CARRY}
        onchange={(rule: Recurrence | null) => onsave({ recurrence: rule })}
        oncarry={(fields: CarryField[]) => onsave({ carryOver: fields })}
      />
    {:else if panel === 'rem'}
      <label class="flex items-center justify-between gap-3">
        <span class="text-[16px]">{t('Vorab erinnern')}</span>
        <SelectField
          variant="box"
          class="!min-h-10"
          value={card.remindBeforeMin ?? ''}
          label={t('Vorab-Erinnerung')}
          onchange={(e) => onsave({ remindBeforeMin: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
        >
          <option value="">{t('Nur zur Fälligkeit')}</option>
          {#each REMINDERS as m (m)}<option value={m}>{t('{lead} vorher', { lead: formatLead(m) })}</option>{/each}
        </SelectField>
      </label>
      <label class="mt-3 flex items-center justify-between gap-3">
        <span class="text-[16px]">{t('Täglich nachhaken, solange überfällig')}</span>
        <input
          type="checkbox"
          class="h-6 w-6 accent-[var(--accent)]"
          checked={card.overdueNag}
          onchange={(e) => onsave({ overdueNag: e.currentTarget.checked })}
        />
      </label>
    {:else if panel === 'prio'}
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
    {:else if panel === 'cat'}
      <CategoryPicker selected={card.categoryIds} onchange={(ids) => onsave({ categoryIds: ids })} />
    {:else if panel === 'cost'}
      <input
        inputmode="decimal"
        placeholder={t('z. B. 49,90')}
        class="min-h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-[17px]"
        aria-label={t('Kosten in Euro')}
        bind:value={costDraft}
        onfocus={() => (editingCost = true)}
        onblur={saveCost}
      />
    {/if}
  </div>
{/if}
