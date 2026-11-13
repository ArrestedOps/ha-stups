<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { ReminderSpec } from '../lib/reminder';
  import ReminderEditor from './ReminderEditor.svelte';
  import Sheet from './Sheet.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /** „Erinnerung“ als eigenes Fenster (aus der Glockenzeile in Neue Aufgabe): der Editor der Aufgabe, jede Änderung gilt sofort */
  let {
    dueAt,
    remindBeforeMin,
    reminder,
    onremind,
    onnag,
    onclose,
  }: {
    dueAt: string | null;
    remindBeforeMin: number | null;
    reminder: ReminderSpec | null;
    onremind: (min: number | null) => unknown;
    onnag: (spec: ReminderSpec | null) => unknown;
    onclose: () => void;
  } = $props();
</script>

{#snippet foot()}
  <CtaButton onclick={onclose}>{t('Fertig')}</CtaButton>
{/snippet}

<Sheet title={t('Erinnerung')} {onclose} hideClose footer={foot}>
  <ReminderEditor {dueAt} {remindBeforeMin} {reminder} {onremind} {onnag} />
</Sheet>
