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
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';

  /**
   * Neuer Wächter in vier Schritten (Wenn, Dann, Wer, Feinschliff) nach den Entwürfen WaechterB bis B4: Fortschrittsleiste, eine Frage je Schritt,
   * unten „Zurück" und der große Knopf zum nächsten Schritt; im letzten Schritt „Testen" (Probelauf über 7 Tage) und „Wächter anlegen".
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
  <div class="grid grid-cols-[1fr_2fr] gap-2">
    {#if ed.step === 4}
      <CtaButton ghost onclick={() => dry?.run()}>{t('Testen')}</CtaButton>
      <CtaButton disabled={ed.busy} onclick={() => ed.save()}><Icon name="check" size={20} stroke={2.6} />{ed.busy ? t('Speichert …') : t('Wächter anlegen')}</CtaButton>
    {:else}
      <CtaButton ghost onclick={() => (ed.step === 1 ? ed.back() : ed.prev())}>{t('Zurück')}</CtaButton>
      <CtaButton onclick={() => ed.next()}>{NEXT}<Icon name="chevron-right" size={20} stroke={2.4} /></CtaButton>
    {/if}
  </div>
{/snippet}

<Sheet title={t('Neuer Wächter')} onclose={ed.back} footer={ed.loading ? undefined : foot}>
  {#if ed.loading}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <div class="flex flex-col gap-3.5 pt-1">
      <nav class="grid grid-cols-4 gap-1.5" aria-label={t('Schritt {n} von 4', { n: ed.step })}>
        {#each STEPS as label, i (i)}
          {@const n = i + 1}
          {@const state = n < ed.step ? 'done' : n === ed.step ? 'on' : 'todo'}
          <button
            type="button"
            class="-my-[9px] flex flex-col justify-start gap-1.5 py-[9px] text-left text-[12px] font-semibold {state === 'done' ? 'text-step-done' : state === 'on' ? 'text-fg' : 'text-dim'}"
            aria-current={state === 'on' ? 'step' : undefined}
            disabled={n > ed.reached}
            onclick={() => ed.goto(n)}
          >
            <span
              class="block h-[5px] w-full rounded-[3px] {state === 'done' || (state === 'on' && n === 4) ? 'bg-brand-dot' : 'bg-surface2'}"
              style={state === 'on' && n < 4 ? 'background-image: linear-gradient(90deg, var(--brand-dot) 55%, var(--surface2) 55%)' : undefined}
            ></span>
            <span>{n} · {label}</span>
          </button>
        {/each}
      </nav>
      <h1 class="mt-1.5 text-[26px] leading-[1.2] font-extrabold tracking-[-0.02em]" data-testid="wizard-question">{QUESTION}</h1>

      {#if ed.step === 1}
        {#if ed.templates.length > 0 && !f.entityId && ed.picking !== 'trigger'}
          <SectionHeader title={t('Vorlage')} />
          <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('Vorlage')}>
            {#each ed.templates as tpl (tpl.id)}
              <Chip small onclick={() => ed.applyTemplate(tpl)}>{tpl.title}</Chip>
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
        <WatcherFineEditor {ed} />
        <SectionHeader title={t('Zusammenfassung')} />
        <WatcherSummary form={f} personName={ed.personName} />
        <DryRunPanel bind:this={dry} form={f} button={false} />
      {/if}
    </div>
  {/if}
</Sheet>
