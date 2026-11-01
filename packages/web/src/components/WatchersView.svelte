<script lang="ts">
  import { api, ApiError, type WatcherActivity, type WatcherItem } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { conditionText, RUN_TEXT, TEMPLATES, watcherLine } from '../lib/watchers';
  import { openCardAnywhere, openSheet, personById, toast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  const data = $derived(ui.watchers);
  const items = $derived(data?.items ?? []);
  const admin = $derived(ui.isAdmin);
  const personName = (id: string) => personById(id)?.displayName ?? '?';

  let activity = $state<WatcherActivity[]>([]);
  // Mit jedem Nachladen (ui.rev zählt hoch, auch durch Live-Sync) auch die Aktivität holen
  $effect(() => {
    void ui.rev;
    api.watcherActivity().then((a) => (activity = a)).catch(() => undefined);
  });

  async function toggle(w: WatcherItem) {
    try {
      await api.updateWatcher(w.id, { active: !w.active });
      ui.watchers = await api.watchers();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Änderung fehlgeschlagen', { tone: 'error' });
    }
  }

  const condition = (w: WatcherItem) =>
    conditionText({
      entityName: w.entityName ?? w.trigger.entityId,
      entityId: w.trigger.entityId,
      entityUnit: w.entityUnit ?? '',
      kind: w.trigger.kind,
      to: w.trigger.to ?? '',
      value: String(w.trigger.value ?? '').replace('.', ','),
      forMin: String(w.trigger.forMin),
    });

  const problem = (w: WatcherItem): string | null =>
    w.status === 'target_missing'
      ? 'Pausiert: Board oder Spalte gibt es nicht mehr'
      : w.status === 'entity_missing'
        ? 'Die Entität gibt es in Home Assistant nicht'
        : w.active && !w.subscribed
          ? 'Home Assistant meldet nichts (Abo nicht aktiv)'
          : null;
</script>

<main class="relative z-[1] mx-auto flex h-full max-w-[720px] flex-col px-4 pt-[max(8px,var(--safe-top))]">
  <header class="shrink-0 pt-2">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-[34px] leading-tight font-bold tracking-tight">Wächter</h1>
      {#if admin && data?.available}
        <button
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-surface text-accent-text"
          aria-label="Wächter hinzufügen"
          onclick={() => openSheet({ type: 'watcher', id: null })}
        >
          <Icon name="plus" size={22} stroke={2.6} />
        </button>
      {/if}
    </div>
    <p class="mb-3 text-[15px] text-fg2">Karten, die von selbst aus Home Assistant entstehen</p>
  </header>

  <div class="-mr-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-4 pb-tabbar" data-testid="watchers">
    {#if data && !data.available}
      <div class="mt-6 rounded-[20px] border border-line bg-surface p-5 text-center">
        <Icon name="wifi-off" size={28} />
        <p class="mt-2 text-[17px] font-semibold">Keine Verbindung zu Home Assistant</p>
        <p class="mt-1 text-[15px] text-fg2">Wächter brauchen sie, um Entitäten zu beobachten. Sobald sie steht, erscheinen die Wächter hier.</p>
      </div>
    {:else if items.length === 0}
      <div class="mt-4 rounded-[20px] border border-line bg-surface p-5">
        <p class="text-[17px] font-semibold">Noch kein Wächter</p>
        <p class="mt-1 text-[15px] text-fg2">
          Ein Wächter beobachtet zum Beispiel die Waschmaschine und legt von selbst die Karte „ausräumen" an, für jemanden, der gerade zu Hause ist.
        </p>
        {#if !admin}
          <p class="mt-3 text-[15px]" data-testid="watchers-empty-member">Ein Administrator von Home Assistant kann Wächter einrichten. Sobald es welche gibt, siehst du sie hier.</p>
        {:else}
          <p class="mt-4 mb-2 text-[13px] font-semibold tracking-wide text-fg2 uppercase">Mit einer Vorlage starten</p>
          <div class="flex flex-col gap-2">
            {#each TEMPLATES as t (t.id)}
              <button
                class="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface2 px-4 text-left text-[16px] font-semibold"
                onclick={() => openSheet({ type: 'watcher', id: null, template: t.id })}
              >
                <Icon name="eye" size={20} />{t.title}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <ul class="space-y-3">
        {#each items as w (w.id)}
          {@const bad = problem(w)}
          <li class="card-shadow overflow-hidden rounded-[20px] border border-line bg-surface {w.active ? '' : 'opacity-70'}" data-testid="watcher-card">
            <div class="flex items-start gap-3 p-4">
              <button
                class="flex min-w-0 flex-1 items-start gap-3 text-left disabled:opacity-100"
                disabled={!admin}
                aria-label="Wächter {w.name} bearbeiten"
                onclick={() => openSheet({ type: 'watcher', id: w.id })}
              >
                <span class="mt-0.5 shrink-0 {w.active ? 'text-accent-text' : 'text-fg2'}"><Icon name="eye" size={22} /></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[18px] font-bold">{w.name}</span>
                  <span class="mt-0.5 block text-[14px] text-fg2">Wenn {condition(w)}</span>
                </span>
              </button>
              {#if admin}
                <input
                  type="checkbox"
                  class="mt-1 h-6 w-6 shrink-0 accent-[var(--accent)]"
                  checked={w.active}
                  aria-label="{w.name} aktiv"
                  onchange={() => toggle(w)}
                />
              {/if}
            </div>

            <div class="space-y-2 border-t border-line px-4 py-3 text-[14px]">
              <p class={bad ? 'font-semibold text-danger' : 'text-fg2'}>{bad ?? watcherLine(w, personName, undefined, false)}</p>
              {#if w.entityState !== null}
                <p class="text-fg2">Jetzt: <span class="font-medium text-fg">{w.entityState}</span></p>
              {/if}
              {#if w.trigger.count > 1}
                <div class="flex items-center gap-2" aria-label="Zähler {w.counter} von {w.trigger.count}">
                  <div class="flex flex-1 gap-1">
                    {#each Array.from({ length: Math.min(w.trigger.count, 12) }, (_, i) => i) as i (i)}
                      <i class="h-1.5 flex-1 rounded-full {i < w.counter ? 'bg-accent' : 'bg-line'}"></i>
                    {/each}
                  </div>
                  <span class="text-fg2">{w.counter} von {w.trigger.count}</span>
                </div>
              {/if}
              {#if w.openCard}
                <button
                  class="flex min-h-11 w-full items-center gap-2 rounded-xl bg-surface2 px-3 text-left"
                  onclick={() => openCardAnywhere(w.openCard!)}
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold">{w.openCard.title}</span>
                    <span class="block text-[13px] text-fg2">
                      {w.openCard.waiting ? 'Wartet auf die erste Person, die heimkommt' : w.openCard.assigneeIds.length ? `Offen bei ${w.openCard.assigneeIds.map(personName).join(', ')}` : 'Offen, niemand zugewiesen'}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>

      {#if admin}
        <button class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line text-[16px] font-semibold text-accent-text" onclick={() => openSheet({ type: 'watcher', id: null })}>
          <Icon name="plus" size={18} stroke={2.6} />Wächter hinzufügen
        </button>
      {/if}

      {#if activity.length}
        <h2 class="mt-6 mb-2 px-1 text-[13px] font-semibold tracking-wide text-fg2 uppercase">Letzte Aktivität</h2>
        <ul class="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface" data-testid="watcher-activity">
          {#each activity as r (r.id)}
            <li class="px-4 py-2.5">
              <p class="text-[15px] font-medium">{r.watcherName} · {RUN_TEXT[r.result] ?? r.result}</p>
              <p class="text-[13px] text-fg2">
                {formatDue(r.at)}{r.assignedTo.length ? ` · ${r.assignedTo.map(personName).join(', ')}` : ''}{r.note ? ` · ${r.note}` : ''}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</main>
