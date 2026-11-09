<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { begin, back, finish, next, ob, skipAll, stepsNow } from '../lib/onboarding.svelte';
  import { ui } from '../lib/store.svelte';
  import type { Step } from '../lib/onboarding';
  import Icon from './Icon.svelte';
  import OnboardingColor from './OnboardingColor.svelte';
  import OnboardingDone from './OnboardingDone.svelte';
  import OnboardingPeople from './OnboardingPeople.svelte';
  import OnboardingPreview from './OnboardingPreview.svelte';
  import OnboardingTest from './OnboardingTest.svelte';
  import OnboardingWatcher from './OnboardingWatcher.svelte';
  import OnboardingWelcome from './OnboardingWelcome.svelte';

  /**
   * Die Einrichtung beim ersten Start (docs/onboarding/README.md): Vollbild auf dem Handy, ab 1024 px ein zentrierter Dialog mit dem
   * Fortschritt links und der Vorschau der Nachricht rechts. Liegt unter den Fenstern (z-30), damit „Prüfen" und die Einstellungen darüber aufgehen.
   * Administratoren: Willkommen, Personen, Wächter, Test, Fertig. Mitglieder: Handy, Farbe. Kinder: Handy.
   */
  onMount(begin);

  const steps = $derived(stepsNow());
  const index = $derived(steps.indexOf(ob.step));
  /** Der Fortschritt zählt ohne den Willkommen-Schritt (Schritt 1 von 4 = Personen) */
  const counted = $derived(steps.filter((s) => s !== 'welcome'));
  const label = (s: Step): string =>
    ({ welcome: t('Willkommen'), people: t('Personen'), watcher: t('Erster Wächter'), test: t('Testnachricht'), done: t('Fertig'), phone: t('Handy verbinden'), color: t('Farbe') })[s];

  /** Oben rechts: „Überspringen" im ersten Schritt, „Später" in den Schritten, die man nachholen kann */
  const skip = $derived.by((): { text: string; run: () => void } | null => {
    if (ob.step === 'welcome') return { text: t('Überspringen'), run: () => void skipAll() };
    if (ob.step === 'people' || ob.step === 'watcher') return { text: t('Später'), run: next };
    if (ob.step === 'phone') return { text: t('Später'), run: () => (steps.length > 1 ? next() : void finish()) };
    return null;
  });
  const showPreview = $derived(ui.desktop && (ob.step === 'watcher' || ob.step === 'test'));
</script>

<div class="fixed inset-0 z-30 flex items-stretch justify-center bg-bg lg:items-center lg:bg-bg-dim lg:p-8" role="dialog" aria-modal="true" aria-label={t('Einrichtung')} data-testid="onboarding">
  <div class="flex min-h-0 w-full max-w-[720px] flex-col bg-bg lg:h-[min(720px,100%)] lg:max-w-[1040px] lg:flex-row lg:overflow-hidden lg:rounded-[28px] lg:border lg:border-line">
    <!-- Desktop: Fortschritt links -->
    <aside class="hidden w-[250px] shrink-0 flex-col border-r border-line bg-surface px-6 py-8 lg:flex" aria-label={t('Fortschritt')}>
      <p class="text-[24px] font-extrabold">stups<span class="text-accent">.</span></p>
      <p class="mt-1 text-[13px] leading-[1.4] text-fg2">{t('Dauert etwa 3 Minuten. Du kannst jeden Schritt überspringen und später in den Einstellungen nachholen.')}</p>
      <ol class="mt-8 flex flex-col gap-1">
        {#each counted as s, i (s)}
          <li class="flex min-h-11 items-center gap-3 text-[15px] {s === ob.step ? 'font-extrabold' : 'text-fg2'}" aria-current={s === ob.step ? 'step' : undefined}>
            <span class="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold {steps.indexOf(s) < index ? 'bg-ok-bg text-ok' : s === ob.step ? 'bg-accent-grad text-on-accent' : 'border border-line'}">
              {#if steps.indexOf(s) < index}<Icon name="check" size={14} stroke={3} />{:else}{i + 1}{/if}
            </span>
            {label(s)}
          </li>
        {/each}
      </ol>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex shrink-0 items-center gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))] lg:px-6 lg:pt-6">
        <div class="w-20">
          {#if index > 0}
            <button type="button" class="flex h-11 w-11 items-center justify-center rounded-xl" aria-label={t('Zurück')} disabled={ob.busy} onclick={back}><Icon name="arrow-left" size={22} /></button>
          {/if}
        </div>
        <p class="min-w-0 flex-1 text-center text-[13px] font-semibold text-fg2">
          {#if steps.length > 1 && ob.step !== 'welcome'}{t('Schritt {i} von {n}', { i: counted.indexOf(ob.step) + 1, n: counted.length })}{/if}
        </p>
        <div class="flex w-20 justify-end">
          {#if skip}<button type="button" class="min-h-11 px-3 text-[15px] font-semibold text-accent-text" disabled={ob.busy} onclick={skip.run}>{skip.text}</button>{/if}
        </div>
      </header>
      {#if steps.length > 1}
        <div class="mx-5 mt-1 flex shrink-0 gap-1.5 lg:mx-10" aria-hidden="true">
          {#each steps as s, i (s)}<span class="h-1 flex-1 rounded-full {i <= index ? 'bg-accent' : 'bg-track'}"></span>{/each}
        </div>
      {/if}

      {#key ob.step}
        {#if ob.step === 'welcome'}
          <OnboardingWelcome />
        {:else if ob.step === 'people'}
          <OnboardingPeople />
        {:else if ob.step === 'watcher'}
          <OnboardingWatcher />
        {:else if ob.step === 'test'}
          <OnboardingTest />
        {:else if ob.step === 'done'}
          <OnboardingDone />
        {:else if ob.step === 'phone'}
          <OnboardingTest member onnext={steps.length > 1 ? next : finish} />
        {:else if ob.step === 'color'}
          <OnboardingColor />
        {/if}
      {/key}
    </div>

    <!-- Desktop: Vorschau der Nachricht rechts, wo sie zu dem Schritt gehört -->
    {#if showPreview}
      <aside class="hidden w-[330px] shrink-0 flex-col justify-center border-l border-line bg-surface2 px-5 lg:flex" aria-label={t('Vorschau')}>
        <p class="mb-3 text-[12px] font-bold tracking-wide text-hint uppercase">{t('So kommt es bei dir an')}</p>
        <OnboardingPreview />
      </aside>
    {/if}
  </div>
</div>
