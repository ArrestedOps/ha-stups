<script lang="ts">
  import { agenda } from '../lib/agenda.svelte';
  import { deviceTz, formatDue } from '../lib/datetime';
  import { t, tn } from '../lib/i18n/index.svelte';
  import type { ScheduleCard } from '../lib/schedule';
  import { doneProgress, doneSheet, overdueSheet, overdueSinceText, timeOfDay, todaySheet, type ShiftTarget, type StatsKind } from '../lib/statsSheets';
  import { taskStats } from '../lib/tasks';
  import { closeSheet, completeCard, filterListFor, openCardAnywhere, openSheet, personById, reopenCard, shiftCards, ui } from '../lib/store.svelte';
  import AvatarStack from './AvatarStack.svelte';
  import CardTile from './CardTile.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import PillButton from './ui/PillButton.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';

  /**
   * Die drei Blätter hinter der Zahlenleiste in Aufgaben (Mockup „Variante 3"): Heute fällig, Überfällig, Heute erledigt. Alle zeigen die eigenen
   * Aufgaben (wie die Leiste); die Daten sind die der Liste (agenda) und laden mit jeder Änderung (ui.rev) neu. Ein Kind sieht nur seine Aufgaben
   * und kein „Verschieben" (Kinder ändern keine Aufgaben).
   */
  let { kind }: { kind: StatsKind } = $props();

  const tz = deviceTz();
  const nowMs = $derived((void ui.rev, Date.now()));
  const meId = $derived(ui.me?.id ?? null);
  const cards = $derived([...agenda.open, ...agenda.recentDone]);
  const today = $derived(todaySheet(cards, meId, nowMs, tz));
  const overdue = $derived(overdueSheet(cards, meId, nowMs));
  const doneList = $derived(doneSheet(cards, meId, nowMs, tz));
  const progress = $derived(doneProgress(taskStats(cards, meId, nowMs, tz)));

  const TITLE = $derived({ today: t('Heute fällig'), overdue: t('Überfällig'), done: t('Heute erledigt') }[kind]);
  const assignees = (c: ScheduleCard) => c.assigneeIds.map(personById).filter((p) => p !== undefined);
  /** hinter dem Punkt: die erste Kategorie der Aufgabe, sonst das Board */
  const place = (c: ScheduleCard) => c.categories?.[0]?.name ?? c.boardName;
  const canShift = $derived(!ui.isChild);

  const RING = 27;
  const CIRC = 2 * Math.PI * RING;

  const shift = (target: ShiftTarget) => void shiftCards(overdue, target);
</script>

{#snippet sep()}<span class="shrink-0 text-sep" aria-hidden="true">•</span>{/snippet}
{#snippet placeText(c: ScheduleCard)}<span class="min-w-0 truncate">{place(c)}</span>{/snippet}

{#snippet openRow(c: ScheduleCard)}
  <ListRow
    variant="task"
    title={c.title}
    check={{ done: false, label: t('„{title}“ erledigen', { title: c.title }), onchange: () => void completeCard(c), state: kind === 'overdue' ? 'overdue' : undefined }}
    onclick={() => void openCardAnywhere(c)}
  >
    {#snippet tile()}<CardTile card={c} />{/snippet}
    {#snippet meta()}
      {#if kind === 'overdue'}
        <span class="inline-flex shrink-0 items-center gap-1 text-danger" data-testid="since"><Icon name="alert-circle" size={14} stroke={1.9} />{overdueSinceText(c.dueAt!, nowMs, tz)}</span>
      {:else}
        <span class="inline-flex shrink-0 items-center gap-1 text-sig-orange"><Icon name="clock" size={14} stroke={1.9} />{formatDue(c.dueAt!, nowMs, tz)}</span>
      {/if}
      {@render sep()}{@render placeText(c)}
    {/snippet}
    {#snippet right()}
      {#if kind === 'overdue'}
        {#if canShift}<PillButton label={t('„{title}“ auf morgen verschieben', { title: c.title })} onclick={() => void shiftCards([c], 'tomorrow')}>{t('Morgen')}</PillButton>{/if}
      {:else}
        <AvatarStack people={assignees(c)} />
      {/if}
    {/snippet}
  </ListRow>
{/snippet}

{#snippet doneRow(c: ScheduleCard, undo: boolean)}
  <ListRow
    variant="task"
    title={c.title}
    strike
    check={{ done: true, label: t('Bereits erledigt'), onchange: () => undefined, disabled: true }}
    onclick={() => void openCardAnywhere(c)}
  >
    {#snippet tile()}<CardTile card={c} />{/snippet}
    {#snippet meta()}
      <span class="inline-flex shrink-0 items-center gap-1 text-sig-green" data-testid="done-at"><Icon name="done" size={14} stroke={1.9} />{undo ? timeOfDay(c.completedAt!, tz) : t('um {time}', { time: timeOfDay(c.completedAt!, tz) })}</span>
      {@render sep()}{@render placeText(c)}
    {/snippet}
    {#snippet right()}
      {#if undo}
        <PillButton label={t('„{title}“ wieder öffnen', { title: c.title })} onclick={() => void reopenCard(c)}><Icon name="undo" size={13} stroke={2.2} />{t('Rückgängig')}</PillButton>
      {:else}
        <AvatarStack people={assignees(c)} />
      {/if}
    {/snippet}
  </ListRow>
{/snippet}

<Sheet title={TITLE} onclose={closeSheet}>
  <div class="flex flex-col gap-3 pt-1" data-testid="stats-sheet" data-kind={kind}>
    {#if !agenda.loaded}
      <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
    {:else if kind === 'today'}
      <div class="flex items-center gap-3 rounded-row border border-line bg-surface p-3.5">
        <span class="text-[34px] leading-none font-extrabold tracking-tight text-sig-orange" data-testid="stats-big">{today.total}</span>
        <span class="text-[13px] leading-[1.4] text-fg2">
          {today.total === 1 ? t('Aufgabe für heute.') : t('Aufgaben für heute.')}<br />
          {#if today.total === 0}
            {t('Für heute ist nichts fällig.')}
          {:else if today.open.length === 0}
            {t('Alles erledigt 🎉')}
          {:else}
            {t('{done} davon schon erledigt, {open} offen.', { done: today.done.length, open: today.open.length })}
          {/if}
        </span>
      </div>
      {#if today.open.length > 0}
        <SectionHeader title={t('Bis heute Abend')} icon="calendar" count={today.open.length} />
        <ul class="flex flex-col gap-2">{#each today.open as c (c.id)}<li>{@render openRow(c)}</li>{/each}</ul>
      {/if}
      {#if today.done.length > 0}
        <div class="text-fg2"><SectionHeader title={t('Schon erledigt')} icon="done" count={today.done.length} /></div>
        <ul class="flex flex-col gap-2">{#each today.done as c (c.id)}<li>{@render doneRow(c, false)}</li>{/each}</ul>
      {/if}
      <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Tippe eine Aufgabe an, um sie zu öffnen. Mit dem Kreis hakst du sie ab.')}</p>
    {:else if kind === 'overdue'}
      {#if overdue.length === 0}
        <div class="py-10 text-center" data-testid="stats-empty">
          <p class="text-[17px] font-semibold">{t('Nichts überfällig 🎉')}</p>
          <p class="mt-1 text-[15px] text-fg2">{t('Alles im Zeitplan.')}</p>
        </div>
      {:else}
        <div class="flex items-center gap-3 rounded-row border border-danger/35 bg-surface p-3.5">
          <span class="text-[34px] leading-none font-extrabold tracking-tight text-sig-red" data-testid="stats-big">{overdue.length}</span>
          <span class="text-[13px] leading-[1.4] text-fg2">
            {overdue.length === 1 ? t('Aufgabe ist überfällig.') : t('Aufgaben sind überfällig.')}<br />
            {canShift ? t('Erledige sie oder schiebe sie auf später.') : t('Erledige sie, sobald es geht.')}
          </span>
        </div>
        <ul class="flex flex-col gap-2">{#each overdue as c (c.id)}<li>{@render openRow(c)}</li>{/each}</ul>
        {#if canShift}
          <div class="flex flex-wrap gap-2" role="group" aria-label={t('Alle verschieben')}>
            <PillButton primary onclick={() => shift('today')}>{t('Alle auf heute')}</PillButton>
            <PillButton onclick={() => shift('tomorrow')}>{t('Alle auf morgen')}</PillButton>
            <PillButton onclick={() => shift('weekend')}>{t('Wochenende')}</PillButton>
          </div>
          <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('„Morgen“ verschiebt nur diese Aufgabe. Der Termin behält seine Uhrzeit. Das Verschieben lässt sich mit „Rückgängig“ zurücknehmen.')}</p>
        {/if}
      {/if}
    {:else}
      <div class="flex items-center gap-3 rounded-row border border-line bg-surface p-3.5">
        <svg class="h-16 w-16 shrink-0" viewBox="0 0 64 64" role="img" aria-label={t('{done} von {total} geschafft', { done: progress.done, total: progress.total })} data-testid="stats-ring" data-fraction={progress.fraction.toFixed(3)}>
          <circle cx="32" cy="32" r={RING} fill="none" stroke="currentColor" stroke-width="7" class="text-count" />
          {#if progress.fraction > 0}
            <circle cx="32" cy="32" r={RING} fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" class="text-sig-green" stroke-dasharray="{(CIRC * progress.fraction).toFixed(1)} 999" transform="rotate(-90 32 32)" />
          {/if}
          <text x="32" y="37" text-anchor="middle" font-size="16" font-weight="800" class="fill-fg">{progress.done}</text>
        </svg>
        <span class="text-[13px] leading-[1.4] text-fg2">
          <b class="text-[15px] font-bold text-fg" data-testid="stats-title">
            {#if progress.total === 0}{t('Heute ist nichts fällig')}{:else if progress.open === 0}{t('Alles geschafft 🎉')}{:else if progress.done === 0}{t('{done} von {total} geschafft', { done: progress.done, total: progress.total })}{:else}{t('{done} von {total} geschafft 👏', { done: progress.done, total: progress.total })}{/if}
          </b><br />
          {#if progress.open > 0}{tn('{n} Aufgabe ist noch offen.', '{n} Aufgaben sind noch offen.', progress.open)}{:else}{t('Nichts mehr offen für heute.')}{/if}
        </span>
      </div>
      {#if doneList.length === 0}
        <div class="py-8 text-center" data-testid="stats-empty">
          <p class="text-[17px] font-semibold">{t('Heute noch nichts erledigt')}</p>
          <p class="mt-1 text-[15px] text-fg2">{t('Was du abhakst, steht hier.')}</p>
        </div>
      {:else}
        <SectionHeader title={t('Heute')} icon="done" count={doneList.length} />
        <ul class="flex flex-col gap-2">{#each doneList as c (c.id)}<li>{@render doneRow(c, true)}</li>{/each}</ul>
        <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Mit „Rückgängig“ ist die Aufgabe wieder offen. Gestern und älter findest du im Archiv.')}</p>
      {/if}
    {/if}
  </div>
  {#snippet footer()}
    {#if kind === 'done'}
      <CtaButton ghost onclick={() => openSheet({ type: 'archive', from: 'stats' })}>{t('Archiv öffnen')}</CtaButton>
    {:else}
      <CtaButton ghost onclick={() => filterListFor(kind)}><Icon name="sliders" size={20} stroke={1.9} />{t('In der Liste filtern')}</CtaButton>
    {/if}
  {/snippet}
</Sheet>
