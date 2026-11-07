<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { nudgeSteps } from '../lib/reminder';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { nudgeOf } from '../lib/watchers';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Tile from './ui/Tile.svelte';

  /**
   * „Stupsen, wenn noch offen" des Wächters: Nach / Wiederholen alle (leer = nur einmal) / Höchstens, dazu ein Beispiel mit den echten Werten.
   * Handy: eine Karte mit Zeilen und dem Beispiel darin. Desktop (`wide`): breite Karte, die drei Felder nebeneinander auf einer Linie,
   * rechts der Zeitstrahl. Der Stups geht an die Zuständigen und endet mit der Erledigung der Karte.
   */
  let { ed, wide = false, readOnly = false }: { ed: WatcherEditor; wide?: boolean; readOnly?: boolean } = $props();
  const f = $derived(ed.form);
  const nudge = $derived(nudgeOf(f));
  const steps = $derived(nudge ? nudgeSteps(nudge) : []);
  const once = $derived(nudge !== null && nudge.everyMin === null);
</script>

{#snippet head()}
  <span class="flex items-center gap-3">
    <Tile color="orange"><Icon name="hand" size={22} stroke={1.8} /></Tile>
    <span class="flex min-w-0 flex-col gap-1">
      <span class="text-[15px] font-bold tracking-tight">{t('Stupsen, wenn noch offen')}</span>
      <span class="text-[13px] text-fg2">{wide ? t('freundlich erinnern, endet mit der Erledigung') : t('freundlich erinnern')}</span>
    </span>
  </span>
{/snippet}

{#snippet example()}
  {#if nudge}
    <p class="rounded-xl bg-surface2 px-3 py-2.5 text-[13.5px] leading-[1.5]" data-testid="nudge-example">
      {t('Karte angelegt 12:00')} →
      {t('Stups')}
      {#each steps as s, i (i)}{i > 0 ? ' · ' : ''}<b class="font-bold text-accent-text">{s.text}</b>{s.last ? ` ${t('(letzter)')}` : ''}{/each}<br />
      {t('Endet, sobald die Karte erledigt ist.')}
    </p>
  {:else}
    <p class="px-1 text-[13px] text-fg2" data-testid="nudge-off">{t('Leer lassen: kein Stups.')}</p>
  {/if}
{/snippet}

{#if wide}
  <div class="flex flex-col gap-4 rounded-row border bg-surface px-4 py-4 @min-[720px]:flex-row {nudge ? 'border-accent' : 'border-line'}" data-testid="nudge-card" data-wide>
    <div class="flex min-w-0 flex-col gap-3 @min-[720px]:w-[19rem] @min-[720px]:shrink-0">
      {@render head()}
      <div class="flex items-start gap-3" data-testid="nudge-fields">
        <label class="flex flex-col gap-1.5">
          <span class="h-4 text-[11px] leading-4 font-bold tracking-[0.06em] whitespace-nowrap text-fg2 uppercase">{t('Nach')}</span>
          <NumberField bind:value={f.nudgeAfter} label={t('Stupsen nach Minuten')} unit={t('Min.')} placeholder={t('nie')} disabled={readOnly} />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="h-4 text-[11px] leading-4 font-bold tracking-[0.06em] whitespace-nowrap text-fg2 uppercase">{t('Wiederholen alle')}</span>
          <NumberField bind:value={f.nudgeEvery} label={t('Wiederholen alle Minuten')} unit={t('Min.')} placeholder={t('nie')} disabled={readOnly || !nudge} />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="h-4 text-[11px] leading-4 font-bold tracking-[0.06em] whitespace-nowrap text-fg2 uppercase">{t('Höchstens')}</span>
          <NumberField bind:value={f.nudgeMax} label={t('Höchstens so viele Stupse')} unit="×" placeholder="3" disabled={readOnly || !nudge || once} />
        </label>
      </div>
      <p class="px-0.5 text-[12.5px] leading-[1.45] text-hint">{t('Wiederholen alle: leer = nur einmal.')}</p>
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-surface2 px-4 py-3" data-testid="nudge-timeline">
      <span class="text-[11px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('So läuft es ab')}</span>
      {#if nudge}
        <ol class="relative flex items-start justify-between gap-2 pt-1">
          <span class="absolute top-[26px] right-6 left-6 h-px bg-track" aria-hidden="true"></span>
          <li class="relative flex min-w-0 flex-col items-center gap-1 text-center">
            <span class="text-[12px] font-semibold whitespace-nowrap">{t('Angelegt')}</span>
            <span class="h-3 w-3 rounded-full border-2 border-accent bg-surface2"></span>
            <span class="text-[12px] text-fg2">12:00</span>
          </li>
          {#each steps as s, i (i)}
            <li class="relative flex min-w-0 flex-col items-center gap-1 text-center">
              <span class="text-[12px] font-semibold whitespace-nowrap">{s.gap ? '' : t('Stups {n}', { n: i + 1 })}</span>
              <span class="h-3 w-3 rounded-full {s.gap ? 'bg-track' : 'bg-accent'}"></span>
              <span class="text-[12px] whitespace-nowrap text-fg2">{s.last ? `${s.text} · ${t('letzter')}` : s.text}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="text-[13px] text-fg2">{t('Leer lassen: kein Stups.')}</p>
      {/if}
    </div>
  </div>
{:else}
  <div class="flex flex-col gap-2 rounded-row border bg-surface p-2.5 {nudge ? 'border-accent' : 'border-line'}" data-testid="nudge-card">
    <div class="px-1 pt-0.5 pb-1">{@render head()}</div>
    <ListRow inset wrap title={t('Nach')}>
      {#snippet right()}<NumberField bind:value={f.nudgeAfter} label={t('Stupsen nach Minuten')} unit={t('Min.')} placeholder={t('nie')} disabled={readOnly} />{/snippet}
    </ListRow>
    <ListRow inset wrap title={t('Wiederholen alle')}>
      {#snippet meta()}<span>{t('leer = nur einmal')}</span>{/snippet}
      {#snippet right()}<NumberField bind:value={f.nudgeEvery} label={t('Wiederholen alle Minuten')} unit={t('Min.')} placeholder={t('nie')} disabled={readOnly || !nudge} />{/snippet}
    </ListRow>
    <ListRow inset wrap title={t('Höchstens')}>
      {#snippet right()}<NumberField bind:value={f.nudgeMax} label={t('Höchstens so viele Stupse')} unit="×" placeholder="3" disabled={readOnly || !nudge || once} />{/snippet}
    </ListRow>
    {@render example()}
  </div>
{/if}
