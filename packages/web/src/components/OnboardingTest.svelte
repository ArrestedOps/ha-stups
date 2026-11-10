<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { connectOwnPhone, hasPhone, next, ob, sendTest, testRecipients, testTarget } from '../lib/onboarding.svelte';
  import { openSettings, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import OnboardingCompanion from './OnboardingCompanion.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import OnboardingPreview from './OnboardingPreview.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /**
   * Schritt „Testnachricht": die Vorschau (so kommt sie auf dem iPhone an) und ein Knopf. Der Administrator ist keine Person und wählt, an wessen
   * Handy sie geht. Überspringbar, auch mit erkanntem Handy („Ohne Test weiter"). Kommt sie nicht an, führt „Prüfen" in die bestehende Diagnose.
   * `member`: dieselbe Seite als Kurzfassung „Handy verbinden" für Mitglieder (an sie selbst, ohne Vorschau; Weiter geht zum nächsten Schritt oder
   * zum Ende).
   */
  let { member = false, onnext }: { member?: boolean; onnext?: () => void } = $props();
  onMount(() => member && void connectOwnPhone());

  const recipients = $derived(testRecipients());
  const target = $derived(member ? ui.me : testTarget());
  const phone = $derived(member ? hasPhone(ui.me) : recipients.length > 0);
  const leave = () => (onnext ?? next)();
  const nameOf = $derived(target?.displayName.trim().split(/\s+/)[0] ?? '');
  const colorOf = (id: string) => ui.people.find((p) => p.id === id)?.color ?? null;
</script>

<OnboardingFrame
  title={member ? t('Handy verbinden') : t('Testnachricht')}
  lead={member ? undefined : phone ? t('So kommt eine Nachricht bei jemandem an. Wähle, an wessen Handy sie geht.') : undefined}
>
  {#if member}
    <p class="mb-4 rounded-row border border-line bg-surface px-4 py-3 text-[15px]" data-testid="phone-state">
      {phone ? t('Dein Handy ist verbunden.') : t('Auf diesem Gerät ist noch kein Handy für Nachrichten eingetragen.')}
    </p>
  {:else if phone}
    <!-- Handy: Empfänger, Vorschau, Erklärung untereinander; Desktop: links Empfänger und Erklärung, rechts die Vorschau -->
    <div class="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-x-10">
      <div class="flex flex-wrap gap-2 lg:col-start-1 lg:row-start-1 lg:content-start" role="radiogroup" aria-label={t('Empfänger der Testnachricht')} data-testid="test-recipients">
        {#each recipients as p (p.id)}
          {@const on = target?.id === p.id}
          <button
            type="button"
            role="radio"
            aria-checked={on}
            class="inline-flex h-11 items-center gap-2 rounded-full border-[1.5px] pr-3.5 pl-1.5 text-[15px] font-bold {on ? 'border-accent bg-surface2' : 'border-line bg-surface'}"
            onclick={() => (ob.testTo = p.id)}
          >
            <Avatar person={{ displayName: p.displayName, color: colorOf(p.id) }} size={30} />{p.displayName}
          </button>
        {/each}
      </div>
      <div class="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1"><OnboardingPreview /></div>
      <p class="text-[12.5px] leading-[1.4] text-hint lg:col-start-1 lg:row-start-2" data-testid="preview-note">
        {t('Symbol und Name sind die von Home Assistant: Die Nachricht kommt über die Companion App. Auf dem iPhone erscheint der Knopf Erledigt, wenn du die Nachricht gedrückt hältst. Bei Android ziehst du sie nach unten auf.')}
      </p>
    </div>
  {/if}

  {#if !phone}
    <div class="mt-4 rounded-row border border-line bg-surface px-4 py-3.5" data-testid="test-nopath" role="status">
      <p class="text-[15px] font-bold">{t('Noch kein Handy verbunden')}</p>
      <p class="mt-1 text-[14px] leading-[1.45] text-fg2">
        {member ? t('Öffne Home Assistant auf deinem Handy und melde dich in der Companion App an. Danach erscheint dein Handy hier von selbst.') : t('Bei keiner Person ist ein Handy eingetragen. Öffne Home Assistant auf dem Handy und melde dich in der Companion App an, dann erscheint es hier von selbst.')}
      </p>
      <div class="mt-2"><OnboardingCompanion /></div>
    </div>
  {/if}

  {#if ob.test === 'sent'}
    <p class="mt-4 rounded-row border border-line bg-ok-bg px-4 py-3 text-[15px] font-semibold text-ok" role="status" data-testid="test-sent">
      {member ? t('Gesendet. Schau auf dein Handy: Hast du die Nachricht bekommen?') : t('Gesendet. Schau auf das Handy von {name}: Ist die Nachricht angekommen?', { name: nameOf })}
    </p>
  {:else if ob.test === 'failed'}
    <div class="mt-4 rounded-row bg-danger-bg px-4 py-3" role="alert" data-testid="test-failed">
      <p class="text-[15px] font-semibold text-danger">{t('Die Nachricht ist nicht angekommen.')}</p>
      <p class="mt-1 text-[14px] text-fg2">{t('Prüfe, ob die Companion App auf dem Handy angemeldet ist und Mitteilungen erlaubt sind.')}</p>
      <button type="button" class="mt-1 min-h-11 text-[15px] font-semibold text-accent-text underline underline-offset-2" onclick={() => openSettings('report')}>{t('Prüfen')}</button>
    </div>
  {/if}

  {#snippet footer()}
    {#if ob.test === 'sent'}
      <CtaButton onclick={leave}>{t('Ja, weiter')}</CtaButton>
      <button type="button" class="min-h-11 text-[15px] font-semibold text-fg2" onclick={() => sendTest(member)}>{t('Nochmal senden')}</button>
    {:else}
      <CtaButton disabled={ob.test === 'sending' || !phone} onclick={() => sendTest(member)}>
        {ob.test === 'sending' ? t('Sendet …') : member || !nameOf ? t('Testnachricht senden') : t('Testnachricht an {name} senden', { name: nameOf })}
      </CtaButton>
      <button type="button" class="min-h-11 text-[15px] font-semibold text-fg2" onclick={leave}>{ob.test === 'failed' ? t('Weiter ohne Test') : t('Ohne Test weiter')}</button>
    {/if}
  {/snippet}
</OnboardingFrame>
