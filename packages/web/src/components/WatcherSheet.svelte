<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type BoardView, type HaEntity, type WatcherItem, type WatcherRun } from '../lib/api';
  import { clock } from '../lib/nudge';
  import { emptyForm, formProblem, fromWatcher, previewSentence, RUN_TEXT, TEMPLATES, toInput, type WatcherForm, type WatcherTemplate } from '../lib/watchers';
  import { catClass } from '../lib/colors';
  import { closeSheet, openSheet, personById, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Group from './Group.svelte';
  import Row from './Row.svelte';
  import SelectField from './SelectField.svelte';
  import Sheet from './Sheet.svelte';

  /** id = null: neuer Wächter; template: Kennung einer Vorlage, die gleich angewendet wird */
  let { id, template = undefined }: { id: string | null; template?: string } = $props();

  // Aus dem Reiter „Wächter" geht es dorthin zurück, sonst in die Einstellungen
  const back = () => (ui.tab === 'watchers' ? closeSheet() : openSheet({ type: 'settings' }));

  const people = $derived(ui.people.filter((p) => p.isPerson));
  const personName = (pid: string) => personById(pid)?.displayName ?? '?';

  let loading = $state(true);
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
      toast(e instanceof ApiError ? e.message : 'Konnte den Wächter nicht laden', { tone: 'error' });
    }
    loading = false;
    const wanted = !id && template ? TEMPLATES.find((t) => t.id === template) : undefined;
    if (wanted) applyTemplate(wanted);
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
        searchError = e instanceof ApiError ? e.message : 'Home Assistant antwortet nicht';
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

  function applyTemplate(t: WatcherTemplate) {
    form = t.apply(form);
    startPicking('trigger', t.search, t.domain);
  }

  // ---------- Speichern und Aktionen ----------

  const preview = $derived(previewSentence(form, personName));

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
      toast('Wächter gespeichert');
      back();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Speichern fehlgeschlagen', { tone: 'error' });
    }
    busy = false;
  }

  async function test() {
    if (!id) return;
    busy = true;
    try {
      await api.testWatcher(id);
      toast('Testkarte angelegt');
      runs = await api.watcherRuns(id).catch(() => runs);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Test fehlgeschlagen', { tone: 'error' });
    }
    busy = false;
  }

  async function resetCounter() {
    if (!id) return;
    try {
      item = await api.resetWatcherCounter(id);
      toast('Zähler zurückgesetzt');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Zurücksetzen fehlgeschlagen', { tone: 'error' });
    }
  }

  async function togglePause() {
    if (!id) return;
    try {
      item = await api.updateWatcher(id, { active: !form.active });
      form.active = item.active;
      toast(item.active ? 'Wächter ist wieder aktiv' : 'Wächter pausiert');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Änderung fehlgeschlagen', { tone: 'error' });
    }
  }

  function askRemove() {
    if (!id) return;
    ui.confirm = {
      title: 'Wächter löschen?',
      text: `„${form.name}“ legt danach keine Karten mehr an. Bereits angelegte Karten bleiben.`,
      label: 'Löschen',
      run: async () => {
        try {
          await api.deleteWatcher(id!);
          toast('Wächter gelöscht');
          back();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : 'Löschen fehlgeschlagen', { tone: 'error' });
        }
      },
    };
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const usesCircle = $derived(form.assignMode !== 'none');
  const needsPeople = $derived(form.assignMode === 'fixed' || form.assignMode === 'rotation');

  const MODES: [WatcherForm['assignMode'], string][] = [
    ['rotation_present', 'Abwechselnd unter den Anwesenden'],
    ['first_home', 'Wer zuerst nach Hause kommt'],
    ['all_present', 'Alle Anwesenden'],
    ['rotation', 'Abwechselnd (egal, wer da ist)'],
    ['fixed', 'Feste Person(en)'],
    ['none', 'Niemand (Karte bleibt offen)'],
  ];
</script>

{#snippet saveButton()}
  <button class="min-h-11 px-3 text-[17px] font-semibold text-accent-text disabled:opacity-40" disabled={busy || loading} onclick={save}>
    {busy ? 'Speichert …' : 'Speichern'}
  </button>
{/snippet}

<Sheet title={id ? 'Wächter' : 'Neuer Wächter'} onclose={back} right={saveButton}>
  {#if loading}
    <p class="py-10 text-center text-fg2">Lädt …</p>
  {:else}
    <p class="mt-3 rounded-2xl bg-surface2 px-4 py-3 text-[15px]" data-testid="watcher-preview">{preview}</p>

    {#if !id}
      <Group title="Vorlage" hint="Füllt das Formular vor, alles bleibt änderbar. Danach noch die Entität wählen.">
        <div class="flex flex-wrap gap-2 p-3">
          {#each TEMPLATES as t (t.id)}
            <button type="button" class={chip(false)} title={t.hint} onclick={() => applyTemplate(t)}>{t.title}</button>
          {/each}
        </div>
      </Group>
    {/if}

    <Group title="Name">
      <div class="p-2"><input class={field} bind:value={form.name} maxlength="80" placeholder="z. B. Waschmaschine fertig" aria-label="Name des Wächters" /></div>
    </Group>

    <Group title="Wenn" hint="Stups beobachtet die Entität in Home Assistant und prüft die Bedingung selbst.">
      <Row stack>
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <p class="truncate text-[17px] font-semibold">{form.entityName || 'Noch keine Entität gewählt'}</p>
            {#if form.entityId}<p class="truncate text-[13px] text-fg2">{form.entityId}</p>{/if}
          </div>
          <button type="button" class="min-h-10 shrink-0 rounded-xl bg-surface2 px-4 font-semibold" onclick={() => startPicking('trigger')}>
            {form.entityId ? 'Ändern' : 'Wählen'}
          </button>
        </div>
        {#if picking === 'trigger'}
          {@render picker()}
        {/if}
      </Row>
      <Row label="Bedingung">
        <SelectField bind:value={form.kind} label="Bedingung">
          <option value="below">Wert fällt unter …</option>
          <option value="above">Wert steigt über …</option>
          <option value="state">Zustand wechselt zu …</option>
        </SelectField>
      </Row>
      <Row label={form.kind === 'state' ? 'Zustand' : `Wert${form.entityUnit ? ` (${form.entityUnit})` : ''}`}>
        {#if form.kind === 'state'}
          <input class="min-h-10 w-40 rounded-xl bg-surface2 px-3 text-right" bind:value={form.to} placeholder="z. B. off" aria-label="Zielzustand" />
        {:else}
          <input class="min-h-10 w-28 rounded-xl bg-surface2 px-3 text-right" inputmode="decimal" bind:value={form.value} placeholder="z. B. 5" aria-label="Schwellwert" />
        {/if}
      </Row>
      <Row label="Für mindestens (Minuten)">
        <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.forMin} placeholder={form.kind === 'state' ? '0' : '3'} aria-label="Wartezeit in Minuten" />
      </Row>
      <Row label="Erst beim N-ten Mal">
        <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.count} placeholder="1" aria-label="Anzahl" />
      </Row>
    </Group>

    <Group title="Dann Karte">
      <Row label="Board">
        <SelectField bind:value={form.boardId} label="Board">
          {#each ui.boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
        </SelectField>
      </Row>
      <Row label="Spalte">
        <SelectField bind:value={form.columnId} label="Spalte">
          {#each view?.columns ?? [] as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </SelectField>
      </Row>
      <div class="p-2"><input class={field} bind:value={form.title} maxlength="200" placeholder="Titel der Karte" aria-label="Titel der Karte" /></div>
      <div class="p-2"><textarea class="{field} py-2" rows="2" bind:value={form.description} placeholder="Beschreibung (optional)" aria-label="Beschreibung"></textarea></div>
      {#if view?.categories.length}
        <div class="flex flex-wrap gap-2 p-3" role="group" aria-label="Kategorien">
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
      <Row label="Priorität hoch">
        <input type="checkbox" class="h-6 w-6 accent-[var(--accent)]" checked={form.priority === 'high'} aria-label="Priorität hoch" onchange={(e) => (form.priority = e.currentTarget.checked ? 'high' : '')} />
      </Row>
      <Row label="Fällig">
        <SelectField bind:value={form.dueKind} label="Fälligkeit">
          <option value="none">Ohne Termin</option>
          <option value="in">In … Minuten</option>
          <option value="at">Heute oder morgen um …</option>
        </SelectField>
      </Row>
      {#if form.dueKind === 'in'}
        <Row label="Minuten">
          <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.dueMinutes} aria-label="Minuten bis zur Fälligkeit" />
        </Row>
      {:else if form.dueKind === 'at'}
        <Row label="Tag und Uhrzeit">
          <div class="flex items-center gap-2">
            <SelectField bind:value={form.dueDay} label="Tag">
              <option value="today">heute</option>
              <option value="tomorrow">morgen</option>
            </SelectField>
            <input type="time" class="min-h-10 rounded-xl bg-surface2 px-3" bind:value={form.dueTime} aria-label="Uhrzeit" />
          </div>
        </Row>
      {/if}
    </Group>

    <Group
      title="An wen"
      hint={form.assignMode === 'first_home'
        ? 'Ist niemand zu Hause, erscheint die Karte ohne Zuständige und ohne Push. Wer als Erstes heimkommt, bekommt sie (die Fälligkeit zählt ab dann).'
        : form.assignMode === 'rotation_present' || form.assignMode === 'all_present'
          ? 'Anwesend heißt: Die Person in Home Assistant ist zu Hause.'
          : undefined}
    >
      <div class="flex flex-col" role="radiogroup" aria-label="Zuweisung">
        {#each MODES as [mode, label] (mode)}
          <button
            type="button"
            role="radio"
            aria-checked={form.assignMode === mode}
            class="flex min-h-[46px] items-center gap-3 px-4 text-left text-[16px] {form.assignMode === mode ? 'font-semibold' : 'text-fg2'}"
            onclick={() => (form.assignMode = mode)}
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 {form.assignMode === mode ? 'border-accent' : 'border-line'}">
              {#if form.assignMode === mode}<i class="h-2.5 w-2.5 rounded-full bg-accent"></i>{/if}
            </span>
            {label}
          </button>
        {/each}
      </div>
      {#if usesCircle}
        <div class="p-3">
          <p class="mb-2 text-[13px] font-semibold text-fg2">{needsPeople ? 'Personen' : 'Kreis (leer = alle Personen)'}</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Personen">
            {#each people as p (p.id)}
              <button type="button" class={chip(form.personIds.includes(p.id))} aria-pressed={form.personIds.includes(p.id)} onclick={() => (form.personIds = toggle(form.personIds, p.id))}>
                <Avatar person={p} size={20} />{p.displayName}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      {#if form.assignMode === 'rotation_present' || form.assignMode === 'all_present'}
        <Row label="Ist niemand zu Hause">
          <SelectField bind:value={form.fallback} label="Rückfall">
            <option value="next">nächste Person</option>
            <option value="all">alle</option>
            <option value="fixed">feste Person</option>
            <option value="none">niemand</option>
          </SelectField>
        </Row>
      {/if}
      {#if form.assignMode === 'first_home'}
        <Row label="Nach 24 Stunden ohne Heimkehr">
          <SelectField bind:value={form.waitFallback} label="Rückfall nach 24 Stunden">
            <option value="none">unzugewiesen lassen</option>
            <option value="all">an alle</option>
            <option value="fixed">feste Person</option>
          </SelectField>
        </Row>
      {/if}
      {#if form.fallback === 'fixed' || form.waitFallback === 'fixed'}
        <Row label="Feste Person für den Rückfall">
          <SelectField bind:value={form.fallbackPersonId} label="Person für den Rückfall">
            <option value="">wählen …</option>
            {#each people as p (p.id)}<option value={p.id}>{p.displayName}</option>{/each}
          </SelectField>
        </Row>
      {/if}
    </Group>

    <Group title="Erledigt sich selbst, wenn …" hint="Zum Beispiel: Die Tür der Waschmaschine geht auf. Die offene Karte dieses Wächters wird dann erledigt.">
      <Row label="Automatisch erledigen">
        <input type="checkbox" class="h-6 w-6 accent-[var(--accent)]" bind:checked={form.doneOn} aria-label="Automatisch erledigen" />
      </Row>
      {#if form.doneOn}
        <Row stack>
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-[17px] font-semibold">{form.doneEntityName || 'Noch keine Entität gewählt'}</p>
              {#if form.doneEntityId}<p class="truncate text-[13px] text-fg2">{form.doneEntityId}</p>{/if}
            </div>
            <button type="button" class="min-h-10 shrink-0 rounded-xl bg-surface2 px-4 font-semibold" onclick={() => startPicking('done')}>
              {form.doneEntityId ? 'Ändern' : 'Wählen'}
            </button>
          </div>
          {#if picking === 'done'}
            {@render picker()}
          {/if}
        </Row>
        <Row label="Bedingung">
          <SelectField bind:value={form.doneKind} label="Bedingung zum Erledigen">
            <option value="state">Zustand wechselt zu …</option>
            <option value="below">Wert fällt unter …</option>
            <option value="above">Wert steigt über …</option>
          </SelectField>
        </Row>
        <Row label={form.doneKind === 'state' ? 'Zustand' : 'Wert'}>
          {#if form.doneKind === 'state'}
            <input class="min-h-10 w-40 rounded-xl bg-surface2 px-3 text-right" bind:value={form.doneTo} placeholder="z. B. on" aria-label="Zustand zum Erledigen" />
          {:else}
            <input class="min-h-10 w-28 rounded-xl bg-surface2 px-3 text-right" inputmode="decimal" bind:value={form.doneValue} aria-label="Schwellwert zum Erledigen" />
          {/if}
        </Row>
      {/if}
    </Group>

    <Group title="Weitere Einstellungen">
      <Row label="Sperrzeit (Minuten)">
        <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.cooldownMin} placeholder="10" aria-label="Sperrzeit in Minuten" />
      </Row>
      <Row label="Keine zweite Karte, solange eine offen ist">
        <input type="checkbox" class="h-6 w-6 accent-[var(--accent)]" bind:checked={form.dedupe} aria-label="Keine Doppelkarten" />
      </Row>
      <Row label="Nach … Minuten stupsen, wenn offen">
        <input class="min-h-10 w-20 rounded-xl bg-surface2 px-3 text-right" inputmode="numeric" bind:value={form.nudgeAfterMin} placeholder="nie" aria-label="Stupsen nach Minuten" />
      </Row>
    </Group>

    {#if id && item}
      <Group title="Status">
        <Row label="Zähler">
          <span class="flex items-center gap-3">
            <span>{item.trigger.count > 1 ? `${item.counter} von ${item.trigger.count}` : 'nicht aktiv'}</span>
            {#if item.trigger.count > 1}
              <button type="button" class="min-h-9 rounded-xl bg-surface2 px-3 text-[14px] font-semibold" onclick={resetCounter}>Zurücksetzen</button>
            {/if}
          </span>
        </Row>
        <Row label="Verbindung">
          <span class={item.subscribed || !item.active ? 'text-fg2' : 'text-danger'}>
            {!item.active ? 'pausiert' : item.status === 'entity_missing' ? 'Entität fehlt' : item.status === 'target_missing' ? 'Board oder Spalte fehlt' : item.subscribed ? 'aktiv' : 'Abo nicht aktiv'}
          </span>
        </Row>
        {#each runs.slice(0, 8) as r (r.id)}
          <Row stack>
            <p class="text-[15px]">{RUN_TEXT[r.result] ?? r.result}{r.note ? ` · ${r.note}` : ''}</p>
            <p class="text-[13px] text-fg2">{clock(r.at)} Uhr{r.assignedTo.length ? ` · ${r.assignedTo.map(personName).join(', ')}` : ''}</p>
          </Row>
        {:else}
          <Row stack><p class="text-[15px] text-fg2">Noch keine Läufe.</p></Row>
        {/each}
      </Group>

      <div class="mt-5 flex flex-col gap-2">
        <button type="button" class="min-h-12 rounded-2xl bg-surface2 font-semibold disabled:opacity-40" disabled={busy} onclick={test}>Testen: Karte jetzt anlegen</button>
        <button type="button" class="min-h-12 rounded-2xl bg-surface2 font-semibold" onclick={togglePause}>{form.active ? 'Pausieren' : 'Wieder aktivieren'}</button>
        <button type="button" class="min-h-12 rounded-2xl bg-danger-bg font-semibold text-danger" onclick={askRemove}>Wächter löschen</button>
      </div>
    {/if}
  {/if}
</Sheet>

{#snippet picker()}
  <div class="mt-2 space-y-2">
    <input class={field} bind:value={query} placeholder="Entität suchen, z. B. waschmaschine" aria-label="Entität suchen" />
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
        <li class="px-3 py-3 text-[14px] text-fg2">Nichts gefunden.</li>
      {/each}
    </ul>
    <button type="button" class="min-h-9 text-[14px] text-accent-text" onclick={() => (picking = null)}>Suche schließen</button>
  </div>
{/snippet}
