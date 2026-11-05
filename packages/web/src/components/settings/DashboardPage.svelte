<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { act, toast, ui } from '../../lib/store.svelte';
  import Group from '../Group.svelte';
  import SettingRow from '../SettingRow.svelte';
  import SelectField from '../SelectField.svelte';
  import HeaderToggle from './HeaderToggle.svelte';
  import Page from './Page.svelte';

  /** Wohin „Zurück zum Dashboard" führt (Einstellungen › Home Assistant), die Kopfzeile von Home Assistant und der Knopf für die Bubble Card */
  let dashboards = $state<{ title: string; path: string }[]>([]);
  let loaded = $state(false);
  let custom = $state('');

  const CUSTOM = '__custom__';
  const effective = $derived(ui.settings?.effectiveDashboardPath ?? '/');
  const known = $derived(dashboards.some((d) => d.path === effective));
  const selected = $derived(known ? effective : CUSTOM);

  onMount(async () => {
    dashboards = await api.dashboards().catch(() => []);
    custom = known ? '' : effective;
    loaded = true;
  });

  async function save(path: string | null) {
    const settings = await act(() => api.saveSettings({ dashboardPath: path }));
    if (settings) ui.settings = settings;
  }

  function onSelect(value: string) {
    if (value === CUSTOM) {
      custom = effective;
      return;
    }
    void save(value);
  }

  async function saveCustom(e: Event) {
    e.preventDefault();
    const p = custom.trim();
    if (!p.startsWith('/')) {
      toast(t('Der Pfad muss mit / beginnen, zum Beispiel /dashboard-handy/start'), { tone: 'error' });
      return;
    }
    await save(p);
  }

</script>

<Page title={t('Dashboard und Kopfzeile')}>
  <Group
    title={t('Zurück zum Dashboard')}
    hint={ui.isAdmin
      ? t('Dieses Dashboard öffnet „Zurück zum Dashboard“ in den Einstellungen. Die Wahl gilt für alle gemeinsam.')
      : t('Dieses Dashboard öffnet „Zurück zum Dashboard“ in den Einstellungen. Die Wahl gilt für alle und ist Administratoren von Home Assistant vorbehalten.')}
  >
    <SettingRow label="Dashboard">
      <SelectField value={selected} disabled={!loaded || !ui.isAdmin} label="Dashboard" onchange={(e) => onSelect(e.currentTarget.value)}>
        {#each dashboards as d (d.path)}<option value={d.path}>{d.title}</option>{/each}
        <option value={CUSTOM}>{t('Eigener Pfad …')}</option>
      </SelectField>
    </SettingRow>
    {#if selected === CUSTOM && ui.isAdmin}
      <form onsubmit={saveCustom} class="flex items-center gap-2 px-4 py-2">
        <input bind:value={custom} placeholder="/dashboard-handy/start" class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3" aria-label={t('Eigener Pfad')} />
        <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent">{t('Speichern')}</button>
      </form>
    {/if}
  </Group>

  <HeaderToggle />

</Page>
