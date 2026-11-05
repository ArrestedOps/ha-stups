<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { modeOptions, needsPeople, usesCircle } from '../lib/watcher-flow';
  import { usesFallback } from '../lib/watchers';
  import AssignOrder from './AssignOrder.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Chip from './ui/Chip.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Wer": an wen die Karte geht. Alle sieben Arten der Zuweisung sind wählbar, vorausgewählt ist „reihum"; darunter, wer infrage kommt, die
   * Reihenfolge mit Fotos (wer als Nächstes dran ist, wer unterwegs ist) und der Rückfall. Im Ablauf klappt es in der Karte AN WEN auf.
   */
  let { ed }: { ed: WatcherEditor } = $props();

  const f = $derived(ed.form);
  const people = $derived(ui.people.filter((p) => p.isPerson));
  const options = $derived(modeOptions());
  const toggle = (id: string) => (f.personIds = f.personIds.includes(id) ? f.personIds.filter((x) => x !== id) : [...f.personIds, id]);

  const hint = $derived(
    f.assignMode === 'first_home'
      ? t('Ist niemand zu Hause, erscheint die Karte ohne Zuständige und ohne Push. Wer als Erstes heimkommt, bekommt sie (die Fälligkeit zählt ab dann).')
      : f.assignMode === 'rotation_present' || f.assignMode === 'all_present'
        ? t('Anwesend heißt: Die Person in Home Assistant ist zu Hause.')
        : f.assignMode === 'suggest'
          ? t('Alle Anwesenden bekommen die Frage „Wer übernimmt?“. Nach 30 Minuten ohne Antwort greift der Rückfall.')
          : null,
  );
  const fallbackLabel = $derived(f.assignMode === 'suggest' ? t('Wenn sich niemand meldet') : t('Ist niemand zu Hause'));
  const showFixedPerson = $derived((usesFallback(f.assignMode) && f.fallback === 'fixed') || (f.assignMode === 'first_home' && f.waitFallback === 'fixed'));
  const FALLBACKS = $derived<[string, string][]>([['next', t('nächste Person')], ['all', t('alle')], ['fixed', t('feste Person')], ['none', t('niemand')]]);
  const WAIT = $derived<[string, string][]>([['none', t('unzugewiesen lassen')], ['all', t('an alle')], ['fixed', t('feste Person')]]);
  const fallbackValue = $derived(FALLBACKS.find(([v]) => v === f.fallback)?.[1] ?? '');
  const waitValue = $derived(WAIT.find(([v]) => v === f.waitFallback)?.[1] ?? '');
  const personName = (id: string) => people.find((p) => p.id === id)?.displayName ?? t('wählen …');
</script>

{#snippet selectRow(label: string, value: string)}
  <Tile size="sm" color="gray"><Icon name="home" size={18} stroke={2} /></Tile>
  <span class="flex shrink-0 flex-col"><span class="text-[15px] font-bold tracking-tight">{label}</span></span>
  <span class="min-w-0 flex-1 break-words text-right text-[14px] text-fg2">{value}</span>
  <span class="flex shrink-0 text-text-soft2"><Icon name="chevron-right" size={20} stroke={2} /></span>
{/snippet}

<div class="flex flex-col gap-3.5" data-testid="who-editor">
  <div class="flex flex-col gap-2" role="radiogroup" aria-label={t('Zuweisung')}>
    {#each options as o (o.mode)}
      {@const on = f.assignMode === o.mode}
      <button
        type="button"
        role="radio"
        aria-checked={on}
        class="flex min-h-row w-full items-center gap-3 rounded-row border px-3.5 py-2.5 text-left text-[15px] font-bold {on ? 'pick-on' : 'border-line bg-surface'}"
        onclick={() => (f.assignMode = o.mode)}
      >
        <span class="h-5 w-5 shrink-0 rounded-full {on ? 'border-[6px] border-brand-dot' : 'border-2 border-ring'}"></span>
        <span>{o.title}<span class="mt-[3px] block text-[12.5px] font-medium text-fg2">{o.meta}</span></span>
      </button>
    {/each}
  </div>
  {#if f.assignMode === 'rotation' || f.assignMode === 'rotation_present'}
    <p class="-mt-1 px-1 text-[12.5px] leading-[1.45] text-hint" data-testid="fair-hint">{t('„Fair“ heißt hier reihum, nicht nach Aufwand gewichtet.')}</p>
  {/if}

  {#if usesCircle(f.assignMode)}
    <SectionHeader title={needsPeople(f.assignMode) ? t('Personen') : t('Wer kommt infrage?')}>
      {#if !needsPeople(f.assignMode)}<span class="ml-auto text-[13px] text-fg2">{t('leer = alle')}</span>{/if}
    </SectionHeader>
    <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Personen')}>
      {#each people as p (p.id)}
        {@const on = f.personIds.includes(p.id)}
        <Chip photo active={on} pressed={on} onclick={() => toggle(p.id)}><Avatar person={p} size={32} ring={on ? 0 : 1.5} />{p.displayName}</Chip>
      {/each}
    </div>

    <SectionHeader title={t('Reihenfolge')}>
      {#if ed.order?.home != null}<span class="ml-auto text-[13px] text-fg2">{t('gerade zu Hause: {n}', { n: ed.order.home })}</span>{/if}
    </SectionHeader>
    <AssignOrder order={ed.order} boxed />
  {/if}

  {#if usesFallback(f.assignMode)}
    <div class="relative flex min-h-row py-2 w-full items-center gap-3 rounded-row border border-line bg-surface pr-2.5 pl-3 focus-within:ring-2 focus-within:ring-accent">
      {@render selectRow(fallbackLabel, fallbackValue)}
      <select class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" bind:value={f.fallback} aria-label={t('Rückfall')}>
        {#each FALLBACKS as [v, label] (v)}<option value={v}>{label}</option>{/each}
      </select>
    </div>
  {:else if f.assignMode === 'first_home'}
    <div class="relative flex min-h-row py-2 w-full items-center gap-3 rounded-row border border-line bg-surface pr-2.5 pl-3 focus-within:ring-2 focus-within:ring-accent">
      {@render selectRow(t('Nach 24 Stunden ohne Heimkehr'), waitValue)}
      <select class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" bind:value={f.waitFallback} aria-label={t('Rückfall nach 24 Stunden')}>
        {#each WAIT as [v, label] (v)}<option value={v}>{label}</option>{/each}
      </select>
    </div>
  {/if}
  {#if showFixedPerson}
    <div class="relative flex min-h-row py-2 w-full items-center gap-3 rounded-row border border-line bg-surface pr-2.5 pl-3 focus-within:ring-2 focus-within:ring-accent">
      {@render selectRow(t('Feste Person für den Rückfall'), personName(f.fallbackPersonId))}
      <select class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" bind:value={f.fallbackPersonId} aria-label={t('Person für den Rückfall')}>
        <option value="">{t('wählen …')}</option>
        {#each people as p (p.id)}<option value={p.id}>{p.displayName}</option>{/each}
      </select>
    </div>
  {/if}
  {#if hint}<p class="px-1 text-[12.5px] leading-[1.45] text-hint">{hint}</p>{/if}
</div>
