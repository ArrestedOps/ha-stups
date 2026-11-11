<script lang="ts">
  import { clock } from '../../lib/clock.svelte';
  import type { Column } from '../../lib/api';
  import { deviceTz, formatLead } from '../../lib/datetime';
  import { summaryTitle } from '../../lib/dateSheet';
  import { t } from '../../lib/i18n/index.svelte';
  import { dayOfMonth, names } from '../../lib/i18n/names';
  import { describeRecurrence } from '../../lib/recurrence';
  import { personById, ui } from '../../lib/store.svelte';
  import type { CardFields } from '../CardProps.svelte';
  import Icon from '../Icon.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import Tile from '../ui/Tile.svelte';

  /**
   * „Wann und wo": Board und Spalte, Termin, Wiederholung, Erinnerung der neuen Karte. Die Fenster dazu öffnet der Aufrufer (`onopen`):
   * sie gehören neben das Blatt, nicht in dessen Formular.
   */
  let {
    fields,
    columns,
    onpickcolumn,
    onopen,
  }: { fields: CardFields; columns: Column[]; onpickcolumn: (id: string) => void; onopen: (what: 'date' | 'repeat' | 'remind') => void } = $props();

  const tz = deviceTz();
  const board = $derived(ui.boards.find((b) => b.id === ui.boardId));
  // „Geplant" sortiert sich nach dem Termin von selbst, darum steht es nur zur Wahl, wenn man dort anlegt
  const choices = $derived(columns.filter((c) => !c.isPlanned || c.id === fields.columnId));
  const column = $derived(columns.find((c) => c.id === fields.columnId));
  const assignees = $derived(fields.assigneeIds.map(personById).filter((p) => p !== undefined));

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
  const remindTitle = $derived(
    fields.remindBeforeMin !== null ? t('Erinnern {lead} vorher', { lead: formatLead(fields.remindBeforeMin) }) : fields.reminder ? t('Nachhaken, wenn nicht erledigt') : t('Keine Erinnerung'),
  );
  const remindMeta = $derived(
    fields.reminder
      ? `${t('Nur für dich')} • ${fields.reminder.everyMin === null ? t('einmal') : t('bis zu {n} ×', { n: fields.reminder.max })}`
      : assignees.length
        ? t('Push an {names}', { names: assignees.map((p) => (p.id === ui.me?.id ? t('dich') : p.displayName)).join(' & ') })
        : t('Niemand zuständig, keine Erinnerung'),
  );
</script>

{#snippet go()}
  <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>
{/snippet}

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
      onchange={(e) => onpickcolumn(e.currentTarget.value)}
    >
      {#each choices as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
  </div>

  <ListRow title={dueTitle} onclick={() => onopen('date')} label={t('Termin wählen, gerade: {when}', { when: dueTitle })}>
    {#snippet tile()}<Tile color="red"><Icon name="calendar" size={24} /></Tile>{/snippet}
    {#snippet meta()}<span class="truncate">{dueMeta}</span>{/snippet}
    {#snippet right()}{@render go()}{/snippet}
  </ListRow>

  <ListRow title={recurTitle} onclick={() => onopen('repeat')} label={t('Wiederholung wählen, gerade: {rule}', { rule: recurTitle })}>
    {#snippet tile()}<Tile color="teal"><Icon name="repeat" size={24} /></Tile>{/snippet}
    {#snippet meta()}<span class="truncate">{recurMeta}</span>{/snippet}
    {#snippet right()}{@render go()}{/snippet}
  </ListRow>

  <ListRow title={remindTitle} onclick={() => onopen('remind')} label={t('Erinnerung wählen, gerade: {what}', { what: remindTitle })}>
    {#snippet tile()}<Tile color="blue"><Icon name="bell" size={24} /></Tile>{/snippet}
    {#snippet meta()}<span class="truncate">{remindMeta}</span>{/snippet}
    {#snippet right()}{@render go()}{/snippet}
  </ListRow>
</div>
