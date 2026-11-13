<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import DryRunPanel from './DryRunPanel.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import WatcherFineEditor from './WatcherFineEditor.svelte';
  import WatcherSummary from './WatcherSummary.svelte';
  import WatcherThenEditor from './WatcherThenEditor.svelte';
  import WatcherWhenEditor from './WatcherWhenEditor.svelte';
  import WatcherWhoEditor from './WatcherWhoEditor.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import Tile, { TILE_COLORS } from './ui/Tile.svelte';
  import { cardTitleWithEntity } from '../lib/cardTitle';
  import { modeSummary, nameSymbol, whenParts } from '../lib/watcher-flow';
  import CtaButton from './ui/CtaButton.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';

  /**
   * Neuer Wächter in vier Schritten (Wenn, Dann, Wer, Feinschliff) nach den Entwürfen WaechterB bis B4: Fortschrittsleiste, eine Frage je Schritt,
   * oben links in jedem Schritt „Zurück" (ein Schritt zurück, die Eingaben bleiben; am Anfang zur vorherigen Auswahl) und rechts „Schließen",
   * unten der große Knopf zum nächsten Schritt; im letzten Schritt „Testen" (Probelauf über 7 Tage) und „Wächter anlegen".
   */
  let { ed }: { ed: WatcherEditor } = $props();

  const f = $derived(ed.form);
  const STEPS = $derived([t('Wenn'), t('Dann'), t('Wer'), t('Feinschliff')]);
  const QUESTION = $derived(
    ed.step === 1
      ? t('Woran merkt Stups, dass etwas zu tun ist?')
      : ed.step === 2
        ? t('Welche Aufgabe soll dann entstehen?')
        : ed.step === 3
          ? f.title.trim() && f.title.trim().length <= 32
            ? t('Wer soll „{title}“ übernehmen?', { title: f.title.trim() })
            : t('Wer soll sich darum kümmern?')
          : t('Fast fertig. Noch Extras?'),
  );
  const NEXT = $derived(ed.step === 1 ? t('Weiter: Dann') : ed.step === 2 ? t('Weiter: Wer') : t('Weiter: Feinschliff'));
  let dry = $state<{ run(): Promise<void> }>();
</script>

{#snippet foot()}
  {#if ed.step === 4}
    <div class="grid grid-cols-[1fr_2fr] gap-2">
      <CtaButton ghost onclick={() => dry?.run()}>{t('Testen')}</CtaButton>
      <CtaButton disabled={ed.busy} onclick={() => ed.save()}><Icon name="check" size={20} stroke={2.6} />{ed.busy ? t('Speichert …') : t('Wächter anlegen')}</CtaButton>
    </div>
  {:else}
    <CtaButton onclick={() => ed.next()}>{NEXT}<Icon name="chevron-right" size={20} stroke={2.4} /></CtaButton>
  {/if}
{/snippet}

{#snippet back()}
  <button type="button" class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" aria-label={t('Zurück')} data-testid="wizard-back" onclick={() => ed.goBack()}>
    {t('Zurück')}
  </button>
{/snippet}

<Sheet title={t('Neuer Wächter')} onclose={ed.back} left={back} footer={ed.loading ? undefined : foot}>
  {#if ed.loading}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <div class="flex flex-col gap-3.5 pt-1">
      <nav class="flex items-center gap-2.5 text-[12.5px] font-semibold text-fg2" aria-label={t('Schritt {n} von 4', { n: ed.step })}>
        <span class="shrink-0">{t('Schritt {n} von 4', { n: ed.step })}</span>
        <span class="h-[5px] min-w-0 flex-1 overflow-hidden rounded-[3px] bg-surface2" aria-hidden="true"><i class="block h-full rounded-[3px] bg-brand-dot" style:width="{ed.step * 25}%"></i></span>
        <span class="shrink-0" aria-current="step">{STEPS[ed.step - 1]}</span>
      </nav>
      <h1 class="mt-1.5 text-[26px] leading-[1.2] font-extrabold tracking-[-0.02em]" data-testid="wizard-question">{QUESTION}</h1>

      {#if ed.step === 1}
        {#if ed.templates.length > 0 && !f.entityId && ed.picking !== 'trigger'}
          <SectionHeader title={t('Vorlage')} />
          <div class="list-group !mt-0" role="group" aria-label={t('Vorlage')}>
            {#each ed.templates as tpl, i (tpl.id)}
              {@const sym = nameSymbol(tpl.title)}
              <ListRow wrap title={tpl.title} onclick={() => ed.applyTemplate(tpl)}>
                {#snippet tile()}<Tile color={TILE_COLORS[i % TILE_COLORS.length]!}>{#if sym}<SymbolIcon id={sym} size={20} />{:else}<Icon name="eye" size={20} />{/if}</Tile>{/snippet}
                {#snippet meta()}<span class="line-clamp-2 whitespace-normal">{tpl.hint}</span>{/snippet}
              </ListRow>
            {/each}
          </div>
          <p class="-mt-1 px-1 text-[12.5px] leading-[1.45] text-hint">{t('Füllt die Schritte vor, alles bleibt änderbar. Danach noch die Entität wählen.')}</p>
        {/if}
        <WatcherWhenEditor {ed} />
      {:else if ed.step === 2}
        <WatcherThenEditor {ed} />
      {:else if ed.step === 3}
        <WatcherWhoEditor {ed} />
      {:else}
        <!-- Kurzfassung wie im Entwurf: WENN, DANN, WER als drei beschriftete Zeilen -->
        <dl class="rounded-row bg-surface px-4 py-3.5" data-testid="wizard-brief">
          <dt class="text-[11px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Wenn')}</dt>
          <dd class="mb-2.5 text-[16px] font-semibold wrap-anywhere">{#each whenParts(f) as p, i (i)}{p.text}{/each}</dd>
          <dt class="text-[11px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Dann')}</dt>
          <dd class="mb-2.5 text-[16px] font-semibold wrap-anywhere">{t('Aufgabe „{title}“', { title: cardTitleWithEntity(f.title, f.kind, f.entityName || f.entityId) || '…' })}</dd>
          <dt class="text-[11px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Wer')}</dt>
          <dd class="text-[16px] font-semibold wrap-anywhere">{modeSummary(f.assignMode)}</dd>
        </dl>
        <WatcherFineEditor {ed} />
        <SectionHeader title={t('Zusammenfassung')} />
        <WatcherSummary form={f} personName={ed.personName} />
        <DryRunPanel bind:this={dry} form={f} button={false} />
      {/if}
    </div>
  {/if}
</Sheet>
