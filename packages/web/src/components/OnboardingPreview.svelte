<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { previewTexts } from '../lib/onboarding.svelte';
  import { ui } from '../lib/store.svelte';
  import Segmented from './ui/Segmented.svelte';

  /**
   * Die Testnachricht, wie sie auf dem iPhone ankommt: Sperrbildschirm mit der Mitteilung der Companion App (Symbol von Home Assistant, nicht von
   * Stups, so kommt sie an), Kartentitel und „Neue Karte für dich · fällig …" wie bei einem echten Wächter. Den Knopf Erledigt gibt es dort erst,
   * wenn man die Mitteilung gedrückt hält: „Normal" und „Gedrückt halten" zeigen beides. Die Uhr ist nur Dekoration.
   */
  let held = $state(ui.desktop);
  const m = $derived(previewTexts());
  const locale = $derived(i18n.lang === 'en' ? 'en-GB' : 'de-DE');
  const when = $derived(new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));
  const time = $derived(new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
</script>

<figure class="m-0 flex flex-col gap-3" data-testid="onboarding-preview">
  <Segmented
    items={[
      { id: 'normal', label: t('Normal') },
      { id: 'held', label: t('Gedrückt halten') },
    ]}
    value={held ? 'held' : 'normal'}
    label={t('Ansicht der Mitteilung')}
    onchange={(id) => (held = id === 'held')}
  />
  <div
    class="flex flex-col items-center gap-1.5 overflow-hidden rounded-[28px] px-3 py-[18px] text-on-media"
    style="background: var(--ios-lock)"
    role="img"
    aria-label={held ? t('Sperrbildschirm eines iPhones mit der Mitteilung von Home Assistant, gedrückt gehalten: darunter der Knopf Erledigt') : t('Sperrbildschirm eines iPhones mit der Mitteilung von Home Assistant')}
  >
    {#if !held}
      <p class="text-[14px] font-semibold opacity-90">{when}</p>
      <p class="mb-3.5 text-[62px] leading-none font-light tabular-nums">{time}</p>
    {:else}
      <div class="h-3"></div>
    {/if}
    <div class="flex w-full items-start gap-[11px] rounded-[22px] px-[13px] py-3 backdrop-blur-md" style="background: var(--ios-glass)">
      <svg class="h-[38px] w-[38px] shrink-0" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="9" fill="var(--ha-blue)" />
        <path d="M9 21 20 11l11 10v9H9z" fill="none" stroke="var(--on-media)" stroke-width="2.6" stroke-linejoin="round" />
        <circle cx="20" cy="22" r="2.2" fill="var(--on-media)" />
      </svg>
      <div class="min-w-0 flex-1">
        <div class="flex justify-between gap-2 text-[15px] leading-tight font-bold"><span data-testid="preview-title">{m.title}</span><span class="shrink-0 text-[12.5px] font-medium opacity-70">{t('jetzt')}</span></div>
        <p class="mt-px text-[15px] leading-[1.3] opacity-95" data-testid="preview-body">{m.body}</p>
      </div>
    </div>
    {#if held}
      <div class="mt-2 w-full overflow-hidden rounded-[20px]" style="background: var(--ios-glass)" data-testid="preview-actions">
        <div class="flex h-12 items-center px-4 text-[16px]">{t('Erledigt')}</div>
      </div>
      <div class="h-1.5"></div>
    {/if}
  </div>
</figure>
