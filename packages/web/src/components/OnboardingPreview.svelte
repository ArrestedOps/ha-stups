<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { previewTexts } from '../lib/onboarding.svelte';
  import Segmented from './ui/Segmented.svelte';

  /**
   * Die Testnachricht, wie sie auf dem iPhone ankommt: Sperrbildschirm mit der Mitteilung der Companion App (Symbol von Home Assistant, nicht von
   * Stups, so kommt sie an), Kartentitel und „Neue Karte für dich · fällig …" wie bei einem echten Wächter. Den Knopf Erledigt gibt es dort erst,
   * wenn man die Mitteilung gedrückt hält: „Normal" und „Gedrückt halten" zeigen beides. Die Uhr ist nur Dekoration.
   */
  /** Das Symbol von Home Assistant (Material Design Icons, home-assistant), weiß auf dem blauen Quadrat der Companion App */
  const HA_GLYPH =
    'M21.8 13H20v8h-7v-3.33l2.79-2.79.71.12a2.1 2.1 0 1 0-2.1-2.1l.1.71-1.5 1.52V9.65a2.1 2.1 0 1 0-2.1 0v5.48l-1.5-1.52.1-.71a2.1 2.1 0 1 0-2.1 2.1l.71-.12L11 17.67V21H4v-8H2.25c-.42 0-.83 0-.83-.21 0-.22.42-.64.86-1.07L11 3c.33-.33.67-.67 1-.67s.67.34 1 .67l4 4V6h2v3l2.78 2.78c.42.42.82.84.82 1.05 0 .21-.4.17-.8.17z';
  let held = $state(false);
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
    class="flex flex-col items-center gap-1.5 overflow-hidden rounded-[28px] px-3 pt-[18px] pb-4 text-on-media"
    style="background: var(--ios-lock)"
    role="img"
    aria-label={held ? t('Sperrbildschirm eines iPhones mit der Mitteilung von Home Assistant, gedrückt gehalten: darunter der Knopf Erledigt') : t('Sperrbildschirm eines iPhones mit der Mitteilung von Home Assistant')}
  >
    <p class="text-[14px] font-semibold opacity-90">{when}</p>
    <p class="mb-5 text-[62px] leading-none font-light tabular-nums">{time}</p>
    <!-- Gedrückt gehalten ist die Mitteilung dunkler und zeigt den ganzen Titel; normal ist er auf eine Zeile gekürzt -->
    <div class="flex w-full items-start gap-[11px] rounded-[22px] px-[13px] py-3 backdrop-blur-md" style="background: var({held ? '--ios-glass-held' : '--ios-glass'})">
      <svg class="h-[38px] w-[38px] shrink-0" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="9" style="fill: var(--ha-blue)" />
        <path transform="translate(6 6) scale(1.1667)" d={HA_GLYPH} style="fill: var(--on-media)" />
      </svg>
      <div class="min-w-0 flex-1">
        <div class="flex justify-between gap-2 text-[11.5px] leading-tight font-semibold tracking-wide uppercase opacity-70">
          <span>{t('Zeitkritisch')}</span><span class="shrink-0 font-medium normal-case">{t('jetzt')}</span>
        </div>
        <p class="mt-0.5 text-[15px] leading-tight font-bold {held ? '' : 'truncate'}" data-testid="preview-title">{m.title}</p>
        <p class="mt-px text-[15px] leading-[1.3] opacity-95" data-testid="preview-body">{m.body}</p>
      </div>
    </div>
    {#if held}
      <!-- Der Knopf Erledigt ist ein eigener Streifen unter der Mitteilung -->
      <div class="mt-2 flex h-[54px] w-[68%] items-center rounded-full px-[22px] text-[17px] backdrop-blur-md" style="background: var(--ios-glass-held)" data-testid="preview-actions">{t('Erledigt')}</div>
    {/if}
  </div>
</figure>
