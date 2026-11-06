<script lang="ts">
  import type { HomeItem } from '../lib/api';
  import { ageText } from '../lib/today';
  import { t } from '../lib/i18n/index.svelte';
  import { personById } from '../lib/store.svelte';
  import { modeSummary } from '../lib/watcher-flow';
  import { COL_MID, COL_WIDE, rowStatus, statusLabel, TABLE_COLS, triggerText, whoText, type RowStatus } from '../lib/watcherList';
  import AvatarStack from './AvatarStack.svelte';
  import Icon from './Icon.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Ein Wächter als Tabellenzeile (Desktop): Wächter (Kachel, Name, Entität), Bedingung als kurzer Satz, aktueller Stand, Status, letzte
   * Auslösung, nächste Karte, Zuständige und der Schalter. Die ganze Zeile öffnet den Wächter (der Name ist der Knopf, seine Fläche deckt die
   * Zeile ab); der Schalter liegt darüber und ändert nur „aktiv". Spalten siehe `TABLE_COLS`.
   */
  let {
    item: i,
    nowMs,
    canToggle,
    busy = false,
    onopen,
    ontoggle,
  }: { item: HomeItem; nowMs: number; canToggle: boolean; busy?: boolean; onopen: () => void; ontoggle: (on: boolean) => void } = $props();

  const status = $derived<RowStatus>(rowStatus(i));
  const TILE: Record<RowStatus, TileColor> = { waiting: 'orange', running: 'green', soon: 'blue', quiet: 'teal', off: 'gray', missing: 'red' };
  const DOT: Record<RowStatus, string> = { waiting: 'text-sig-orange', running: 'text-sig-green', soon: 'text-sig-blue', quiet: 'text-text-soft2', off: 'text-text-soft2', missing: 'text-danger' };
  const people = $derived(i.assign.personIds.map(personById).filter((p) => p !== undefined));
  const who = $derived(whoText(i.assign, (id) => personById(id)?.displayName ?? '?'));
  /** Feste Personen zeigen nur ihre Bilder; sonst steht die Art der Zuweisung dabei („abwechselnd, nur Anwesende") */
  const modeText = $derived(people.length > 0 && i.assign.mode === 'fixed' ? '' : modeSummary(i.assign.mode));
  const dim = $derived(i.active ? '' : 'opacity-70');
</script>

<li class="relative grid min-h-16 items-center gap-x-4 px-3.5 py-2 hover:bg-surface2 has-[[data-row-open]:focus-visible]:bg-surface2 has-[[data-row-open]:focus-visible]:outline-2 has-[[data-row-open]:focus-visible]:-outline-offset-2 has-[[data-row-open]:focus-visible]:outline-accent {TABLE_COLS}" data-testid="watcher-row" data-status={status}>
  <!-- Wächter -->
  <div class="flex min-w-0 items-center gap-3 {dim}">
    <Tile color={TILE[status]}><Icon name="eye" size={24} /></Tile>
    <button type="button" class="flex min-w-0 flex-1 flex-col gap-0.5 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none" data-row-open aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={onopen}>
      <span class="truncate text-[15px] font-bold tracking-tight">{i.name}</span>
      <span class="truncate text-[13px] text-fg2" data-testid="watcher-subject">{i.entity}</span>
    </button>
  </div>
  <!-- Bedingung -->
  <p class="{COL_MID} line-clamp-2 text-[13px] leading-[1.35] text-fg2 {dim}" data-testid="watcher-condition">{t('Wenn {condition}', { condition: triggerText(i) })}</p>
  <!-- Stand -->
  <span class="truncate text-[14px] tabular-nums {i.value ? 'text-fg' : 'text-hint'} {dim}" data-testid="watcher-value">{i.value ?? '–'}</span>
  <!-- Status -->
  <span class="inline-flex h-6 min-w-0 items-center gap-1.5 justify-self-start rounded-full bg-count px-2.5 text-[12px] font-bold text-text-soft" data-testid="watcher-status">
    <span class="shrink-0 {DOT[status]}" aria-hidden="true">●</span><span class="truncate">{statusLabel(status)}</span>
  </span>
  <!-- letzte Auslösung -->
  <span class="{COL_MID} truncate text-[13px] text-fg2 {dim}" data-testid="watcher-last">{i.lastFiredAt ? ageText(i.lastFiredAt, nowMs) : t('Nie')}</span>
  <!-- nächste Karte -->
  <span class="{COL_WIDE} min-w-0 items-center gap-1.5 text-[13px] text-fg2 {dim}" data-testid="watcher-next">
    <span class="shrink-0 text-text-soft2"><Icon name="robot" size={14} stroke={1.9} /></span><span class="truncate">{i.openCard?.title ?? i.nextCard}</span>
  </span>
  <!-- Zuständige -->
  <span class="{COL_WIDE} min-w-0 items-center gap-2 text-[12.5px] text-fg2 {dim}" title={who} data-testid="watcher-who">
    {#if people.length}<AvatarStack {people} size={24} />{/if}{#if modeText}<span class="min-w-0 truncate">{modeText}</span>{/if}
  </span>
  <!-- Schalter -->
  <span class="relative z-10 flex justify-end">
    <Toggle checked={i.active} label={t('{name} aktiv', { name: i.name })} disabled={!canToggle || busy} onchange={ontoggle} />
  </span>
</li>
