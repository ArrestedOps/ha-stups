<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { CarryField } from '../lib/api';
  import { DEFAULT_CARRY } from '../lib/carry';
  import type { Recurrence } from '../lib/recurrence';
  import RecurrenceEditor from './RecurrenceEditor.svelte';
  import Sheet from './Sheet.svelte';

  /** „Wiederholung“ als eigenes Fenster (aus der Zeile in Neue Aufgabe): der Editor der Karte, jede Änderung gilt sofort */
  let {
    value,
    dueAt,
    carryOver,
    onchange,
    oncarry,
    onclose,
  }: {
    value: Recurrence | null;
    dueAt: string | null;
    carryOver?: CarryField[];
    onchange: (rule: Recurrence | null) => void;
    oncarry: (fields: CarryField[]) => void;
    onclose: () => void;
  } = $props();
</script>

{#snippet done()}
  <button type="button" class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text" onclick={onclose}>{t('Fertig')}</button>
{/snippet}

<Sheet title={t('Wiederholung')} {onclose} hideClose right={done}>
  <div class="rounded-row border border-line bg-surface p-4">
    <RecurrenceEditor {value} {dueAt} carryOver={carryOver ?? DEFAULT_CARRY} {onchange} {oncarry} />
  </div>
</Sheet>
