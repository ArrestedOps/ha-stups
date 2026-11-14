<script lang="ts">
  import { valueText } from '../lib/history';
  import { cardTitleWithEntity } from '../lib/cardTitle';
  import { t } from '../lib/i18n/index.svelte';
  import { personById, ui } from '../lib/store.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { dueText, durationHint, nameSymbol } from '../lib/watcher-flow';
  import AvatarStack from './AvatarStack.svelte';
  import CardTile from './CardTile.svelte';
  import EntityGraph from './EntityGraph.svelte';
  import Icon from './Icon.svelte';
  import WatcherSummary from './WatcherSummary.svelte';
  import ListRow from './ui/ListRow.svelte';

  /**
   * Die Vorschau rechts im Formular am Desktop: der Satz („Wenn … länger als … unter … liegt, bekommt … die Aufgabe …“), der Verlauf der
   * Entität mit der Schwellenlinie (derselbe Verlauf wie im Assistenten) und „So erscheint die Aufgabe“ als Zeile wie in den Aufgaben.
   * Nur zum Lesen: alles, was hier steht, kommt aus dem Formular.
   */
  let { ed }: { ed: WatcherEditor } = $props();

  const f = $derived(ed.form);
  const graphKind = $derived(f.kind !== 'calendar_event' && f.kind !== 'forecast');
  const unit = $derived(f.entityUnit || null);
  const num = (s: string): number | null => {
    const n = Number(s.trim().replace(',', '.'));
    return s.trim() === '' || !Number.isFinite(n) ? null : n;
  };
  const threshold = $derived(f.kind === 'below' || f.kind === 'above' ? num(f.value) : null);
  const minutes = $derived(Number(f.forMin.trim() === '' ? (f.kind === 'state' ? 0 : 3) : f.forMin.replace(',', '.')) || 0);
  const current = $derived(valueText(ed.history?.current ?? null, ed.history?.kind === 'state' ? null : unit));
  const auto = $derived(f.icon ? null : (nameSymbol(f.title) ?? nameSymbol(f.entityName)));
  /** Der Titel der Aufgabe, wie sie entsteht: mit dem Namen der Entität (siehe cardTitle.ts) */
  const shownTitle = $derived(cardTitleWithEntity(f.title, f.kind, f.entityName || f.entityId) || '…');
  const look = $derived({ icon: f.icon || auto, iconColor: f.iconColor || null });
  const board = $derived(ui.boards.find((b) => b.id === f.boardId));
  /** Wer die Aufgabe bekommt, soweit es feststeht: die gewählten Personen (leer: kein Bild, nur das Schild des Wächters) */
  const people = $derived(f.assignMode === 'fixed' || f.assignMode === 'rotation' ? f.personIds.map(personById).filter((p) => p !== undefined) : []);
</script>

<aside class="flex min-w-0 flex-col gap-3 rounded-[16px] bg-surface px-4 py-4" aria-labelledby="desk-preview-t" data-testid="desk-preview">
  <h3 id="desk-preview-t" class="text-[12px] font-bold tracking-[0.08em] text-fg2 uppercase">{t('Vorschau')}</h3>
  <WatcherSummary form={f} personName={ed.personName} />

  {#if graphKind && f.entityId}
    <div class="rounded-[16px] border border-line bg-bg px-3.5 pt-3 pb-2.5" data-testid="graph-card">
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-[13px] text-fg2">{t('jetzt')} <b class="text-[17px] font-extrabold text-fg" data-testid="desk-current">{current || '–'}</b></span>
        <span class="min-w-0 truncate text-[12px] text-fg2">{t('letzte 3 Stunden')}</span>
      </div>
      <EntityGraph history={ed.history} busy={ed.historyBusy} name={f.entityName || f.entityId} {unit} {threshold} thresholdState={f.kind === 'state' ? f.to.trim() : null} />
    </div>
    {#if ed.history?.status === 'ok' && ed.history.points.length >= 2}
      <p class="px-1 text-[12.5px] leading-[1.45] text-hint" data-testid="duration-hint">{durationHint(minutes, ed.history.hours, ed.history.fired.length)}</p>
    {/if}
  {:else if graphKind}
    <div class="flex h-[120px] items-center justify-center rounded-[16px] border border-dashed border-track px-4 text-center text-[13px] text-fg2" data-testid="graph-placeholder">
      {t('Wähle eine Entität, dann erscheint ihr Verlauf.')}
    </div>
  {/if}

  <h3 class="mt-1 text-[12px] font-bold tracking-[0.08em] text-fg2 uppercase">{t('So erscheint die Aufgabe')}</h3>
  <div class="rounded-[18px] border border-dashed border-track bg-surface-inset p-2" data-testid="card-preview">
    <ListRow wrap variant="task" title={shownTitle} check={{ done: false, label: t('Vorschau'), onchange: () => {}, disabled: true }}>
      {#snippet tile()}<CardTile card={look} />{/snippet}
      {#snippet meta()}
        <span class="shrink-0">{dueText(f)}</span>
        {#if f.category.trim()}
          <span class="shrink-0 text-sep" aria-hidden="true">•</span>
          <span class="inline-flex min-w-0 items-center gap-1.5 wrap-anywhere text-tok"><span class="h-2 w-2 shrink-0 rounded-full bg-brand-dot" aria-hidden="true"></span>{f.category.trim()}</span>
        {:else if board}
          <span class="shrink-0 text-sep" aria-hidden="true">•</span><span class="wrap-anywhere">{board.name}</span>
        {/if}
      {/snippet}
      {#snippet right()}
        {#if people.length}<AvatarStack {people} size={28} />{:else}<span class="flex text-fg2"><Icon name="shield" size={18} stroke={1.8} /></span>{/if}
      {/snippet}
    </ListRow>
  </div>
</aside>
