<script lang="ts">
  import { settingsOverview } from '../lib/settingsPages';
  import { applyHeaderHiding, isHeaderHidingWanted, setHeaderHidingWanted, showHaHeader } from '../lib/hideHaHeader';
  import { t } from '../lib/i18n/index.svelte';
  import { closeSheet, feat, goToDashboard, openSettings, ui } from '../lib/store.svelte';
  import AccountPage from './settings/AccountPage.svelte';
  import BetaPage from './settings/BetaPage.svelte';
  import DashboardPage from './settings/DashboardPage.svelte';
  import DataPage from './settings/DataPage.svelte';
  import DatesPage from './settings/DatesPage.svelte';
  import IconsPage from './settings/IconsPage.svelte';
  import LookPage from './settings/LookPage.svelte';
  import NotificationsPage from './settings/NotificationsPage.svelte';
  import ReportPage from './settings/ReportPage.svelte';
  import SettingsHead from './settings/SettingsHead.svelte';
  import TemplatesPage from './settings/TemplatesPage.svelte';
  import VoicePage from './settings/VoicePage.svelte';
  import WatchersPage from './settings/WatchersPage.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import PeopleSheet from './PeopleSheet.svelte';
  import Sheet from './Sheet.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Einstellungen: eine Übersicht mit Gruppen („Für mich", „Haushalt", „Home Assistant", „Hilfe und Daten"), jede Zeile öffnet eine
   * Unterseite (Stapel im Sheet, zurück oben links). Welche Gruppen es gibt, entscheidet lib/settingsPages.ts nach Rolle und Betriebsart.
   */
  const page = $derived(ui.sheet?.type === 'settings' ? ui.sheet.page : undefined);

  let headerHidden = $state(isHeaderHidingWanted());
  const groups = $derived(
    settingsOverview({
      isAdmin: ui.isAdmin,
      isChild: ui.isChild,
      standalone: feat.standalone,
      beta: feat.beta,
      push: feat.push,
      watchers: feat.watchers,
      haUi: feat.haUi,
      house: feat.house,
      migration: feat.migration,
    }),
  );
</script>

{#if page === 'look'}
  <LookPage />
{:else if page === 'notifications'}
  <NotificationsPage />
{:else if page === 'report'}
  <ReportPage />
{:else if page === 'account'}
  <AccountPage />
{:else if page === 'people'}
  <PeopleSheet />
{:else if page === 'watchers'}
  <WatchersPage />
{:else if page === 'templates'}
  <TemplatesPage />
{:else if page === 'icons'}
  <IconsPage />
{:else if page === 'dates'}
  <DatesPage />
{:else if page === 'dashboard'}
  <DashboardPage />
{:else if page === 'voice'}
  <VoicePage />
{:else if page === 'data'}
  <DataPage />
{:else if page === 'beta'}
  <BetaPage />
{:else}
  <Sheet title={t('Einstellungen')} onclose={closeSheet}>
    <SettingsHead />
    {#each groups as g (g.id)}
      <Group title={g.title}>
        {#if g.actions?.includes('back')}
          <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={goToDashboard}>
            <Icon name="home" size={20} /><span class="flex-1">{t('Zurück zum Dashboard')}</span><Icon name="chevron-right" size={18} />
          </button>
        {/if}
        {#if g.actions?.includes('header')}
          <div class="flex min-h-[52px] w-full items-center gap-3 px-4 text-[17px]">
            <Icon name="columns" size={20} /><span class="flex-1">{t('HA-Kopfzeile ausblenden')}</span>
            <Toggle
              checked={headerHidden}
              label={t('Kopfzeile von Home Assistant ausblenden')}
              onchange={(on) => {
                headerHidden = on;
                setHeaderHidingWanted(on);
                if (on) applyHeaderHiding();
                else showHaHeader();
              }}
            />
          </div>
        {/if}
        {#each g.pages as p (p.id)}
          <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSettings(p.id)}>
            <Icon name={p.icon} size={20} /><span class="flex-1">{p.title}</span><Icon name="chevron-right" size={18} />
          </button>
        {/each}
      </Group>
    {/each}

    <p class="mt-5 px-3 text-center text-[13px] text-fg2">
      {#if !feat.standalone}{t('Angemeldet als {name}', { name: ui.me?.displayName ?? '—' })}{/if}
      {#if ui.caps?.version}{!feat.standalone ? '· ' : ''}{t('Version {version}', { version: ui.caps.version })}{/if}
      {#if feat.haUi}· <a class="text-accent-text" href="diagnose.html">{t('Diagnose-Seite')}</a>{/if}
    </p>
  </Sheet>
{/if}
