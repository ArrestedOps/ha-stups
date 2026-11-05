<script lang="ts">
  import { openFeedback } from '../lib/feedbackSheet.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import Icon from './Icon.svelte';

  /** Leiser Einstieg ins Feedback am Ende einer Liste: ein Textknopf mit Sprechblase, kein Kasten */
  let { testid = 'feedback-link' }: { testid?: string } = $props();
</script>

<div class="flex justify-center pt-1 pb-2">
  <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-text-soft2" data-testid={testid} onclick={() => openFeedback()}>
    <Icon name="message" size={18} stroke={1.9} />{t('Fehler gefunden oder eine Idee? Sag es uns')}
  </button>
</div>
