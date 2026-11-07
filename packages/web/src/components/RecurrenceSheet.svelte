<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { CarryField } from '../lib/api';
  import { DEFAULT_CARRY } from '../lib/carry';
  import type { Recurrence } from '../lib/recurrence';
  import RecurrenceEditor from './RecurrenceEditor.svelte';
  import Sheet from './Sheet.svelte';
  import CtaButton from './ui/CtaButton.svelte';

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
    onchange: (rule: Recurrence | null, autoDue?: string) => void;
    oncarry: (fields: CarryField[]) => void;
    onclose: () => void;
  } = $props();
</script>

{#snippet foot()}
  <CtaButton onclick={onclose}>{t('Fertig')}</CtaButton>
{/snippet}

<Sheet title={t('Wiederholung')} {onclose} hideClose footer={foot}>
  <RecurrenceEditor {value} {dueAt} carryOver={carryOver ?? DEFAULT_CARRY} {onchange} {oncarry} />
</Sheet>
