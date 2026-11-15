<script lang="ts">
  import { closeSheet, openNewWatcher } from '../lib/store.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import FoundList from './FoundList.svelte';
  import Sheet from './Sheet.svelte';

  /** Gefunden: das Fenster um die Liste (FoundList.svelte). „Einrichten" öffnet den Assistenten, „Zurück" dort führt hierher zurück. */
  const asHit = (s: WatcherSuggestion) => ({ entityId: s.entityId, name: s.name, reason: s.reason, ...(s.unit ? { unit: s.unit } : {}), ...(s.draft ? { draft: s.draft } : {}) });
  const setup = (s: WatcherSuggestion) => openNewWatcher({ template: s.templateId, from: 'found', hit: asHit(s) });
  /** Mehrere Treffer derselben Art: der Assistent richtet sie gemeinsam ein (Schritt 1 zeigt die Liste der Geräte) */
  const setupMany = (list: WatcherSuggestion[]) =>
    openNewWatcher({
      template: list[0]!.templateId,
      from: 'found',
      hit: asHit(list[0]!),
      hits: list.map(asHit),
    });
  const template = (tpl: WatcherTemplate) => openNewWatcher({ template: tpl.id, from: 'found' });
</script>

<Sheet title={t('Gefunden')} onclose={closeSheet}>
  <FoundList onsetup={setup} ontemplate={template} onsetupmany={setupMany} />
</Sheet>
