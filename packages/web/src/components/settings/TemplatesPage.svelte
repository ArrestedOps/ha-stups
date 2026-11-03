<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte';
  import TemplateSettings from '../TemplateSettings.svelte';
  import Page from './Page.svelte';
</script>

<!-- Board-Vorlagen: das geöffnete Board als Vorlage speichern, eigene Vorlagen verwalten -->
<Page title={t('Vorlagen')}><TemplateSettings /></Page>
