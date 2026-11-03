<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { closeSheet } from '../lib/store.svelte';
  import FairnessView from './FairnessView.svelte';
  import Sheet from './Sheet.svelte';
</script>

<!-- „Diese Woche": wer erledigt wie viel, ohne Rangliste (erreichbar über „Bei den anderen" auf Heute; ein Kind sieht sie nicht) -->
<Sheet title={t('Diese Woche')} onclose={closeSheet}>
  <div class="px-1 pb-4"><FairnessView /></div>
</Sheet>
