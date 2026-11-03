<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, ApiError, type BoardView, type HaEntity, type WatcherItem, type WatcherRun } from '../lib/api';
  import { clock } from '../lib/nudge';
  import type { TemplateDraft, WatcherTemplate } from '../lib/watcher-types';
  import { applyTemplate as applyDraft, emptyForm, formProblem, fromWatcher, noteText, RUN_TEXT, toInput, type WatcherForm } from '../lib/watchers';
  import { catClass } from '../lib/colors';
  import { closeSheet, openSettings, personById, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import DryRunPanel from './DryRunPanel.svelte';
  import WatcherSentence from './WatcherSentence.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Row from './Row.svelte';
  import SelectField from './SelectField.svelte';
  import Sheet from './Sheet.svelte';

  /** id = null: neuer Wächter; template: Kennung einer Vorlage, die gleich angewendet wird; hit: der Treffer aus „Gefunden“ (Entität schon gewählt) */
  let {
    id,
    template = undefined,
    hit = undefined,
  }: { id: string | null; template?: string; hit?: { entityId: string; name: string; draft?: TemplateDraft } } = $props();

  // Aus dem Reiter „Wächter" geht es dorthin zurück, sonst in die Einstellungen
  const back = () => (ui.tab === 'home' ? closeSheet() : openSettings('watchers'));

  const people = $derived(ui.people.filter((p) => p.isPerson));
  const personName = (pid: string) => personById(pid)?.displayName ?? '?';

  let loading = $state(true);
  /** „Mehr Regeln“ aufgeklappt (Sperrzeit, Zähler, Erinnern, Fälligkeit, Erledigen-Bedingung …) */
  let moreOpen = $state(false);
  /** Vorlagen des Servers, und warum sich die Karte nicht von selbst erledigen kann (leer = sie kann) */
  let templates = $state<WatcherTemplate[]>([]);
  let selfNote = $state('');
  let busy = $state(false);
  let item = $state<WatcherItem | null>(null);
  let runs = $state<WatcherRun[]>([]);
  // svelte-ignore state_referenced_locally
  let form = $state<WatcherForm>(emptyForm(ui.boardId ?? '', ''));
  let view = $state<BoardView | null>(null);

  // ---------- Laden ----------

  const field = 'min-h-11 w-full rounded-xl bg-surface2 px-3 text-[16px]';
  const chip = (on: boolean) =>
    `flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[15px] ${on ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}`;

  onMount(async () => {
    try {
      if (id) {
        const res = await api.watchers();
        const found = res.items.find((w) => w.id === id);
        if (found) {
          item = found;
          const names = new Map<string, HaEntity>();
          // Namen der Entitäten nachschlagen (Home Assistant liefert sie in der Suche)
          for (const eid of [found.trigger.entityId, found.done?.entityId].filter((x): x is string => !!x)) {
            const hit = (await api.haEntities(eid).catch(() => [])).find((e) => e.entityId === eid);
            if (hit) names.set(eid, hit);
          }
          form = fromWatcher(found, names);
          runs = await api.watcherRuns(id).catch(() => []);
        }
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Konnte den Wächter nicht laden'), { tone: 'error' });
    }
    if (!id) templates = (await api.watcherTemplates().catch(() => [])).filter((x) => x.kind === 'watcher');
    loading = false;
    const wanted = !id && template ? templates.find((x) => x.id === template) : undefined;
    if (wanted) applyTemplate(wanted, hit);
  });

  // Spalten und Kategorien des gewählten Boards
  $effect(() => {
    const boardId = form.boardId;
    if (!boardId) return;
    let stale = false;
    api
      .board(boardId)
      .then((v) => {
        if (stale) return;
        view = v;
        if (!v.columns.some((c) => c.id === form.columnId)) {
          form.columnId = (v.columns.find((c) => !c.isDone && !c.isPlanned) ?? v.columns[0])?.id ?? '';
        }
        form.categoryIds = form.categoryIds.filter((c) => v.categories.some((x) => x.id === c));
      })
      .catch(() => (view = null));
    return () => (stale = true);
  });

  // ---------- Entitäten suchen ----------

  let picking = $state<'trigger' | 'done' | null>(null);
  let query = $state('');
  let results = $state<HaEntity[]>([]);
  let searchError = $state('');
  let searchDomain = $state('');

  $effect(() => {
    if (!picking) return;
    const q = query;
    const domain = searchDomain;
    const timer = setTimeout(async () => {
      try {
        results = await api.haEntities(q, domain || undefined);
        searchError = '';
      } catch (e) {
        searchError = e instanceof ApiError ? e.message : t('Home Assistant antwortet nicht');
        results = [];
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  function startPicking(which: 'trigger' | 'done', q = '', domain = '') {
    picking = which;
    query = q;
    searchDomain = domain;
  }

  function pick(e: HaEntity) {
    if (picking === 'trigger') {
      form.entityId = e.entityId;
      form.entityName = e.name;
      form.entityUnit = e.unit ?? '';
      if (!form.name.trim()) form.name = e.name;
      // Zahlenwerte und Zustände unterscheiden sich im Vorgabe-Typ
      if (e.unit && form.kind === 'state') form.kind = 'below';
    } else {
      form.doneEntityId = e.entityId;
      form.doneEntityName = e.name;
    }
    picking = null;
  }

  function applyTemplate(tpl: WatcherTemplate, found?: { entityId: string; name: string; draft?: TemplateDraft }) {
    form = applyDraft(form, tpl, found);
    // Ehrlich beim Selbst-Erledigen: ein Sensor, der das Erledigen nicht belegen kann, schaltet es aus und sagt warum
    selfNote = tpl.canSelfComplete ? '' : (tpl.whyNoSelfComplete ?? '');
    if (!found) startPicking('trigger', tpl.search, tpl.domain ?? '');
  }

  // ---------- Speichern und Aktionen ----------

  async function save() {
    const problem = formProblem(form);
    if (problem) {
      toast(problem, { tone: 'error' });
      return;
    }
    busy = true;
    try {
      if (id) await api.updateWatcher(id, toInput(form));
      else await api.createWatcher(toInput(form));
      toast(t('Wächter gespeichert'));
      back();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Speichern fehlgeschlagen'), { tone: 'error' });
    }
    busy = false;
  }

  async function test() {
    if (!id) return;
    busy = true;
    try {
      await api.testWatcher(id);
      toast(t('Testkarte angelegt'));
      runs = await api.watcherRuns(id).catch(() => runs);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Test fehlgeschlagen'), { tone: 'error' });
    }
    busy = false;
  }

  async function resetCounter() {
    if (!id) return;
    try {
      item = await api.resetWatcherCounter(id);
      toast(t('Zähler zurückgesetzt'));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Zurücksetzen fehlgeschlagen'), { tone: 'error' });
    }
  }

  async function togglePause() {
    if (!id) return;
    try {
      item = await api.updateWatcher(id, { active: !form.active });
      form.active = item.active;
      toast(item.active ? t('Wächter ist wieder aktiv') : t('Wächter pausiert'));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Änderung fehlgeschlagen'), { tone: 'error' });
    }
  }

  function askRemove() {
    if (!id) return;
    ui.confirm = {
      title: t('Wächter löschen?'),
      text: t('„{name}“ legt danach keine Karten mehr an. Bereits angelegte Karten bleiben.', { name: form.name }),
      label: t('Löschen'),
      run: async () => {
        try {
          await api.deleteWatcher(id!);
          toast(t('Wächter gelöscht'));
          back();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : t('Löschen fehlgeschlagen'), { tone: 'error' });
        }
      },
    };
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const usesCircle = $derived(form.assignMode !== 'none');
  const needsPeople = $derived(form.assignMode === 'fixed' || form.assignMode === 'rotation');

</script>

{#snippet saveButton()}
  <button class="min-h-11 px-3 text-[17px] font-semibold text-accent-text disabled:opacity-40" disabled={busy || loading} onclick={save}>
    {busy ? t('Speichert …') : t('Speichern')}
  </button>
{/snippet}

<Sheet title={id ? t('Wächter') : t('Neuer Wächter')} onclose={back} right={saveButton}>
  {#if loading}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    {#if !id && templates.length > 0 && !form.entityId}
      <Group title={t('Vorlage')} hint={t('Füllt den Satz vor, alles bleibt änderbar. Danach noch die Entität wählen.')}>
        <div class="flex flex-wrap gap-2 p-3">
          {#each templates as tpl (tpl.id)}
            <button type="button" class={chip(false)} title={tpl.hint} onclick={() => applyTemplate(tpl)}>{tpl.title}</button>
          {/each}
        </div>
      </Group>
    {/if}

    <WatcherSentence bind:form {personName} onpick={() => startPicking('trigger')} />
    {#if picking === 'trigger'}
      <div class="mt-2 rounded-2xl border border-line bg-surface p-3">{@render picker()}</div>
    {/if}
    <DryRunPanel {form} />

    <button
      type="button"
      class="mt-4 flex min-h-12 w-full items-center justify-between rounded-2xl border border-line px-4 text-[16px] font-semibold"
      aria-expanded={moreOpen}
      onclick={() => (moreOpen = !moreOpen)}
    >
      {t('Mehr Regeln')}<Icon name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} />
    </button>
    {#if moreOpen}
    <Group title="Name">
      <div class="p-2"><input class={field} bind:value={form.name} maxlength="80" placeholder={t('z. B. Waschmaschine fertig')} aria-label={t('Name des Wächters')} /></div>
    </Group>

    {#if form.kind !== 'calendar_event' && form.kind !== 'forecast'}
    <Group title={t('Zähler')}>
      <Row label={t('Erst beim N-ten Mal')}>
        <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.count} placeholder="1" aria-label={t('Anzahl')} />
      </Row>
    </Group>
    {/if}

    <Group title={t('Dann Karte')}>
      <Row label="Board">
        <SelectField bind:value={form.boardId} label="Board">
          {#each ui.boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
        </SelectField>
      </Row>
      <Row label={t('Spalte')}>
        <SelectField bind:value={form.columnId} label={t('Spalte')}>
          {#each view?.columns ?? [] as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </SelectField>
      </Row>
      <div class="p-2"><textarea class="{field} py-2" rows="2" bind:value={form.description} placeholder={t('Beschreibung (optional)')} aria-label={t('Beschreibung')}></textarea></div>
      {#if view?.categories.length}
        <div class="flex flex-wrap gap-2 p-3" role="group" aria-label={t('Kategorien')}>
          {#each view.categories as c (c.id)}
            <button
              type="button"
              aria-pressed={form.categoryIds.includes(c.id)}
              class="{catClass(c.color)} min-h-9 !px-3 !text-[14px] {form.categoryIds.includes(c.id) ? 'ring-2 ring-accent' : 'opacity-60'}"
              onclick={() => (form.categoryIds = toggle(form.categoryIds, c.id))}
            >
              {c.name}
            </button>
          {/each}
        </div>
      {/if}
      <Row label={t('Priorität hoch')}>
        <input type="checkbox" class="h-6 w-6 accent-[var(--accent)]" checked={form.priority === 'high'} aria-label={t('Priorität hoch')} onchange={(e) => (form.priority = e.currentTarget.checked ? 'high' : '')} />
      </Row>
      <Row label={t('Fällig')}>
        <SelectField bind:value={form.dueKind} label={t('Fälligkeit')}>
          <option value="none">{t('Ohne Termin')}</option>
          <option value="in">{t('In … Minuten')}</option>
          <option value="at">{t('Heute oder morgen um …')}</option>
        </SelectField>
      </Row>
      {#if form.dueKind === 'in'}
        <Row label={t('Minuten')}>
          <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.dueMinutes} aria-label={t('Minuten bis zur Fälligkeit')} />
        </Row>
      {:else if form.dueKind === 'at'}
        <Row label={t('Tag und Uhrzeit')}>
          <div class="flex items-center gap-2">
            <SelectField bind:value={form.dueDay} label={t('Tag')}>
              <option value="today">{t('heute')}</option>
              <option value="tomorrow">{t('morgen')}</option>
            </SelectField>
            <input type="time" class="min-h-10 rounded-xl bg-surface2 px-3" bind:value={form.dueTime} aria-label={t('Uhrzeit')} />
          </div>
        </Row>
      {/if}
    </Group>

    <Group
      title={t('An wen')}
      hint={form.assignMode === 'first_home'
        ? t('Ist niemand zu Hause, erscheint die Karte ohne Zuständige und ohne Push. Wer als Erstes heimkommt, bekommt sie (die Fälligkeit zählt ab dann).')
        : form.assignMode === 'rotation_present' || form.assignMode === 'all_present'
          ? t('Anwesend heißt: Die Person in Home Assistant ist zu Hause.')
          : form.assignMode === 'suggest'
            ? t('Alle Anwesenden bekommen die Frage „Wer übernimmt?“. Nach 30 Minuten ohne Antwort greift der Rückfall.')
            : undefined}
    >
      {#if usesCircle}
        <div class="p-3">
          <p class="mb-2 text-[13px] font-semibold text-fg2">{needsPeople ? t('Personen') : t('Kreis (leer = alle Personen)')}</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label={t('Personen')}>
            {#each people as p (p.id)}
              <button type="button" class={chip(form.personIds.includes(p.id))} aria-pressed={form.personIds.includes(p.id)} onclick={() => (form.personIds = toggle(form.personIds, p.id))}>
                <Avatar person={p} size={20} />{p.displayName}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      {#if form.assignMode === 'rotation_present' || form.assignMode === 'all_present' || form.assignMode === 'suggest'}
        <Row label={form.assignMode === 'suggest' ? t('Wenn sich niemand meldet') : t('Ist niemand zu Hause')}>
          <SelectField bind:value={form.fallback} label={t('Rückfall')}>
            <option value="next">{t('nächste Person')}</option>
            <option value="all">{t('alle')}</option>
            <option value="fixed">{t('feste Person')}</option>
            <option value="none">{t('niemand')}</option>
          </SelectField>
        </Row>
      {/if}
      {#if form.assignMode === 'first_home'}
        <Row label={t('Nach 24 Stunden ohne Heimkehr')}>
          <SelectField bind:value={form.waitFallback} label={t('Rückfall nach 24 Stunden')}>
            <option value="none">{t('unzugewiesen lassen')}</option>
            <option value="all">{t('an alle')}</option>
            <option value="fixed">{t('feste Person')}</option>
          </SelectField>
        </Row>
      {/if}
      {#if form.fallback === 'fixed' || form.waitFallback === 'fixed'}
        <Row label={t('Feste Person für den Rückfall')}>
          <SelectField bind:value={form.fallbackPersonId} label={t('Person für den Rückfall')}>
            <option value="">{t('wählen …')}</option>
            {#each people as p (p.id)}<option value={p.id}>{p.displayName}</option>{/each}
          </SelectField>
        </Row>
      {/if}
    </Group>

    <Group title={t('Erledigt sich selbst, wenn …')} hint={t('Zum Beispiel: Die Tür der Waschmaschine geht auf. Die offene Karte dieses Wächters wird dann erledigt.')}>
      <Row label={t('Automatisch erledigen')}>
        <input type="checkbox" class="h-6 w-6 accent-[var(--accent)]" bind:checked={form.doneOn} disabled={selfNote !== ''} aria-label={t('Automatisch erledigen')} />
      </Row>
      {#if selfNote}
        <Row stack><p class="text-[14px] text-fg2" data-testid="self-note">{selfNote}</p></Row>
      {/if}
      {#if form.doneOn}
        <Row stack>
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-[17px] font-semibold">{form.doneEntityName || t('Noch keine Entität gewählt')}</p>
              {#if form.doneEntityId}<p class="truncate text-[13px] text-fg2">{form.doneEntityId}</p>{/if}
            </div>
            <button type="button" class="min-h-10 shrink-0 rounded-xl bg-surface2 px-4 font-semibold" onclick={() => startPicking('done')}>
              {form.doneEntityId ? t('Ändern') : t('Wählen')}
            </button>
          </div>
          {#if picking === 'done'}
            {@render picker()}
          {/if}
        </Row>
        <Row label={t('Bedingung')}>
          <SelectField bind:value={form.doneKind} label={t('Bedingung zum Erledigen')}>
            <option value="state">{t('Zustand wechselt zu …')}</option>
            <option value="below">{t('Wert fällt unter …')}</option>
            <option value="above">{t('Wert steigt über …')}</option>
          </SelectField>
        </Row>
        <Row label={form.doneKind === 'state' ? t('Zustand') : t('Wert')}>
          {#if form.doneKind === 'state'}
            <input class="min-h-10 w-40 rounded-xl bg-surface2 px-3 text-right" bind:value={form.doneTo} placeholder={t('z. B. on')} aria-label={t('Zustand zum Erledigen')} />
          {:else}
            <input class="min-h-10 w-28 rounded-xl bg-surface2 px-3 text-right" inputmode="decimal" bind:value={form.doneValue} aria-label={t('Schwellwert zum Erledigen')} />
          {/if}
        </Row>
      {/if}
    </Group>

    <Group title={t('Weitere Einstellungen')}>
      <Row label={t('Sperrzeit (Minuten)')}>
        <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.cooldownMin} placeholder="10" aria-label={t('Sperrzeit in Minuten')} />
      </Row>
      <Row label={t('Keine zweite Karte, solange eine offen ist')}>
        <input type="checkbox" class="h-6 w-6 accent-[var(--accent)]" bind:checked={form.dedupe} aria-label={t('Keine Doppelkarten')} />
      </Row>
      <Row label={t('Nach … Minuten stupsen, wenn offen')}>
        <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.nudgeAfterMin} placeholder={t('nie')} aria-label={t('Stupsen nach Minuten')} />
      </Row>
    </Group>

    {/if}

    {#if id && item}
      <Group title={t('Status')}>
        <Row label={t('Zähler')}>
          <span class="flex items-center gap-3">
            <span>{item.trigger.count > 1 ? t('{n} von {total}', { n: item.counter, total: item.trigger.count }) : t('nicht aktiv')}</span>
            {#if item.trigger.count > 1}
              <button type="button" class="min-h-9 rounded-xl bg-surface2 px-3 text-[14px] font-semibold" onclick={resetCounter}>{t('Zurücksetzen')}</button>
            {/if}
          </span>
        </Row>
        <Row label={t('Verbindung')}>
          <span class={item.subscribed || !item.active ? 'text-fg2' : 'text-danger'}>
            {!item.active ? t('pausiert') : item.status === 'entity_missing' ? t('Entität fehlt') : item.status === 'target_missing' ? t('Board oder Spalte fehlt') : item.subscribed ? t('aktiv') : t('Abo nicht aktiv')}
          </span>
        </Row>
        {#each runs.slice(0, 8) as r (r.id)}
          <Row stack>
            <p class="text-[15px]">{RUN_TEXT[r.result] ?? r.result}{r.note ? ` · ${noteText(r.note)}` : ''}</p>
            <p class="text-[13px] text-fg2">{t('{time} Uhr', { time: clock(r.at) })}{r.assignedTo.length ? ` · ${r.assignedTo.map(personName).join(', ')}` : ''}</p>
          </Row>
        {:else}
          <Row stack><p class="text-[15px] text-fg2">{t('Noch keine Läufe.')}</p></Row>
        {/each}
      </Group>

      <div class="mt-5 flex flex-col gap-2">
        <button type="button" class="min-h-12 rounded-2xl bg-surface2 font-semibold disabled:opacity-40" disabled={busy} onclick={test}>{t('Testen: Karte jetzt anlegen')}</button>
        <button type="button" class="min-h-12 rounded-2xl bg-surface2 font-semibold" onclick={togglePause}>{form.active ? t('Pausieren') : t('Wieder aktivieren')}</button>
        <button type="button" class="min-h-12 rounded-2xl bg-danger-bg font-semibold text-danger" onclick={askRemove}>{t('Wächter löschen')}</button>
      </div>
    {/if}
  {/if}
</Sheet>

{#snippet picker()}
  <div class="mt-2 space-y-2">
    <input class={field} bind:value={query} placeholder={t('Entität suchen, z. B. waschmaschine')} aria-label={t('Entität suchen')} />
    {#if searchError}<p class="text-[14px] text-danger">{searchError}</p>{/if}
    <ul class="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
      {#each results as e (e.entityId)}
        <li>
          <button type="button" class="flex min-h-12 w-full items-center gap-2 px-3 text-left" onclick={() => pick(e)}>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-medium">{e.name}</span>
              <span class="block truncate text-[12px] text-fg2">{e.entityId}</span>
            </span>
            <span class="shrink-0 text-[13px] text-fg2">{e.state}{e.unit ? ` ${e.unit}` : ''}</span>
          </button>
        </li>
      {:else}
        <li class="px-3 py-3 text-[14px] text-fg2">{t('Nichts gefunden.')}</li>
      {/each}
    </ul>
    <button type="button" class="min-h-9 text-[14px] text-accent-text" onclick={() => (picking = null)}>{t('Suche schließen')}</button>
  </div>
{/snippet}
