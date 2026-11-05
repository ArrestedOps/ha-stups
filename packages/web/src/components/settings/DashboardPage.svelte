<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type HaDashboards } from '../../lib/api';
  import { isDashboardPath, resolveDashboardPath, readHaDefaultPanel } from '../../lib/dashboard';
  import { t } from '../../lib/i18n/index.svelte';
  import { toast, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import SectionHeader from '../ui/SectionHeader.svelte';
  import Tile from '../ui/Tile.svelte';
  import Page from './Page.svelte';

  /**
   * Einstellungen › Home Assistant › Dashboard: Wohin der Home-Knopf oben führt. Jede Person wählt für sich (in der Datenbank, auf allen
   * Geräten gleich). Hat sie nichts gewählt, gilt ihr Standard-Dashboard aus Home Assistant; der ist hier vorausgewählt und beschriftet.
   */
  let list = $state<HaDashboards | null>(null);
  let custom = $state('');
  let editingCustom = $state(false);

  const chosen = $derived(ui.me?.dashboardPath ?? null);
  const items = $derived(list?.items ?? []);
  // Der Standard, der gilt, solange nichts gewählt ist: Home Assistant (defaultPanel), sonst die Option der App
  const fallback = $derived(
    resolveDashboardPath({ person: null, haDefaultPanel: readHaDefaultPanel(), addon: list?.addonPath ?? ui.settings?.effectiveDashboardPath ?? null }),
  );
  const titleOf = (path: string) => items.find((d) => d.path === path)?.title ?? path;
  const defaultLabel = $derived(
    fallback.source === 'ha' ? t('Standard (Home Assistant: {title})', { title: titleOf(fallback.path) }) : t('Standard ({title})', { title: titleOf(fallback.path) }),
  );
  /** eine eigene Wahl, die nicht in der Liste steht */
  const isCustom = $derived(chosen !== null && !items.some((d) => d.path === chosen));

  onMount(async () => {
    list = await api.haDashboards().catch(() => null);
    if (isCustom && chosen) custom = chosen;
  });

  async function save(path: string | null) {
    const before = ui.me?.dashboardPath ?? null;
    if (ui.me) ui.me = { ...ui.me, dashboardPath: path };
    try {
      await api.saveDashboard(path);
      editingCustom = false;
    } catch {
      if (ui.me) ui.me = { ...ui.me, dashboardPath: before };
      toast(t('Das Dashboard ließ sich nicht speichern'), { tone: 'error' });
    }
  }

  async function saveCustom(e: Event) {
    e.preventDefault();
    const p = custom.trim();
    if (!isDashboardPath(p)) {
      toast(t('Der Pfad muss mit / beginnen, zum Beispiel /dashboard-handy/start'), { tone: 'error' });
      return;
    }
    await save(p);
  }
</script>

<Page title={t('Dashboard')}>
  <div class="flex flex-col gap-2 pt-1">
    <p class="px-1 text-[14px] text-fg2">{t('Dieses Dashboard öffnet der Home-Knopf oben in Stups. Die Wahl gilt nur für dich, auf allen deinen Geräten.')}</p>
    <SectionHeader title={t('Ziel des Home-Knopfs')} />
    <div class="flex flex-col gap-2" role="group" aria-label={t('Dashboard')} data-testid="dashboard-choices">
      {#snippet choice(title: string, sub: string, selected: boolean, onpick: () => void, id: string)}
        <ListRow {title} current={selected} pressed={selected} onclick={onpick}>
          {#snippet tile()}<Tile color={selected ? 'orange' : 'gray'}><Icon name="home" size={22} stroke={1.8} /></Tile>{/snippet}
          {#snippet meta()}<span class="truncate" data-testid={id}>{sub}</span>{/snippet}
          {#snippet right()}
            {#if selected}<span class="flex text-accent-text"><Icon name="check" size={20} stroke={2.4} /></span>{/if}
          {/snippet}
        </ListRow>
      {/snippet}

      {@render choice(defaultLabel, fallback.path, chosen === null, () => save(null), 'dashboard-default')}
      {#each items as d (d.path)}
        {@render choice(d.title, d.path, chosen === d.path, () => save(d.path), 'dashboard-item')}
      {/each}
      {@render choice(t('Eigener Pfad …'), isCustom && chosen ? chosen : t('zum Beispiel /dashboard-handy/start'), isCustom, () => (editingCustom = true), 'dashboard-custom')}
    </div>
    {#if editingCustom || isCustom}
      <form onsubmit={saveCustom} class="flex items-center gap-2 px-1 pt-1">
        <input bind:value={custom} placeholder="/dashboard-handy/start" class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3" aria-label={t('Eigener Pfad')} />
        <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent">{t('Speichern')}</button>
      </form>
    {/if}
    {#if list && !list.connected}
      <p class="px-1 text-[12.5px] leading-[1.45] text-hint" data-testid="dashboard-offline">{t('Die Liste der Dashboards ließ sich von Home Assistant nicht holen. „Eigener Pfad“ geht trotzdem.')}</p>
    {/if}
  </div>
</Page>
