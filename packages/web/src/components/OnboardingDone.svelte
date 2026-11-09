<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { columnForNew } from '../lib/calendar';
  import { deviceTz, isFuture } from '../lib/datetime';
  import { i18n, t, tn } from '../lib/i18n/index.svelte';
  import { finish, ob } from '../lib/onboarding.svelte';
  import { parseQuickAdd } from '../lib/quickadd';
  import { blockingProblem, chipLabel } from '../lib/quickadd/labels';
  import { feat, openSettings, openSheet, toast, ui } from '../lib/store.svelte';
  import { columnForDue } from '../lib/swipe';
  import Icon from './Icon.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /**
   * Schritt „Fertig": nur, was wirklich passiert ist, steht mit Haken da; Übersprungenes steht als „Später einrichten" mit Link in die
   * Einstellungen. Optional: die erste Aufgabe per Schnell-Eingabe (derselbe Parser wie „Neue Aufgabe") und der Dashboard-Knopf.
   */
  const tz = deviceTz();
  const parsed = $derived(
    parseQuickAdd(ob.quickTitle, {
      now: Date.now(),
      tz,
      lang: i18n.lang,
      defaultTime: ui.settings?.defaultDueTime ?? '09:00',
      people: ui.people.filter((p) => p.isPerson),
      categories: ui.view?.categories ?? [],
      ignore: new Set<string>(),
    }),
  );
  const problem = $derived(blockingProblem(parsed));
  const typed = $derived(ob.quickTitle.trim() !== '');

  /** Die Aufgabe anlegen (Spalte wie beim „+": erste offene, mit Termin nach heute „Geplant") und zu den Aufgaben */
  async function create() {
    if (!typed) return finish();
    if (ob.busy || problem || !parsed.title || !ui.boardId || !ui.view) return;
    ob.busy = true;
    try {
      const columns = ui.view.columns;
      const columnId = columnForDue(columns, columnForNew(columns, isFuture(parsed.dueAt)) ?? '', isFuture(parsed.dueAt));
      const ids = parsed.assignees.flatMap((a) => (a.personId ? [a.personId] : []));
      await api.createCard(ui.boardId, {
        columnId,
        title: parsed.title,
        assigneeIds: ids.length > 0 ? ids : ui.me?.isPerson ? [ui.me.id] : [],
        dueAt: parsed.dueAt,
        recurrence: parsed.recurrence,
        remindBeforeMin: null,
        reminder: null,
        priority: parsed.priority,
        effort: null,
        categoryIds: [],
        costCents: null,
      });
      ob.busy = false;
      await finish();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Anlegen fehlgeschlagen'), { tone: 'error' });
      ob.busy = false;
    }
  }

  const rows = $derived([
    ob.peopleDone
      ? { ok: true, title: tn('{n} Person eingerichtet', '{n} Personen eingerichtet', ob.peopleNames.length), meta: ob.peopleNames.join(', '), page: null }
      : feat.ha
        ? { ok: false, title: t('Personen'), meta: t('Später einrichten'), page: 'people' as const }
        : null,
    ob.watchersDone
      ? { ok: true, title: tn('{n} Wächter aktiv', '{n} Wächter aktiv', ob.watcherNames.length), meta: ob.watcherNames.join(', '), page: null }
      : feat.watchers && feat.ha
        ? { ok: false, title: t('Wächter'), meta: t('Später einrichten'), page: 'watchers' as const }
        : null,
    ob.testDone
      ? { ok: true, title: t('Testnachricht gesendet'), meta: '', page: null }
      : { ok: false, title: t('Testnachricht'), meta: t('Später einrichten'), page: 'notifications' as const },
  ]);
</script>

<OnboardingFrame title={t('Stups läuft.')} lead={t('Ab jetzt meldet sich dein Zuhause von selbst. Alles, was du hier nicht gemacht hast, findest du später in den Einstellungen.')}>
  <ul class="flex flex-col gap-2" data-testid="done-list">
    {#each rows as r (r?.title)}
      {#if r}
        <li class="flex items-center gap-3 rounded-row border border-line bg-surface px-4 py-3">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full {r.ok ? 'bg-ok-bg text-ok' : 'border border-line text-hint'}" aria-hidden="true">
            {#if r.ok}<Icon name="check" size={16} stroke={3} />{/if}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[16px] font-bold">{r.title}</span>
            {#if r.meta}<span class="block truncate text-[13px] text-fg2">{r.meta}</span>{/if}
          </span>
          {#if !r.ok && r.page}
            <button type="button" class="min-h-11 shrink-0 px-1 text-[14px] font-semibold text-accent-text" aria-label={t('{name} in den Einstellungen öffnen', { name: r.title })} onclick={() => (r.page === 'people' ? openSheet({ type: 'people' }) : openSettings(r.page === 'watchers' ? 'watchers' : 'notifications'))}>{t('Öffnen')}</button>
          {/if}
        </li>
      {/if}
    {/each}
  </ul>

  {#if !ui.isChild}
    <h2 class="mt-6 mb-2 px-1 text-[12px] font-bold tracking-wide text-hint uppercase">{t('Als Nächstes (optional)')}</h2>
    <section class="rounded-row border border-line bg-surface px-4 py-3.5">
      <label for="ob-quick" class="text-[16px] font-bold">{t('Deine erste Aufgabe')}</label>
      <input
        id="ob-quick"
        type="text"
        bind:value={ob.quickTitle}
        maxlength="200"
        autocomplete="off"
        placeholder={t('Müll raus morgen 19 Uhr @Ben jede Woche')}
        class="mt-2 min-h-12 w-full rounded-xl bg-surface2 px-3 text-[16px]"
        onkeydown={(e) => e.key === 'Enter' && void create()}
      />
      {#if parsed.tokens.length > 0}
        <p class="mt-2 flex flex-wrap gap-1.5" data-testid="quick-chips">
          {#each parsed.tokens as tok (tok.id)}
            <span class="rounded-lg bg-surface2 px-2 py-1 text-[13px] font-semibold {tok.status === 'unknown' || tok.status === 'ambiguous' ? 'text-danger' : 'text-accent-text'}">{chipLabel(tok, parsed, tz)}</span>
          {/each}
        </p>
      {/if}
      {#if problem}<p class="mt-2 text-[13px] text-danger" role="alert">{problem}</p>{/if}
      <p class="mt-2 text-[12.5px] leading-[1.4] text-hint">{t('Schreib einfach los: Stups versteht Datum, Person und Wiederholung.')}</p>
    </section>
    {#if feat.haUi && ui.isAdmin}
      <button type="button" class="mt-2 flex min-h-12 w-full items-center gap-3 rounded-row border border-line bg-surface px-4 text-left" onclick={() => openSettings('bubble')}>
        <span class="min-w-0 flex-1 text-[15px] font-semibold">{t('Stups als Dashboard-Knopf hinzufügen')}</span>
        <Icon name="chevron-right" size={18} />
      </button>
    {/if}
  {/if}

  {#snippet footer()}
    <CtaButton disabled={ob.busy || (typed && !!problem)} onclick={create}>{typed ? t('Aufgabe anlegen und loslegen') : t('Zu den Aufgaben')}</CtaButton>
    {#if typed}<button type="button" class="min-h-11 text-[15px] font-semibold text-fg2" disabled={ob.busy} onclick={finish}>{t('Ohne Aufgabe zu Stups')}</button>{/if}
  {/snippet}
</OnboardingFrame>
