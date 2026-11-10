<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { assignees, next, ob, watcherSaved } from '../lib/onboarding.svelte';
  import { ui, type NewWatcherRequest } from '../lib/store.svelte';
  import { WatcherEditor } from '../lib/watcher-editor.svelte';
  import type { SavedWatcher, WatcherSuggestion, WatcherTemplate } from '../lib/watcher-types';
  import FoundList from './FoundList.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import WatcherDesk from './WatcherDesk.svelte';
  import WatcherSheet from './WatcherSheet.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /**
   * Schritt „Dein erster Wächter": 1:1 die App. Dieselbe „Gefunden"-Liste wie unter Wächter › Gefunden; „Einrichten" öffnet am Handy denselben
   * Assistenten „Neuer Wächter" (Wenn, Dann, Wer, Feinschliff), am Desktop denselben Editor wie im Reiter Wächter. Nur zwei Dinge sind anders:
   * „Wer kommt infrage?" ist mit den Personen aus dem ersten Schritt vorgewählt (ohne Kinder), und nach „Wächter anlegen" geht es mit der
   * Testnachricht weiter, statt zurück zur Liste. „Ohne Wächter weiter" überspringt den Schritt.
   */
  let request = $state.raw<NewWatcherRequest | null>(null);
  let deskEditor = $state.raw<WatcherEditor | null>(null);
  let deskRef = $state<{ requestClose(): void }>();

  function close() {
    request = null;
    deskEditor = null;
  }

  function saved(w: SavedWatcher) {
    watcherSaved(w);
    close();
    next();
  }

  function open(r: NewWatcherRequest) {
    request = { ...r, personIds: assignees() };
    if (ui.desktop) deskEditor = new WatcherEditor(null, { onsaved: saved });
  }

  const setup = (s: WatcherSuggestion) =>
    open({ template: s.templateId, hit: { entityId: s.entityId, name: s.name, ...(s.unit ? { unit: s.unit } : {}), ...(s.draft ? { draft: s.draft } : {}) } });
  const template = (tpl: WatcherTemplate) => open({ template: tpl.id });
</script>

<OnboardingFrame title={t('Dein erster Wächter')} lead={t('Es ist dieselbe Liste und derselbe Assistent wie später unter Wächter › Gefunden.')}>
  <FoundList onsetup={setup} ontemplate={template} />

  {#snippet footer()}
    <CtaButton ghost disabled={ob.busy} onclick={next}>{t('Ohne Wächter weiter')}</CtaButton>
  {/snippet}
</OnboardingFrame>

{#if request}
  {#if ui.desktop && deskEditor}
    <!-- Desktop: derselbe Editor wie im Reiter Wächter, in einem großen Fenster über der Einrichtung -->
    <div class="fixed inset-0 z-[35] overflow-y-auto bg-bg-dim" data-testid="onboarding-desk">
      <div class="mx-auto my-8 max-w-[1180px] px-8">
        {#key deskEditor}<WatcherDesk bind:this={deskRef} ed={deskEditor} init={request} onclose={close} />{/key}
      </div>
    </div>
  {:else if !ui.desktop}
    <WatcherSheet id={null} template={request.template} hit={request.hit} personIds={request.personIds} onsaved={saved} onback={close} />
  {/if}
{/if}
