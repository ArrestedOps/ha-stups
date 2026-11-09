<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { assignees, enableWatchers, loadHits, next, ob, toggleHit } from '../lib/onboarding.svelte';
  import { rankHits } from '../lib/onboarding';
  import { ui } from '../lib/store.svelte';
  import { watcherFormFromHit } from '../lib/watcherFromHit';
  import Icon from './Icon.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import WatcherSummary from './WatcherSummary.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Schritt „Das haben wir bei dir gefunden": der beste Treffer groß, mit der Regel als Satz und dem Probelauf der letzten 7 Tage,
   * bis zu zwei weitere als Zeilen mit Schalter. Ein Tipp legt die Wächter mit den Voreinstellungen der Vorlagen an (keine Rückfragen).
   */
  onMount(() => void loadHits());

  const ranked = $derived(rankHits(ob.hits ?? []));
  const total = $derived(ob.hits?.length ?? 0);
  const board = $derived(ui.boards.find((b) => b.visibility === 'all') ?? ui.boards[0]);
  const titleOf = (id: string) => ob.templates.find((x) => x.id === id)?.title ?? id;
  const personName = (id: string) => ui.people.find((p) => p.id === id)?.displayName ?? '?';
  /** Der Satz zur Regel: dasselbe Formular, das beim Anlegen entsteht */
  const form = $derived.by(() => {
    const best = ranked.best;
    const template = best ? ob.templates.find((x) => x.id === best.templateId) : undefined;
    if (!best || !template || !board) return null;
    return watcherFormFromHit({ template, hit: best, boardId: board.id, columnId: 'satz', personIds: assignees() });
  });
  const wanted = $derived([ranked.best, ...ranked.others].filter((h) => h && ob.on.includes(h.entityId) && !ob.created.includes(h.entityId)).length);

  async function proceed() {
    if (wanted === 0 || (await enableWatchers())) next();
  }
</script>

<OnboardingFrame title={t('Das haben wir bei dir gefunden')} lead={ob.hits && total > 0 ? t('Stups hat dein Haus durchsucht. Schalte ein, was dir helfen soll.') : undefined}>
  {#if ob.hits === null}
    <p class="py-8 text-center text-fg2">{t('Stups sieht in Home Assistant nach …')}</p>
  {:else if total === 0}
    <p class="rounded-row border border-line bg-surface px-4 py-4 text-[15px] leading-[1.45] text-fg2" data-testid="watcher-empty">
      {t('Wir haben noch nichts gefunden. Du kannst Wächter später unter Wächter einrichten.')}
    </p>
  {:else if ranked.best}
    {@const best = ranked.best}
    <section class="rounded-row border border-line bg-surface px-4 py-4" data-testid="best-hit">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="text-[18px] font-extrabold">{titleOf(best.templateId)}</h2>
          <p class="mt-0.5 text-[13px] text-fg2">{t('Gefunden: {reason}', { reason: best.reason })}</p>
        </div>
        <Toggle checked={ob.on.includes(best.entityId)} label={t('{name} einschalten', { name: titleOf(best.templateId) })} onchange={() => toggleHit(best.entityId)} />
      </div>
      {#if form}<div class="mt-3"><WatcherSummary {form} {personName} /></div>{/if}
      {#if ob.dry}
        <p class="mt-3 text-[13.5px]" data-testid="onboarding-dry">
          <span class="text-fg2">{t('Probelauf, letzte 7 Tage:')}</span> <b>{ob.dry.sentence}</b>
        </p>
      {/if}
    </section>

    {#if ranked.others.length > 0}
      <h2 class="mt-5 mb-2 px-1 text-[12px] font-bold tracking-wide text-hint uppercase">{t('Auch gefunden')}</h2>
      <ul class="flex flex-col gap-2">
        {#each ranked.others as h (h.templateId + h.entityId)}
          <li class="flex items-center gap-3 rounded-row border border-line bg-surface px-4 py-2" data-testid="other-hit">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[16px] font-bold">{titleOf(h.templateId)}</span>
              <span class="block truncate text-[13px] text-fg2">{h.name}</span>
            </span>
            <Toggle checked={ob.on.includes(h.entityId)} label={t('{name} einschalten', { name: `${titleOf(h.templateId)}: ${h.name}` })} onchange={() => toggleHit(h.entityId)} />
          </li>
        {/each}
      </ul>
    {/if}
    {#if total > 1 + ranked.others.length}
      <p class="mt-4 flex gap-2 px-1 text-[13px] leading-[1.45] text-hint"><Icon name="info" size={16} />{t('Weitere Vorschläge findest du später unter Wächter › Gefunden.')}</p>
    {/if}
  {/if}

  {#snippet footer()}
    <CtaButton disabled={ob.busy || ob.hits === null} onclick={proceed}>
      {wanted > 0 ? tn('{n} Wächter einschalten', '{n} Wächter einschalten', wanted) : t('Weiter')}
    </CtaButton>
    {#if wanted > 0}
      <button type="button" class="min-h-11 text-[15px] font-semibold text-fg2" disabled={ob.busy} onclick={next}>{t('Nicht jetzt')}</button>
    {/if}
  {/snippet}
</OnboardingFrame>
