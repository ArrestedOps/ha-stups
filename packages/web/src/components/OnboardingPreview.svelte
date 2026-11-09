<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { previewTexts } from '../lib/onboarding.svelte';

  /**
   * Die Testnachricht, wie sie erscheint, wenn man sie auf dem Handy gedrückt hält: Titel, Text und die Knöpfe Erledigt und Später.
   * Die Texte sind dieselben, die „Testnachricht senden" verschickt (previewTexts). Die Uhrzeit ist nur Dekoration.
   */
  const m = $derived(previewTexts());
  const when = $derived(new Date().toLocaleDateString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { weekday: 'long', day: 'numeric', month: 'long' }));
  const time = $derived(new Date().toLocaleTimeString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' }));
</script>

<figure class="m-0 flex flex-col items-center gap-3 rounded-[24px] border border-line bg-surface px-4 py-5" aria-label={t('Vorschau der Testnachricht')} data-testid="onboarding-preview">
  <p class="text-[13px] text-fg2">{when}</p>
  <p class="-mt-2 text-[44px] leading-none font-light tabular-nums">{time}</p>
  <div class="w-full max-w-[340px] rounded-[18px] bg-surface2 px-3.5 py-3">
    <div class="flex items-center gap-2 text-[12px] text-fg2">
      <span class="flex h-5 w-5 items-center justify-center rounded-md bg-accent-grad text-[11px] font-extrabold text-on-accent" aria-hidden="true">s</span>
      <span class="font-semibold">stups</span>
      <span class="ml-auto">{t('jetzt')}</span>
    </div>
    <p class="mt-1.5 text-[15px] font-bold" data-testid="preview-title">{m.title}</p>
    <p class="text-[14px] text-fg2" data-testid="preview-body">{m.body}</p>
    <div class="mt-3 flex gap-2" aria-hidden="true">
      <span class="flex h-9 flex-1 items-center justify-center rounded-xl bg-surface text-[14px] font-semibold">{t('Erledigt')}</span>
      <span class="flex h-9 flex-1 items-center justify-center rounded-xl bg-surface text-[14px] font-semibold">{t('Später')}</span>
    </div>
  </div>
  <figcaption class="max-w-[340px] text-center text-[12.5px] leading-[1.4] text-hint">{t('So sieht sie aus, wenn du sie auf dem Handy gedrückt hältst.')}</figcaption>
</figure>
