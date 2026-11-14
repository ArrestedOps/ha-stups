<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import { t } from '../lib/i18n/index.svelte';
  import { toast, ui, type NewWatcherRequest } from '../lib/store.svelte';
  import { autoName, deskProblem, formDirty } from '../lib/watcher-desk';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import type { WatcherSuggestion } from '../lib/watcher-types';
  import type { WatcherForm } from '../lib/watchers';
  import DryRunPanel from './DryRunPanel.svelte';
  import Icon from './Icon.svelte';
  import WatcherDeskPreview from './WatcherDeskPreview.svelte';
  import WatcherDeskThen from './WatcherDeskThen.svelte';
  import WatcherDeskWhen from './WatcherDeskWhen.svelte';
  import WatcherDeskWho from './WatcherDeskWho.svelte';
  import WatcherFineEditor from './WatcherFineEditor.svelte';
  import Chip from './ui/Chip.svelte';

  /**
   * „Neuer Wächter“ am Desktop: ein Formular statt vier Schritte, aufgeklappt über der Liste der Wächter. Links die Blöcke Wenn, Dann und
   * „Wer bekommt die Aufgabe?“, darunter „Mehr Einstellungen“ (eingeklappt); rechts die Vorschau (bei weniger Platz darunter); unten Name,
   * Probelauf, Abbrechen und „Wächter anlegen“. Zustand und Speichern gehören dem Editor (`ed`), derselbe wie im Assistenten am Handy:
   * so kommt auch hier die Rückfrage, wenn die Bedingung schon gilt. Der Entwurf geht beim Zuklappen verloren; wer schon etwas eingegeben
   * hat, wird vorher gefragt (Knopf, X und Escape).
   */
  let { ed, init = {}, onclose }: { ed: WatcherEditor; init?: NewWatcherRequest; onclose: () => void } = $props();

  const uid = $props.id();
  const f = $derived(ed.form);
  let when = $state<{ focus(): void }>();
  let dry = $state<{ run(): Promise<void> }>();
  let dryBox = $state<HTMLElement>();
  let more = $state(false);
  let suggestions = $state<WatcherSuggestion[]>([]);

  async function loadSuggestions() {
    suggestions = (await api.watcherSuggestions().catch(() => ({ items: [] as WatcherSuggestion[] }))).items;
  }

  onMount(() => {
    void (async () => {
      await ed.load(init.template, init.hit, init.personIds, init.category);
      if (!ed.form.boardId) ed.form.boardId = ui.boardId ?? ui.boards[0]?.id ?? '';
      await tick();
      // Mit einem Treffer ist die Entität schon gewählt: das Feld nimmt den Fokus, ohne die Liste aufzuklappen
      when?.focus();
      void loadSuggestions();
    })();
  });

  // Spalten des gewählten Boards, Verlauf der Entität (kurz verzögert beim Tippen) und Reihenfolge der Personen: immer, es gibt keine Schritte
  $effect(() => {
    const boardId = ed.form.boardId;
    if (!ed.loading) ed.loadView(boardId);
  });
  $effect(() => {
    const x = ed.form;
    void [x.entityId, x.kind, x.to, x.value, x.forMin, x.count, x.cooldownMin];
    if (ed.loading) return;
    if (!x.entityId) {
      ed.history = null;
      return;
    }
    const timer = setTimeout(() => ed.loadHistory(), 350);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    const x = ed.form;
    void [x.assignMode, x.personIds.join(','), x.fallback, x.fallbackPersonId];
    if (ed.loading) return;
    const timer = setTimeout(() => ed.loadOrder(), 250);
    return () => clearTimeout(timer);
  });

  // Ausgangsstand für „Hat der Mensch etwas eingegeben?“: sobald Vorbelegung und Spalten da sind
  let initial = $state.raw<WatcherForm | null>(null);
  $effect(() => {
    if (initial === null && !ed.loading && ed.view?.columns.some((c) => c.id === ed.form.columnId)) initial = $state.snapshot(ed.form) as WatcherForm;
  });
  const dirty = $derived(formDirty(ed.form, initial));

  /** Zuklappen (Knopf über der Liste, X, Abbrechen, Escape): mit Eingaben erst nachfragen */
  export function requestClose(): void {
    if (!dirty) {
      onclose();
      return;
    }
    ui.confirm = {
      title: t('Entwurf verwerfen?'),
      text: t('Deine Eingaben für den neuen Wächter gehen verloren.'),
      label: t('Verwerfen'),
      cancelLabel: t('Weiter bearbeiten'),
      run: onclose,
    };
  }

  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // ein Fenster darüber (Symbol wählen, Rückfrage) schließt sich selbst
    if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"],[role="alertdialog"]')) return;
    e.preventDefault();
    requestClose();
  }

  async function hide(s: WatcherSuggestion) {
    try {
      await api.hideSuggestion(s.templateId, s.entityId);
      toast(t('„{name}“ ausgeblendet. Stups schlägt es nicht mehr vor.', { name: s.name }));
      await loadSuggestions();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Ausblenden fehlgeschlagen'), { tone: 'error' });
    }
  }

  async function submit() {
    // Ein leerer Name heißt „automatisch“: der Name der Vorlage mit Gerät, sonst der der Entität
    if (!ed.form.name.trim()) ed.form.name = autoName(ed.form);
    const problem = deskProblem(ed.form);
    if (problem) {
      toast(problem, { tone: 'error' });
      return;
    }
    await ed.save();
  }

  async function probe() {
    await dry?.run();
    await tick();
    dryBox?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
</script>

<!-- Escape klappt den Bereich zu (Tastatur): der Handler hört nur auf Tasten aus den Feldern darin -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  class="@container rounded-[24px] border border-accent bg-bg px-4 py-4 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)] @min-[700px]:px-6 @min-[700px]:py-5"
  aria-labelledby="{uid}-title"
  data-testid="watcher-desk"
  onkeydown={key}
>
  <header class="flex items-start gap-3">
    <div class="min-w-0 flex-1">
      <h2 id="{uid}-title" class="text-[22px] leading-tight font-extrabold tracking-tight">{t('Neuer Wächter')}</h2>
      <p class="mt-0.5 text-[14px] text-fg2">{t('Beschreibe in einem Satz, wann welche Aufgabe entstehen soll.')}</p>
    </div>
    <button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-text-soft hover:bg-surface2" aria-label={t('Schließen')} data-testid="desk-close" onclick={requestClose}>
      <Icon name="x" size={20} stroke={2.2} />
    </button>
  </header>

  {#if ed.loading}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <div class="mt-4 grid grid-cols-1 gap-4 @min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] @min-[1000px]:items-start">
      <div class="flex min-w-0 flex-col gap-4">
        <WatcherDeskWhen bind:this={when} {ed} {suggestions} onhide={hide} />
        <WatcherDeskThen {ed} />
        <WatcherDeskWho {ed} />

        <!-- Mehr Einstellungen: eingeklappt -->
        <div class="rounded-[20px] border border-dashed border-track" data-testid="desk-more-settings">
          <button
            type="button"
            class="flex min-h-14 w-full items-center gap-3 rounded-[20px] px-4 py-2 text-left hover:bg-surface"
            aria-expanded={more}
            aria-controls="{uid}-more"
            onclick={() => (more = !more)}
          >
            <span class="flex shrink-0 text-text-soft2"><Icon name={more ? 'chevron-down' : 'chevron-right'} size={20} stroke={2.2} /></span>
            <span class="text-[16px] font-bold">{t('Mehr Einstellungen')}</span>
            <span class="min-w-0 truncate text-[13.5px] text-fg2">{t('Sperrzeit, erledigt sich selbst, Stupsen, Zähler')}</span>
          </button>
          {#if more}
            <div id="{uid}-more" class="flex flex-col gap-3 px-4 pt-1 pb-4" data-testid="desk-more-body">
              <WatcherFineEditor {ed} name={false} category={false} columns />
              <label class="focus-ring-in flex rounded-row bg-surface px-3.5 py-3">
                <textarea class="min-h-[44px] w-full resize-none bg-transparent text-[15px] leading-[1.45] font-medium outline-none placeholder:text-dim" rows="2" bind:value={f.description} placeholder={t('Beschreibung (optional)')} aria-label={t('Beschreibung')}></textarea>
              </label>
              {#if ed.view?.categories.length}
                <div class="flex flex-col gap-2">
                  <span class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Kategorien der Aufgabe')}</span>
                  <div class="flex flex-wrap gap-2" role="group" aria-label={t('Kategorien der Aufgabe')}>
                    {#each ed.view.categories as c (c.id)}
                      {@const on = f.categoryIds.includes(c.id)}
                      <Chip small active={on} pressed={on} onclick={() => (f.categoryIds = on ? f.categoryIds.filter((x) => x !== c.id) : [...f.categoryIds, c.id])}>{c.name}</Chip>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="min-w-0 @min-[1000px]:sticky @min-[1000px]:top-12"><WatcherDeskPreview {ed} /></div>
    </div>

    <div bind:this={dryBox} class="mt-4 empty:hidden"><DryRunPanel bind:this={dry} form={f} button={false} /></div>

    <footer class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-4" data-testid="desk-footer">
      <label class="focus-ring-in flex h-12 max-w-xl min-w-[14rem] flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5">
        <span class="shrink-0 text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Name')}</span>
        <input class="min-w-0 flex-1 truncate bg-transparent text-[15px] font-semibold outline-none placeholder:text-dim" bind:value={f.name} maxlength="80" placeholder={autoName(f) || t('automatisch')} aria-label={t('Name des Wächters')} data-testid="desk-name" />
      </label>
      <span class="flex flex-1 flex-wrap items-center justify-end gap-2">
        <button type="button" class="h-12 rounded-[14px] border border-line bg-surface px-5 text-[15px] font-bold hover:bg-surface2" onclick={probe} data-testid="desk-probe">{t('Probelauf')}</button>
        <button type="button" class="h-12 rounded-[14px] border border-line bg-surface px-5 text-[15px] font-bold hover:bg-surface2" onclick={requestClose} data-testid="desk-cancel">{t('Abbrechen')}</button>
        <button type="button" class="bg-accent-grad glow-cta flex h-12 items-center gap-2 rounded-[14px] px-6 text-[15px] font-extrabold hover:brightness-110 disabled:opacity-40" disabled={ed.busy} onclick={submit} data-testid="desk-submit">
          <Icon name="check" size={18} stroke={2.6} />{ed.busy ? t('Speichert …') : t('Wächter anlegen')}
        </button>
      </span>
    </footer>
  {/if}
</section>
