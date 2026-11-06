<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';
  import type { Visibility } from '../lib/boardAccess';
  import Avatar from './Avatar.svelte';
  import Chip from './ui/Chip.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Icon from './Icon.svelte';

  /**
   * „Wer sieht dieses Board?" als drei Auswahlkarten (🔒 Nur ich, 🏠 Alle in Stups, 👥 Ausgewählte Personen; bei der dritten mit Personen-Chips),
   * darunter die Zeile „Zählt zur Fairness der Woche" mit Schalter. Bei „Nur ich" ist der Schalter ausgegraut, aus und nicht bedienbar
   * („Private Boards zählen nie mit."); der gemerkte Wert bleibt, beim Zurückwechseln gilt er wieder. Kinder sehen nur „Nur ich".
   * Wählt jemand etwas, meldet `onchange`; was daraus folgt (Bestätigung, Speichern), entscheidet der Aufrufer.
   */
  let {
    visibility,
    memberIds,
    counts,
    ownerId,
    disabled = false,
    onvisibility,
    onmembers,
    oncounts,
  }: {
    visibility: Visibility;
    memberIds: string[];
    counts: boolean;
    /** der Besitzer (er sieht das Board immer und steht nicht in den Chips); bei einem neuen Board die eigene Person */
    ownerId: string | null;
    disabled?: boolean;
    onvisibility: (v: Visibility) => void;
    onmembers: (ids: string[]) => void;
    oncounts: (on: boolean) => void;
  } = $props();

  const child = $derived(ui.isChild);
  const OPTIONS = $derived<{ id: Visibility; title: string; meta: string }[]>([
    { id: 'private', title: `🔒 ${t('Nur ich')}`, meta: t('Niemand sonst sieht das Board, auch kein Administrator.') },
    { id: 'all', title: `🏠 ${t('Alle in Stups')}`, meta: t('Jede Person mit Zugriff sieht es.') },
    { id: 'selected', title: `👥 ${t('Ausgewählte Personen')}`, meta: t('Nur du und die, die du wählst.') },
  ]);
  const options = $derived(child ? OPTIONS.filter((o) => o.id === 'private') : OPTIONS);
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== ownerId));
  const toggle = (id: string) => onmembers(memberIds.includes(id) ? memberIds.filter((x) => x !== id) : [...memberIds, id]);
  const locked = $derived(visibility === 'private');
</script>

<div class="flex flex-col gap-2" data-testid="visibility-picker">
  <SectionHeader title={t('Wer sieht dieses Board?')} />
  <div class="flex flex-col gap-2" role="radiogroup" aria-label={t('Wer sieht dieses Board?')}>
    {#each options as o (o.id)}
      {@const on = visibility === o.id}
      <button
        type="button"
        role="radio"
        aria-checked={on}
        {disabled}
        class="flex min-h-row w-full items-center gap-3 rounded-row border px-3.5 py-2.5 text-left text-[15px] font-bold disabled:opacity-60 {on ? 'pick-on' : 'border-line bg-surface'}"
        data-testid="visibility-{o.id}"
        onclick={() => onvisibility(o.id)}
      >
        <span class="h-5 w-5 shrink-0 rounded-full {on ? 'border-[6px] border-brand-dot' : 'border-2 border-ring'}"></span>
        <span>{o.title}<span class="mt-[3px] block text-[12.5px] font-medium text-fg2">{o.meta}</span></span>
      </button>
    {/each}
  </div>

  {#if visibility === 'selected'}
    <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Wer gehört dazu?')} data-testid="visibility-members">
      {#each people as p (p.id)}
        {@const on = memberIds.includes(p.id)}
        <Chip photo active={on} pressed={on} {disabled} onclick={() => toggle(p.id)}><Avatar person={p} size={32} ring={on ? 0 : 1.5} />{p.displayName}</Chip>
      {/each}
    </div>
  {/if}

  <ListRow title={t('Zählt zur Fairness der Woche')} dim={locked}>
    {#snippet tile()}<Tile color="green"><Icon name="columns" size={22} stroke={1.8} /></Tile>{/snippet}
    {#snippet meta()}<span data-testid="counts-note">{locked ? t('Private Boards zählen nie mit.') : counts ? t('Erledigte Karten zählen mit') : t('Erledigte Karten zählen nicht mit')}</span>{/snippet}
    {#snippet right()}
      <Toggle label={t('Zählt zur Fairness der Woche')} checked={locked ? false : counts} disabled={locked || disabled} onchange={oncounts} />
    {/snippet}
  </ListRow>
</div>
