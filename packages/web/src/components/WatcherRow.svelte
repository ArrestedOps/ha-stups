<script lang="ts">
  import type { HomeItem } from '../lib/api';
  import { t } from '../lib/i18n/index.svelte';
  import { durationText } from '../lib/home';
  import { formatDue } from '../lib/datetime';
  import { isProblem, problemText, rowStatus, statusLabel, type RowStatus } from '../lib/watcherList';
  import Icon from './Icon.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SelectBox from './ui/SelectBox.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Ein Wächter als Zeile auf dem Handy: Kachel, Name, darunter der Entitätsname (klein, grau), rechts der aktuelle Stand und der Schalter
   * „aktiv/aus". Tippen auf die Zeile öffnet den Wächter, der Schalter ändert nur „aktiv". Ein ausgeschalteter ist gedämpft und heißt „Aus",
   * eine fehlende Entität steht rot da. `current`: in einem der Bereiche oben (Läuft gerade, Kommt bald), mit deren Zusatz in der Meta-Zeile.
   */
  let {
    item: i,
    nowMs,
    current = false,
    canToggle,
    busy = false,
    selecting = false,
    selected = false,
    onopen,
    ontoggle,
    onselect,
  }: {
    item: HomeItem;
    nowMs: number;
    current?: boolean;
    canToggle: boolean;
    busy?: boolean;
    /** Auswahlmodus: Kästchen vor der Zeile, Tippen wählt statt zu öffnen */
    selecting?: boolean;
    selected?: boolean;
    onopen: () => void;
    ontoggle: (on: boolean) => void;
    onselect?: () => void;
  } = $props();

  const status = $derived<RowStatus>(rowStatus(i));
  const TILE: Record<RowStatus, TileColor> = { waiting: 'orange', running: 'green', soon: 'blue', quiet: 'teal', off: 'gray', missing: 'red', noassign: 'red', target: 'red' };
  const problem = $derived(isProblem(i));
  const filled = $derived(i.progress ? Math.round((Math.min(i.progress.n, i.progress.of) / Math.max(i.progress.of, 1)) * 3) : 0);
</script>

{#snippet row()}
<ListRow title={i.name} label={selecting ? t('{name} auswählen', { name: i.name }) : t('Wächter {name} öffnen', { name: i.name })} rightFull dim={!i.active} {problem} onclick={selecting ? onselect : onopen}>
  {#snippet tile()}<Tile color={TILE[status]}><Icon name="eye" size={24} /></Tile>{/snippet}
  {#snippet meta()}
    {#if current && status === 'running'}
      {#if i.subject}<span class="min-w-0 truncate text-tok" data-testid="watcher-subject">{i.subject}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span>{/if}
      {#if i.since}<span class="inline-flex shrink-0 items-center gap-1"><Icon name="play" size={14} stroke={1.9} />{durationText(i.since, nowMs)}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span>{/if}
      <span class="inline-flex min-w-0 items-center gap-1"><Icon name="robot" size={14} stroke={1.9} /><span class="truncate">{t('danach: {title}', { title: i.nextCard })}</span></span>
    {:else if current && status === 'soon'}
      {#if i.subject}<span class="min-w-0 truncate text-tok" data-testid="watcher-subject">{i.subject}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span>{/if}
      {#if i.progress}<span class="inline-flex shrink-0 items-center gap-1"><Icon name="robot" size={14} stroke={1.9} />{t('{n} von {total}', { n: i.progress.n, total: i.progress.of })}</span>{/if}
      {#if i.progress && i.nextEvent}<span class="shrink-0 text-sep" aria-hidden="true">•</span>{/if}
      {#if i.nextEvent}<span class="inline-flex min-w-0 items-center gap-1"><Icon name="calendar" size={14} stroke={1.9} /><span class="truncate">{i.nextEvent.title} · {formatDue(i.nextEvent.at, nowMs)}</span></span>{/if}
    {:else}
      <span class="min-w-0 truncate" data-testid="watcher-subject">{i.entity}</span>
      {#if problem}<span class="min-w-0 truncate text-danger" data-testid="watcher-status">{problemText(i)}</span>
      {:else if status === 'off'}<span class="shrink-0 font-semibold" data-testid="watcher-status">{statusLabel('off')}</span>{/if}
    {/if}
  {/snippet}
  {#snippet right()}
    <!-- der aktuelle Stand oben rechts, in der Höhe des Titels; der Schalter steht in der Mitte -->
    <span class="flex h-full items-center gap-2">
      {#if current && i.progress}
        <span class="flex items-center gap-1" role="img" aria-label={t('Zähler {n} von {total}', { n: i.progress.n, total: i.progress.of })}>
          {#each [0, 1, 2] as k (k)}<i class="h-1.5 w-[18px] rounded-[3px] {k < filled ? 'bg-accent-text' : 'bg-track'}"></i>{/each}
        </span>
      {:else if i.value}
        <span class="self-start pt-[13px] text-[13px] leading-[22px] text-fg2 tabular-nums" data-testid="watcher-value">{i.value}</span>
      {/if}
      <Toggle checked={i.active} label={t('{name} aktiv', { name: i.name })} disabled={!canToggle || busy || selecting} onchange={ontoggle} />
    </span>
  {/snippet}
</ListRow>
{/snippet}

{#if selecting}
  <div class="flex items-center gap-1" data-selected={selected ? '' : undefined}>
    <SelectBox checked={selected} label={t('{name} auswählen', { name: i.name })} onchange={() => onselect?.()} />
    <div class="min-w-0 flex-1">{@render row()}</div>
  </div>
{:else}
  {@render row()}
{/if}
