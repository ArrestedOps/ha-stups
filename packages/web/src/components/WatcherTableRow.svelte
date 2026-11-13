<script lang="ts">
  import type { HomeItem } from '../lib/api';
  import { ageText } from '../lib/today';
  import { t } from '../lib/i18n/index.svelte';
  import { personById } from '../lib/store.svelte';
  import { modeSummary } from '../lib/watcher-flow';
  import { COL_LAST, COL_WIDE, rowStatus, statusLabel, TABLE_COLS, triggerText, whoText, type RowStatus } from '../lib/watcherList';
  import AvatarStack from './AvatarStack.svelte';
  import Icon from './Icon.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Ein Wächter als Tabellenzeile (Desktop): Wächter (Kachel, Name, Entität), Bedingung als kurzer Satz, aktueller Stand, Status, letzte
   * Auslösung, nächste Aufgabe, Zuständige und der Schalter. Die ganze Zeile öffnet den Wächter (ein Knopf füllt sie aus); der Schalter liegt darüber
   * und ändert nur „aktiv". Spalten siehe `TABLE_COLS`.
   */
  let {
    item: i,
    nowMs,
    canToggle,
    busy = false,
    fresh = false,
    selected = false,
    open = false,
    onselect,
    onopen,
    ontoggle,
  }: { item: HomeItem; nowMs: number; canToggle: boolean; busy?: boolean; /** gerade angelegt: kurz hervorgehoben */ fresh?: boolean; /** für die Sammelaktionen markiert */ selected?: boolean; /** der Ablauf steht aufgeklappt unter der Zeile */ open?: boolean; onselect?: (on: boolean) => void; onopen: () => void; ontoggle: (on: boolean) => void } = $props();

  const status = $derived<RowStatus>(rowStatus(i));
  const TILE: Record<RowStatus, TileColor> = { waiting: 'orange', running: 'green', soon: 'blue', quiet: 'teal', off: 'gray', missing: 'red', noassign: 'red', target: 'red' };
  const DOT: Record<RowStatus, string> = { waiting: 'text-sig-orange', running: 'text-sig-green', soon: 'text-sig-blue', quiet: 'text-text-soft2', off: 'text-text-soft2', missing: 'text-danger', noassign: 'text-danger', target: 'text-danger' };
  const people = $derived(i.assign.personIds.map(personById).filter((p) => p !== undefined));
  const who = $derived(whoText(i.assign, (id) => personById(id)?.displayName ?? '?'));
  /** Feste Personen zeigen nur ihre Bilder; sonst steht die Art der Zuweisung dabei („abwechselnd, nur Anwesende") */
  const modeText = $derived(people.length > 0 && i.assign.mode === 'fixed' ? '' : modeSummary(i.assign.mode));
  const dim = $derived(i.active ? '' : 'opacity-70');
  /** Pegel in Prozent (zum Beispiel 9 %): zeigt zusätzlich einen kleinen Balken, rot unter 15 %, orange unter 30 % */
  const percent = $derived.by(() => {
    const m = i.value?.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
    return m ? Math.max(0, Math.min(100, Number(m[1]!.replace(',', '.')))) : null;
  });
</script>

<li class="relative grid h-16 {selected || open ? 'bg-accent/10' : ''} scroll-mt-14 items-center gap-x-3 px-3.5 transition-colors duration-700 hover:bg-surface2 {fresh ? 'row-fresh' : ''} has-[[data-row-open]:focus-visible]:bg-surface2 has-[[data-row-open]:focus-visible]:outline-2 has-[[data-row-open]:focus-visible]:-outline-offset-2 has-[[data-row-open]:focus-visible]:outline-accent {TABLE_COLS}" data-testid="watcher-row" data-status={status} data-watcher-id={i.watcherId} data-fresh={fresh ? '' : undefined}>
  <!-- Die ganze Zeile öffnet den Wächter: ein Knopf, der die Zeile ausfüllt und über den Zellen liegt (ohne Text, der Name steht im Label);
       er steht zuerst, damit die Tab-Reihenfolge stimmt. Der Schalter liegt darüber. -->
  <button type="button" class="absolute inset-0 z-[1] cursor-pointer focus-visible:outline-none" data-row-open aria-expanded={open} aria-label={t('Wächter {name} öffnen', { name: i.name })} onclick={onopen}></button>
  <!-- Wächter -->
  <div class="flex min-w-0 items-center gap-3 {dim}">
    {#if onselect}
      <input type="checkbox" class="relative z-10 h-[18px] w-[18px] shrink-0 accent-(--brand-dot)" checked={selected} aria-label={t('{name} auswählen', { name: i.name })} onchange={(e) => onselect(e.currentTarget.checked)} />
    {/if}
    <Tile color={TILE[status]}><Icon name="eye" size={24} /></Tile>
    <span class="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span class="line-clamp-2 text-[15px] leading-[1.25] font-bold tracking-tight wrap-anywhere" title={i.name} data-testid="watcher-name">{i.name}</span>
      <span class="truncate text-[12.5px] text-fg2" title="{i.entity} · {t('Wenn {condition}', { condition: triggerText(i) })}"><span data-testid="watcher-subject">{i.entity}</span><span class="hidden @min-[640px]:inline" data-testid="watcher-condition">{' · '}{t('Wenn {condition}', { condition: triggerText(i) })}</span></span>
    </span>
  </div>
  <!-- Stand -->
  <span class="flex min-w-0 items-center gap-2 text-[14px] tabular-nums {i.value ? 'text-fg' : 'text-hint'} {dim}">
    {#if percent !== null}<span class="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-track" aria-hidden="true"><i class="block h-full rounded-full" style:width="{percent}%" style:background={percent < 15 ? 'var(--danger)' : percent < 30 ? 'var(--c-orange-fg)' : 'var(--c-green-fg)'}></i></span>{/if}
    <span class="truncate" data-testid="watcher-value">{i.value ?? '–'}</span>
  </span>
  <!-- Status -->
  <span class="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 justify-self-start rounded-full bg-count px-2.5 text-[12px] font-bold text-text-soft" data-testid="watcher-status">
    <span class="shrink-0 {DOT[status]}" aria-hidden="true">●</span><span class="truncate">{statusLabel(status)}</span>
  </span>
  <!-- letzte Auslösung -->
  <span class="{COL_LAST} truncate text-[13px] text-fg2 {dim}" data-testid="watcher-last">{i.lastFiredAt ? ageText(i.lastFiredAt, nowMs) : t('Nie')}</span>
  <!-- nächste Aufgabe -->
  <span class="{COL_WIDE} min-w-0 items-center gap-1.5 text-[13px] text-fg2 {dim}" data-testid="watcher-next">
    <span class="shrink-0 text-text-soft2"><Icon name="robot" size={14} stroke={1.9} /></span><span class="truncate">{i.openCard?.title ?? i.nextCard}</span>
  </span>
  <!-- Zuständige -->
  <span class="{COL_WIDE} min-w-0 items-center gap-2 text-[12.5px] text-fg2 {dim}" title={who} data-testid="watcher-who">
    {#if people.length}<AvatarStack {people} size={24} />{/if}{#if modeText && people.length === 0}<span class="min-w-0 truncate">{modeText}</span>{/if}
  </span>
  <!-- Schalter -->
  <span class="relative z-10 flex items-center justify-end gap-2">
    <Toggle checked={i.active} label={t('{name} aktiv', { name: i.name })} disabled={!canToggle || busy} onchange={ontoggle} />
  </span>
</li>
