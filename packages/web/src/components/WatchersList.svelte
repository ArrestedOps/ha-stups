<script lang="ts">
  import { createLatest } from '../lib/latest';
  import Toggle from './ui/Toggle.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { api, ApiError, type WatcherActivity, type WatcherItem } from '../lib/api';
  import { formatDue } from '../lib/datetime';
  import { onMount } from 'svelte';
  import type { WatcherTemplate } from '../lib/watcher-types';
  import { conditionText, noteText, pausedText, RUN_TEXT, sortWatchers, watcherLine } from '../lib/watchers';
  import { can, openCardAnywhere, openNewWatcher, openSheet, personById, toast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  const data = $derived(ui.watchers);
  const items = $derived(sortWatchers(data?.items ?? []));
  const admin = $derived(can('watchers'));
  const personName = (id: string) => personById(id)?.displayName ?? '?';

  // Vorlagen des Servers für den Anfang (Administratoren und Recht „watchers“, nur solange es noch keinen Wächter gibt)
  let templates = $state<WatcherTemplate[]>([]);
  onMount(async () => {
    if (can('watchers')) templates = (await api.watcherTemplates().catch(() => [])).filter((x) => x.kind === 'watcher');
  });

  let activity = $state<WatcherActivity[]>([]);
  // Mit jedem Nachladen (ui.rev zählt hoch, auch durch Live-Sync) auch die Aktivität holen
  const latestActivity = createLatest();
  $effect(() => {
    void ui.rev;
    void latestActivity
      .run(() => api.watcherActivity())
      .then((r) => {
        if (r.current) activity = r.value;
      })
      .catch(() => undefined);
  });

  async function toggle(w: WatcherItem) {
    try {
      await api.updateWatcher(w.id, { active: !w.active });
      ui.watchers = await api.watchers();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Änderung fehlgeschlagen'), { tone: 'error' });
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
      leadHours: String(Math.round((w.trigger.leadMin ?? 720) / 60)),
      forecastHours: String(w.trigger.forecast?.hours ?? 3),
    });

  const problem = (w: WatcherItem): string | null =>
    w.status === 'target_missing'
      ? pausedText(w)
      : w.status === 'assignees_missing'
        ? t('Keine Aufgaben: braucht neue Zuständige')
        : w.status === 'entity_missing'
        ? t('Die Entität gibt es in Home Assistant nicht')
        : w.active && !w.subscribed
          ? t('Home Assistant meldet nichts (Abo nicht aktiv)')
          : null;
</script>

<div data-testid="watchers">
  {#if data && !data.available}
    <div class="mt-6 rounded-[16px] bg-surface p-5 text-center">
      <Icon name="wifi-off" size={28} />
      <p class="mt-2 text-[17px] font-semibold">{t('Keine Verbindung zu Home Assistant')}</p>
      <p class="mt-1 text-[15px] text-fg2">{t('Wächter brauchen sie, um Entitäten zu beobachten. Sobald sie steht, erscheinen die Wächter hier.')}</p>
    </div>
  {:else if items.length === 0}
    <div class="mt-4 rounded-[16px] bg-surface p-5">
      <p class="text-[17px] font-semibold">{t('Noch kein Wächter')}</p>
      <p class="mt-1 text-[15px] text-fg2">
        {t('Ein Wächter beobachtet zum Beispiel die Waschmaschine und legt von selbst die Aufgabe „ausräumen" an, für jemanden, der gerade zu Hause ist.')}
      </p>
      {#if !admin}
        <p class="mt-3 text-[15px]" data-testid="watchers-empty-member">{t('Ein Administrator von Home Assistant kann Wächter einrichten. Sobald es welche gibt, siehst du sie hier.')}</p>
      {:else}
        <p class="mt-4 mb-2 text-[13px] font-semibold tracking-wide text-fg2 uppercase">{t('Mit einer Vorlage starten')}</p>
        <div class="flex flex-col gap-2">
          {#each templates as tpl (tpl.id)}
            <button
              class="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface2 px-4 text-left text-[16px] font-semibold"
              onclick={() => openNewWatcher({ template: tpl.id, from: 'settings' })}
            >
              <Icon name="eye" size={20} />{tpl.title}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <ul class="space-y-3">
      {#each items as w (w.id)}
        {@const bad = problem(w)}
        <li class="card-shadow overflow-hidden rounded-[16px] bg-surface {w.active ? '' : 'opacity-70'}" data-testid="watcher-card">
          <div class="flex items-start gap-3 p-4">
            <button
              class="flex min-w-0 flex-1 items-start gap-3 text-left disabled:opacity-100"
              disabled={!admin}
              aria-label={t('Wächter {name} bearbeiten', { name: w.name })}
              onclick={() => openSheet({ type: 'watcher', id: w.id, from: 'settings' })}
            >
              <span class="mt-0.5 shrink-0 {w.active ? 'text-accent-text' : 'text-fg2'}"><Icon name="eye" size={22} /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[18px] font-bold">{w.name}</span>
                <span class="block truncate text-[14px] text-tok" data-testid="watcher-subject">{w.subject}</span>
                <span class="mt-0.5 block text-[14px] text-fg2">{t('Wenn {condition}', { condition: condition(w) })}</span>
              </span>
            </button>
            {#if admin}
              <Toggle checked={w.active} label={t('{name} aktiv', { name: w.name })} onchange={() => toggle(w)} />
            {/if}
          </div>

          <div class="space-y-2 border-t border-line px-4 py-3 text-[14px]">
            <p class={bad ? 'font-semibold text-danger' : 'text-fg2'}>{bad ?? watcherLine(w, personName, undefined, false)}</p>
            {#if w.entityState !== null}
              <p class="text-fg2">{t('Jetzt:')} <span class="font-medium text-fg">{w.entityState}</span></p>
            {/if}
            {#if w.trigger.count > 1}
              <div class="flex items-center gap-2" aria-label={t('Zähler {n} von {total}', { n: w.counter, total: w.trigger.count })}>
                <div class="flex flex-1 gap-1">
                  {#each Array.from({ length: Math.min(w.trigger.count, 12) }, (_, i) => i) as i (i)}
                    <i class="h-1.5 flex-1 rounded-full {i < w.counter ? 'bg-accent' : 'bg-line'}"></i>
                  {/each}
                </div>
                <span class="text-fg2">{t('{n} von {total}', { n: w.counter, total: w.trigger.count })}</span>
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
                    {w.openCard.waiting ? t('Wartet auf die erste Person, die heimkommt') : w.openCard.assigneeIds.length ? t('Offen bei {names}', { names: w.openCard.assigneeIds.map(personName).join(', ') }) : t('Offen, niemand zugewiesen')}
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
      <button class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line text-[16px] font-semibold text-accent-text" onclick={() => openNewWatcher({ from: 'settings' })}>
        <Icon name="plus" size={18} stroke={2.6} />{t('Wächter hinzufügen')}
      </button>
    {/if}

    {#if activity.length}
      <h2 class="mt-6 mb-2 px-1 text-[13px] font-semibold tracking-wide text-fg2 uppercase">{t('Letzte Aktivität')}</h2>
      <ul class="divide-y divide-line overflow-hidden rounded-[16px] bg-surface" data-testid="watcher-activity">
        {#each activity as r (r.id)}
          <li class="px-4 py-2.5">
            <p class="text-[15px] font-medium">{r.watcherName}{r.subject ? ` (${r.subject})` : ''} · {RUN_TEXT[r.result] ?? r.result}</p>
            <p class="text-[13px] text-fg2">
              {formatDue(r.at)}{r.assignedTo.length ? ` · ${r.assignedTo.map(personName).join(', ')}` : ''}{r.note ? ` · ${noteText(r.note)}` : ''}
            </p>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
