<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/store.svelte';
  import { DESK_MODES, deskModeOf, presentOnly, withDeskMode, withPresentOnly, type DeskMode } from '../lib/watcher-desk';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { needsPeople, usesCircle } from '../lib/watcher-flow';
  import type { AssignMode } from '../lib/watcher-types';
  import { usesFallback } from '../lib/watchers';
  import AssignOrder from './AssignOrder.svelte';
  import Avatar from './Avatar.svelte';
  import DeskBlock from './DeskBlock.svelte';
  import SelectField from './SelectField.svelte';
  import Chip from './ui/Chip.svelte';
  import Segmented from './ui/Segmented.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * „Wer bekommt die Karte?“ im Formular am Desktop: vier Arten als Segment (feste Person, wer zuerst heimkommt, fair im Wechsel, alle
   * Anwesenden), „Erst vorschlagen“ und „Niemand“ in einer Auswahl daneben. Darunter wie im Assistenten: wer infrage kommt (bei „Eine feste
   * Person“ Pflicht), die Reihenfolge mit Fotos und der Rückfall.
   */
  let { ed }: { ed: WatcherEditor } = $props();

  const f = $derived(ed.form);
  /** nur Personen, die das Board sehen */
  const people = $derived(ed.people);
  const restricted = $derived(!!ed.board && ed.board.visibility !== 'all');
  const me = $derived(ui.me && people.some((p) => p.id === ui.me!.id) ? ui.me.id : null);
  const LABEL = $derived<Record<DeskMode, string>>({
    fixed: t('Eine feste Person'),
    first_home: t('Wer zuerst heimkommt'),
    rotation: t('Fair im Wechsel'),
    all_present: t('Alle Anwesenden'),
  });
  const ITEMS = $derived(DESK_MODES.map((id) => ({ id, label: LABEL[id] })));
  const mode = $derived(deskModeOf(f.assignMode));
  /** „Erst vorschlagen“ und „Niemand“: die Arten, die kein Segment haben */
  const other = $derived(mode === null ? f.assignMode : '');
  const toggle = (id: string) => (f.personIds = f.personIds.includes(id) ? f.personIds.filter((x) => x !== id) : [...f.personIds, id]);
  function setOther(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    ed.form = v === '' ? withDeskMode(f, 'rotation') : { ...f, assignMode: v as AssignMode };
  }

  const hint = $derived(
    f.assignMode === 'first_home'
      ? t('Ist niemand zu Hause, erscheint die Karte ohne Zuständige und ohne Push. Wer als Erstes heimkommt, bekommt sie (die Fälligkeit zählt ab dann).')
      : f.assignMode === 'rotation' || f.assignMode === 'rotation_present'
        ? t('„Fair“ heißt hier reihum, nicht nach Aufwand gewichtet.')
        : f.assignMode === 'all_present'
          ? t('Anwesend heißt: Die Person in Home Assistant ist zu Hause.')
          : f.assignMode === 'suggest'
            ? t('Alle Anwesenden bekommen die Frage „Wer übernimmt?“. Nach 30 Minuten ohne Antwort greift der Rückfall.')
            : f.assignMode === 'none'
              ? t('Karte landet nur auf dem Board')
              : null,
  );
  const fallbackLabel = $derived(f.assignMode === 'suggest' ? t('Wenn sich niemand meldet') : t('Ist niemand zu Hause'));
  const showFixedPerson = $derived((usesFallback(f.assignMode) && f.fallback === 'fixed') || (f.assignMode === 'first_home' && f.waitFallback === 'fixed'));
  const FALLBACKS = $derived<[string, string][]>([['next', t('nächste Person')], ['all', t('alle')], ['fixed', t('feste Person')], ['none', t('niemand')]]);
  const WAIT = $derived<[string, string][]>([['none', t('unzugewiesen lassen')], ['all', t('an alle')], ['fixed', t('feste Person')]]);
</script>

<DeskBlock n={3} title={t('Wer bekommt die Karte?')} testid="desk-who">
  <Segmented small scroll items={ITEMS} value={mode} label={t('Zuweisung')} onchange={(id) => (ed.form = withDeskMode(f, id as DeskMode, me))} />

  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    {#if mode === 'rotation'}
      <label class="flex items-center gap-3 text-[14px]">
        <Toggle label={t('Nur, wer zu Hause ist')} checked={presentOnly(f)} onchange={(on) => (ed.form = withPresentOnly(f, on))} />
        {t('Nur, wer zu Hause ist')}
      </label>
    {/if}
    <span class="flex-1"></span>
    <SelectField variant="pill" caption={t('Weitere')} label={t('Weitere Arten der Zuweisung')} value={other} onchange={setOther}>
      <option value="">{t('keine')}</option>
      <option value="suggest">{t('Erst vorschlagen')}</option>
      <option value="none">{t('Niemand')}</option>
    </SelectField>
  </div>

  {#if usesCircle(f.assignMode)}
    <div class="flex flex-col gap-2">
      <span class="flex items-baseline gap-2 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">
        {needsPeople(f.assignMode) ? t('Personen') : t('Wer kommt infrage?')}
        {#if !needsPeople(f.assignMode)}<span class="text-[12.5px] font-medium tracking-normal normal-case">{t('leer = alle')}</span>{/if}
      </span>
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={t('Personen')}>
        {#each people as p (p.id)}
          {@const on = f.personIds.includes(p.id)}
          <Chip photo active={on} pressed={on} onclick={() => toggle(p.id)}><Avatar person={p} size={32} ring={on ? 0 : 1.5} />{p.displayName}</Chip>
        {/each}
        {#if restricted}
          <span class="inline-flex h-6 shrink-0 items-center rounded-full border border-accent px-2.5 text-[11px] font-extrabold tracking-[0.06em] whitespace-nowrap text-accent-text uppercase" data-testid="board-people-chip">{t('Nur Mitglieder von „{board}“', { board: ed.board?.name ?? '' })}</span>
        {/if}
      </div>
    </div>
    {#if f.assignMode !== 'fixed'}<AssignOrder order={ed.order} boxed />{/if}
  {/if}

  {#if usesFallback(f.assignMode) || f.assignMode === 'first_home' || showFixedPerson}
    <div class="flex flex-wrap items-center gap-2">
      {#if usesFallback(f.assignMode)}
        <SelectField variant="pill" caption={fallbackLabel} label={t('Rückfall')} bind:value={f.fallback}>
          {#each FALLBACKS as [v, label] (v)}<option value={v}>{label}</option>{/each}
        </SelectField>
      {:else if f.assignMode === 'first_home'}
        <SelectField variant="pill" caption={t('Nach 24 Stunden ohne Heimkehr')} label={t('Rückfall nach 24 Stunden')} bind:value={f.waitFallback}>
          {#each WAIT as [v, label] (v)}<option value={v}>{label}</option>{/each}
        </SelectField>
      {/if}
      {#if showFixedPerson}
        <SelectField variant="pill" caption={t('Feste Person für den Rückfall')} label={t('Person für den Rückfall')} bind:value={f.fallbackPersonId}>
          <option value="">{t('wählen …')}</option>
          {#each people as p (p.id)}<option value={p.id}>{p.displayName}</option>{/each}
        </SelectField>
      {/if}
    </div>
  {/if}
  {#if hint}<p class="text-[12.5px] leading-[1.45] text-hint">{hint}</p>{/if}
</DeskBlock>
