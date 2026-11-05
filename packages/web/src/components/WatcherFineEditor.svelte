<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { doneText } from '../lib/watcher-flow';
  import DoneEditor from './DoneEditor.svelte';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Feinschliff" (Schritt 4): Zeilen mit den Extras, jede mit einer Kachel, einem Satz und rechts genau einem Element (Schalter oder Zahl):
   * erledigt sich selbst, stupsen, erst beim N-ten Mal, Sperrzeit. Dazu der Name des Wächters und die Doppelkarten-Regel.
   */
  let { ed }: { ed: WatcherEditor } = $props();
  const f = $derived(ed.form);
  const doneMeta = $derived(f.doneOn && f.doneEntityId ? doneText(f) : t('wenn die Bedingung eintritt'));
  const showCount = $derived(f.kind !== 'calendar_event' && f.kind !== 'forecast');
</script>

<div class="flex flex-col gap-2" data-testid="fine-editor">
  <ListRow wrap title={t('Erledigt sich selbst')}>
    {#snippet tile()}<Tile color="blue"><Icon name="door" size={22} stroke={1.8} /></Tile>{/snippet}
    {#snippet meta()}<span class="wrap-anywhere">{doneMeta}</span>{/snippet}
    {#snippet right()}<Toggle label={t('Automatisch erledigen')} checked={f.doneOn} disabled={ed.selfNote !== ''} onchange={(v) => (f.doneOn = v)} />{/snippet}
  </ListRow>
  {#if f.doneOn}<DoneEditor {ed} />{:else if ed.selfNote}<p class="px-1 text-[13px] text-fg2" data-testid="self-note">{ed.selfNote}</p>{/if}

  <ListRow wrap title={t('Stupsen, wenn noch offen')}>
    {#snippet tile()}<Tile color="orange"><Icon name="hand" size={22} stroke={1.8} /></Tile>{/snippet}
    {#snippet meta()}<span class="wrap-anywhere">{t('freundlich erinnern')}</span>{/snippet}
    {#snippet right()}<NumberField bind:value={f.nudgeAfterMin} label={t('Stupsen nach Minuten')} unit={t('Min.')} placeholder={t('nie')} />{/snippet}
  </ListRow>
  {#if showCount}
    <ListRow wrap title={t('Erst beim N-ten Mal')}>
      {#snippet tile()}<Tile color="teal"><Icon name="repeat" size={22} stroke={1.8} /></Tile>{/snippet}
      {#snippet meta()}<span class="wrap-anywhere">{t('z. B. Saugroboter nach 3 Läufen')}</span>{/snippet}
      {#snippet right()}<NumberField bind:value={f.count} label={t('Anzahl')} unit="×" placeholder="1" />{/snippet}
    </ListRow>
  {/if}
  <ListRow wrap title={t('Sperrzeit')}>
    {#snippet tile()}<Tile color="gray"><Icon name="lock" size={22} stroke={1.8} /></Tile>{/snippet}
    {#snippet meta()}<span class="wrap-anywhere">{t('gegen flatternde Sensoren')}</span>{/snippet}
    {#snippet right()}<NumberField bind:value={f.cooldownMin} label={t('Sperrzeit in Minuten')} unit={t('Min.')} placeholder="10" />{/snippet}
  </ListRow>
  <ListRow wrap title={t('Keine zweite Karte')}>
    {#snippet tile()}<Tile color="green"><Icon name="copy" size={22} stroke={1.8} /></Tile>{/snippet}
    {#snippet meta()}<span class="wrap-anywhere">{t('solange eine offen ist')}</span>{/snippet}
    {#snippet right()}<Toggle label={t('Keine Doppelkarten')} checked={f.dedupe} onchange={(v) => (f.dedupe = v)} />{/snippet}
  </ListRow>
  <div class="focus-ring-in flex items-center gap-3 rounded-row border border-line bg-surface px-3.5 py-3">
    <span class="flex min-w-0 flex-1 flex-col gap-1.5">
      <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="watcher-name">{t('Name des Wächters')}</label>
      <input id="watcher-name" class="min-h-6 w-full bg-transparent text-[16px] font-semibold placeholder:text-dim" bind:value={f.name} maxlength="80" placeholder={t('z. B. Waschmaschine fertig')} />
    </span>
  </div>
</div>
