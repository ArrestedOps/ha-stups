<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { valueText } from '../lib/history';
  import { clock } from '../lib/nudge';
  import { ui } from '../lib/store.svelte';
    import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import { dueText, fineChips, modeSummary, nameSymbol, whenParts, type FineKey, type Part } from '../lib/watcher-flow';
  import { noteText, RUN_TEXT } from '../lib/watchers';
  import AssignOrder from './AssignOrder.svelte';
  import CardTile from './CardTile.svelte';
  import DoneEditor from './DoneEditor.svelte';
  import DryRunPanel from './DryRunPanel.svelte';
  import EntityGraph from './EntityGraph.svelte';
  import EntityPicker from './EntityPicker.svelte';
  import EntityRow from './EntityRow.svelte';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';
  import Sheet from './Sheet.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import WatcherSummary from './WatcherSummary.svelte';
  import WatcherThenEditor from './WatcherThenEditor.svelte';
  import WatcherWhenEditor from './WatcherWhenEditor.svelte';
  import WatcherWhoEditor from './WatcherWhoEditor.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Wächter bearbeiten als Ablauf (Entwurf WaechterC): vier Karten, die von oben nach unten verbunden sind (WENN, DANN KARTE, AN WEN, ERLEDIGT SICH
   * SELBST), darunter der Feinschliff als Chips. „Ändern" klappt die Einstellungen der Karte auf (dieselben wie im Assistenten). Oben steht der
   * Satz als Zusammenfassung. Mitglieder sehen alles lesend, auch den Verlauf der Entität.
   */
  let { ed }: { ed: WatcherEditor } = $props();

  const f = $derived(ed.form);
  const readOnly = $derived(ed.readOnly);
  type Open = 'when' | 'then' | 'who' | 'done';
  let open = $state<Open | null>(null);
  const toggleOpen = (k: Open) => (open = open === k ? null : k);
  let fine = $state<FineKey | null>(null);
  let allRuns = $state(false);

  const entityIcon = $derived(nameSymbol(f.entityName));
  const unit = $derived(f.entityUnit || null);
  const num = (s: string): number | null => {
    const n = Number(s.trim().replace(',', '.'));
    return s.trim() === '' || !Number.isFinite(n) ? null : n;
  };
  const threshold = $derived(f.kind === 'below' || f.kind === 'above' ? num(f.value) : null);
  const current = $derived(valueText(ed.history?.current ?? ed.item?.entityState ?? null, ed.history?.kind === 'state' ? null : unit));
  const board = $derived(ui.boards.find((b) => b.id === f.boardId));
  const look = $derived({ icon: f.icon || nameSymbol(f.title) || nameSymbol(f.entityName), iconColor: f.iconColor || null });
  const doneParts = $derived<Part[]>(
    f.doneOn && f.doneEntityId
      ? [{ text: `${t('wenn')} `, bold: false }, ...whenParts({ entityName: f.doneEntityName, entityId: f.doneEntityId, entityUnit: '', kind: f.doneKind, to: f.doneTo, value: f.doneValue, forMin: '0', leadHours: '12', forecastHours: '3' })]
      : [],
  );
  const chips = $derived(fineChips(f));
  const runs = $derived(ed.runs.slice(0, allRuns ? ed.runs.length : 8));
  const status = $derived(
    !ed.item
      ? ''
      : !ed.item.active
        ? t('pausiert')
        : ed.item.status === 'entity_missing'
          ? t('Entität fehlt')
          : ed.item.status === 'target_missing'
            ? t('Board oder Spalte fehlt')
            : ed.item.subscribed
              ? t('aktiv')
              : t('Abo nicht aktiv'),
  );
  const statusBad = $derived(!!ed.item && ed.item.active && !ed.item.subscribed);

  function tapFine(key: FineKey) {
    if (key === 'dedupe') f.dedupe = !f.dedupe;
    else fine = fine === key ? null : key;
  }
</script>

{#snippet saveButton()}
  <button class="inline-flex h-11 items-center px-2 text-[16px] font-bold text-accent-text disabled:opacity-40" disabled={ed.busy || ed.loading} onclick={() => ed.save()}>
    {ed.busy ? t('Speichert …') : t('Speichern')}
  </button>
{/snippet}

{#snippet foot()}
  <div class="grid grid-cols-[1fr_1.4fr] gap-2">
    <CtaButton ghost disabled={ed.busy} onclick={() => ed.test()}><span aria-hidden="true">{t('Testen')}</span><span class="sr-only">{t('Testen: Karte jetzt anlegen')}</span></CtaButton>
    <CtaButton disabled={ed.busy} onclick={() => ed.save()}>{ed.busy ? t('Speichert …') : t('Speichern')}</CtaButton>
  </div>
{/snippet}

{#snippet tag(kind: 'when' | 'then' | 'who' | 'done', text: string)}
  <span class="wtag wtag-{kind}">{text}</span>
{/snippet}

{#snippet change(k: Open)}
  {#if !readOnly}
    <button type="button" class="-my-3 ml-auto inline-flex h-11 shrink-0 items-center px-1 text-[13px] font-semibold text-accent-text" aria-expanded={open === k} onclick={() => toggleOpen(k)}>
      {open === k ? t('Fertig') : t('Ändern')}
    </button>
  {/if}
{/snippet}

<Sheet title={f.name || t('Wächter')} titleClass="text-[17px] font-extrabold whitespace-normal" onclose={ed.back} right={readOnly || ed.loading ? undefined : saveButton} footer={readOnly || ed.loading ? undefined : foot}>
  {#if ed.loading}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <div class="flex flex-col gap-3.5 pt-1">
      {#if readOnly}
        <p class="rounded-row border border-line bg-surface px-4 py-3 text-[15px]" data-testid="watcher-readonly">{t('Nur Administratoren ändern Wächter. Du kannst hier alles ansehen, auch den Verlauf.')}</p>
      {/if}
      <WatcherSummary form={f} personName={ed.personName} />

      <div class="flex flex-col" data-testid="watcher-flow">
        <!-- WENN -->
        <section class="flow-card" aria-label={t('Wenn')}>
          <div class="flex items-center gap-2">
            {@render tag('when', t('WENN'))}
            {#if current}<span class="inline-flex h-[22px] items-center gap-1 rounded-full bg-ok-bg px-2 text-[12px] font-bold text-ok" data-testid="now-badge">● {t('jetzt {value}', { value: current })}</span>{/if}
            {@render change('when')}
          </div>
          {#if ed.picking === 'trigger' && !readOnly}
            <EntityPicker {ed} />
          {:else}
            <EntityRow name={f.entityName || f.entityId} id={f.entityName ? f.entityId : ''} testid="when-entity" onchange={readOnly ? undefined : () => ed.startPicking('trigger')} />
          {/if}
          <div class="flex items-center gap-2">
            <Tile color="purple">{#if entityIcon}<SymbolIcon id={entityIcon} size={24} />{:else}<Icon name="eye" size={24} />{/if}</Tile>
            <p class="text-[15px] leading-[1.45] text-text-soft" data-testid="when-sum">{#each whenParts(f) as p, i (i)}{#if p.bold}<b class="text-fg">{p.text}</b>{:else}{p.text}{/if}{/each}</p>
          </div>
          {#if f.kind !== 'calendar_event' && f.kind !== 'forecast'}
            <EntityGraph compact history={ed.history} busy={ed.historyBusy} name={f.entityName || f.entityId} {unit} {threshold} thresholdState={f.kind === 'state' ? f.to.trim() : null} />
          {/if}
          {#if open === 'when'}<div class="border-t border-line pt-3"><WatcherWhenEditor {ed} graph={false} entityRow={false} /></div>{/if}
        </section>
        <div class="flow-link" aria-hidden="true"></div>

        <!-- DANN KARTE -->
        <section class="flow-card" aria-label={t('Dann Karte')}>
          <div class="flex items-center gap-2">{@render tag('then', t('DANN KARTE'))}{@render change('then')}</div>
          <ListRow wrap inset variant="task" title={f.title.trim() || '…'} check={{ done: false, label: t('Vorschau'), onchange: () => {}, disabled: true }}>
            {#snippet tile()}<CardTile card={look} />{/snippet}
            {#snippet meta()}<span class="shrink-0">{dueText(f)}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span><span class="break-words">{board?.name ?? ''}</span>{/snippet}
            {#snippet right()}<span class="flex text-fg2"><Icon name="shield" size={18} stroke={1.8} /></span>{/snippet}
          </ListRow>
          <p class="text-[12px] text-fg2">{t('So erscheint sie in den Aufgaben.')}</p>
          {#if open === 'then'}<div class="border-t border-line pt-3"><WatcherThenEditor {ed} preview={false} /></div>{/if}
        </section>
        <div class="flow-link" aria-hidden="true"></div>

        <!-- AN WEN -->
        <section class="flow-card" aria-label={t('An wen')}>
          <div class="flex items-center gap-2">
            {@render tag('who', t('AN WEN'))}
            <span class="min-w-0 break-words text-[13px] text-fg2">{modeSummary(f.assignMode)}</span>
            {@render change('who')}
          </div>
          <AssignOrder order={ed.order} />
          {#if open === 'who'}<div class="border-t border-line pt-3"><WatcherWhoEditor {ed} /></div>{/if}
        </section>
        <div class="flow-link" aria-hidden="true"></div>

        <!-- ERLEDIGT SICH SELBST -->
        <section class="flow-card" aria-label={t('Erledigt sich selbst')}>
          <div class="flex items-center gap-2">
            {@render tag('done', t('ERLEDIGT SICH SELBST'))}
            <span class="ml-auto flex items-center gap-1">
              {#if f.doneOn && !readOnly}
                <button type="button" class="inline-flex h-11 shrink-0 items-center px-1 text-[13px] font-semibold text-accent-text" aria-expanded={open === 'done'} onclick={() => toggleOpen('done')}>
                  {open === 'done' ? t('Fertig') : t('Ändern')}
                </button>
              {/if}
              <span class="-my-2.5 flex">
                <Toggle
                  label={t('Automatisch erledigen')}
                  checked={f.doneOn}
                  disabled={readOnly || ed.selfNote !== ''}
                  onchange={(v) => {
                    f.doneOn = v;
                    open = v && !f.doneEntityId ? 'done' : open === 'done' && !v ? null : open;
                  }}
                />
              </span>
            </span>
          </div>
          <p class="text-[15px] leading-[1.45] text-text-soft" data-testid="done-sum">
            {#if doneParts.length > 0}{#each doneParts as p, i (i)}{#if p.bold}<b class="text-fg">{p.text}</b>{:else}{p.text}{/if}{/each}{:else if f.doneOn}{t('Noch keine Entität gewählt')}{:else}{t('Die Karte erledigst du selbst.')}{/if}
          </p>
          {#if ed.selfNote && !f.doneOn}<p class="text-[13px] text-fg2" data-testid="self-note">{ed.selfNote}</p>{/if}
          {#if open === 'done' && f.doneOn}<div class="border-t border-line pt-3"><DoneEditor {ed} /></div>{/if}
        </section>
      </div>

      <SectionHeader title={t('Feinschliff')} />
      <div class="flex flex-wrap gap-2" role="group" aria-label={t('Feinschliff')}>
        {#each chips as c (c.key)}
          <Chip small disabled={readOnly} pressed={c.key === 'dedupe' ? f.dedupe : fine === c.key} onclick={() => tapFine(c.key)}>{c.label}</Chip>
        {/each}
      </div>
      {#if fine && !readOnly}
        <div class="flex items-center justify-between gap-3 rounded-row border border-line bg-surface px-3.5 py-3" data-testid="fine-panel">
          {#if fine === 'name'}
            <input class="min-h-11 w-full bg-transparent text-[16px] font-semibold placeholder:text-dim" bind:value={f.name} maxlength="80" placeholder={t('z. B. Waschmaschine fertig')} aria-label={t('Name des Wächters')} />
          {:else if fine === 'cooldown'}
            <span class="text-[15px] font-bold">{t('Sperrzeit')}<span class="block text-[13px] font-normal text-fg2">{t('gegen flatternde Sensoren')}</span></span>
            <NumberField bind:value={f.cooldownMin} label={t('Sperrzeit in Minuten')} unit={t('Min.')} placeholder="10" />
          {:else if fine === 'nudge'}
            <span class="text-[15px] font-bold">{t('Stupsen, wenn noch offen')}<span class="block text-[13px] font-normal text-fg2">{t('leer = nie')}</span></span>
            <NumberField bind:value={f.nudgeAfterMin} label={t('Stupsen nach Minuten')} unit={t('Min.')} placeholder={t('nie')} />
          {:else if fine === 'count'}
            <span class="text-[15px] font-bold">{t('Erst beim N-ten Mal')}<span class="block text-[13px] font-normal text-fg2">{t('z. B. Saugroboter nach 3 Läufen')}</span></span>
            <NumberField bind:value={f.count} label={t('Anzahl')} unit="×" placeholder="1" />
          {/if}
        </div>
      {/if}

      {#if !readOnly}<DryRunPanel form={f} />{/if}

      {#if ed.item}
        <SectionHeader title={t('Status')} />
        <div class="flex flex-col gap-2">
          <ListRow wrap title={t('Zähler')}>
            {#snippet right()}
              <span class="flex items-center gap-3 text-[14px] text-fg2">
                {ed.item!.trigger.count > 1 ? t('{n} von {total}', { n: ed.item!.counter, total: ed.item!.trigger.count }) : t('nicht aktiv')}
                {#if ed.item!.trigger.count > 1 && !readOnly}
                  <button type="button" class="inline-flex h-[34px] items-center rounded-xl bg-surface2 px-3 text-[13px] font-bold text-text-soft" onclick={() => ed.resetCounter()}>{t('Zurücksetzen')}</button>
                {/if}
              </span>
            {/snippet}
          </ListRow>
          <ListRow wrap title={t('Verbindung')}>
            {#snippet right()}<span class="text-[14px] {statusBad ? 'text-danger' : 'text-fg2'}">{status}</span>{/snippet}
          </ListRow>
          {#each runs as r (r.id)}
            <ListRow wrap title={`${RUN_TEXT[r.result] ?? r.result}${r.note ? ` · ${noteText(r.note)}` : ''}`}>
              {#snippet meta()}<span class="break-words">{t('{time} Uhr', { time: clock(r.at) })}{r.assignedTo.length ? ` · ${r.assignedTo.map(ed.personName).join(', ')}` : ''}</span>{/snippet}
            </ListRow>
          {:else}
            <p class="px-1 text-[15px] text-fg2">{t('Noch keine Läufe.')}</p>
          {/each}
          {#if ed.runs.length > 8}
            <button type="button" class="min-h-11 self-start px-1 text-[15px] font-semibold text-accent-text" onclick={() => (allRuns = !allRuns)}>
              {allRuns ? t('Weniger anzeigen') : t('Älteren Verlauf anzeigen ({n})', { n: ed.runs.length - 8 })}
            </button>
          {/if}
        </div>

        {#if !readOnly}
          <div class="flex flex-col gap-2">
            <ListRow wrap title={f.active ? t('Pausieren') : t('Wieder aktivieren')} onclick={() => ed.togglePause()}>
              {#snippet tile()}<Tile color="gray"><Icon name="bell-off" size={22} stroke={1.8} /></Tile>{/snippet}
            </ListRow>
            <ListRow wrap variant="danger" title={t('Wächter löschen')} onclick={() => ed.askRemove()}>
              {#snippet tile()}<Tile color="red"><Icon name="trash" size={22} stroke={1.8} /></Tile>{/snippet}
            </ListRow>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</Sheet>
