<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { openFeedback } from '../lib/feedbackSheet.svelte';
  import { settingsOverview } from '../lib/settingsPages';
  import { applyHeaderHiding, isHeaderHidingWanted, setHeaderHidingWanted, showHaHeader } from '../lib/hideHaHeader';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { can, closeSheet, feat, openSettings, ui } from '../lib/store.svelte';
  import AccountPage from './settings/AccountPage.svelte';
  import BetaPage from './settings/BetaPage.svelte';
  import DashboardPage from './settings/DashboardPage.svelte';
  import DataPage from './settings/DataPage.svelte';
  import DatesPage from './settings/DatesPage.svelte';
  import FeedbackPage from './settings/FeedbackPage.svelte';
  import IconsPage from './settings/IconsPage.svelte';
  import LookPage from './settings/LookPage.svelte';
  import NotificationsPage from './settings/NotificationsPage.svelte';
  import ReportPage from './settings/ReportPage.svelte';
  import SettingsHead from './settings/SettingsHead.svelte';
  import TemplatesPage from './settings/TemplatesPage.svelte';
  import VoicePage from './settings/VoicePage.svelte';
  import WatchersPage from './settings/WatchersPage.svelte';
  import logo from '../assets/stups-icon.png';
  import Icon from './Icon.svelte';
  import PeopleSheet from './PeopleSheet.svelte';
  import Sheet from './Sheet.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';
  import { restart as restartOnboarding } from '../lib/onboarding.svelte';
  import BubblePage from './settings/BubblePage.svelte';
  import SummaryPage from './settings/SummaryPage.svelte';

  /**
   * Einstellungen: eine Übersicht mit Gruppen („Für mich", „Haushalt", „Home Assistant", „Hilfe und Daten"), jede Zeile öffnet eine
   * Unterseite (Stapel im Sheet, zurück oben links). Welche Gruppen es gibt, entscheidet lib/settingsPages.ts nach Rolle und Betriebsart.
   */
  const page = $derived(ui.sheet?.type === 'settings' ? ui.sheet.page : undefined);

  let headerHidden = $state(isHeaderHidingWanted());

  // Wer das Feedback verwalten darf, sieht an „Feedback der Nutzer", wie viele Rückmeldungen neu sind
  let newFeedback = $state(0);
  onMount(() => {
    if (can('feedback')) void api.feedbackSummary().then((r) => (newFeedback = r.newCount)).catch(() => {});
  });
  const groups = $derived(
    settingsOverview({
      isAdmin: ui.isAdmin,
      isChild: ui.isChild,
      permissions: ui.permissions,
      standalone: feat.standalone,
      beta: feat.beta,
      push: feat.push,
      watchers: feat.watchers,
      haUi: feat.haUi,
      house: feat.house,
      migration: feat.migration,
    }),
  );

  /** Farbe und Zeilentext der Seiten in der Übersicht (wie im Mockup: farbige Kachel, Titel, kurze Erklärung) */
  const LOOK: Record<string, { color: TileColor; meta: () => string }> = {
    notifications: { color: 'blue', meta: () => t('Test, Geräte, Ruhezeit') },
    look: { color: 'violet', meta: () => t('Sprache, Farbe, Ansicht') },
    account: { color: 'orange', meta: () => t('Passwort und Passkeys') },
    people: { color: 'violet', meta: () => tn('{n} Person', '{n} Personen', ui.people.filter((p) => p.isPerson).length) },
    templates: { color: 'purple', meta: () => t('Boards aus Vorlagen anlegen') },
    icons: { color: 'orange', meta: () => t('Symbole aus Titeln erkennen') },
    dates: { color: 'teal', meta: () => t('Standard-Uhrzeit für Termine') },
    summary: { color: 'gray', meta: () => t('morgens, wenn etwas ansteht') },
    dashboard: { color: 'teal', meta: () => t('Ziel des Home-Knopfs') },
    bubble: { color: 'purple', meta: () => t('YAML für die Bubble Card') },
    voice: { color: 'blue', meta: () => t('Ansage und Lampe im Haus') },
    report: { color: 'gray', meta: () => t('Stand jeder Person und jedes Geräts') },
    feedback: { color: 'orange', meta: () => (newFeedback > 0 ? t('{n} neu', { n: newFeedback }) : t('Fehler, Wünsche und Lob der Nutzer')) },
    data: { color: 'green', meta: () => (ui.isAdmin && feat.migration ? t('Papierkorb, Archiv, Umzug') : t('Papierkorb und Archiv')) },
    beta: { color: 'gray', meta: () => t('Beta-Einstellungen') },
  };
  const valueOf = (id: string): string | undefined => (id === 'summary' ? (ui.settings?.effectiveDailySummaryTime ?? undefined) : undefined);
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
{:else if page === 'bubble'}
  <BubblePage />
{:else if page === 'summary'}
  <SummaryPage />
{:else if page === 'voice'}
  <VoicePage />
{:else if page === 'data'}
  <DataPage />
{:else if page === 'feedback'}
  <FeedbackPage />
{:else if page === 'beta'}
  <BetaPage />
{:else}
  <Sheet title={t('Einstellungen')} onclose={closeSheet}>
    <div class="flex flex-col gap-3.5 pt-1">
      <SettingsHead />
      {#if !ui.isChild}
        <!-- Für jede Person ganz oben: Feedback senden (die Liste der Rückmeldungen steht für Administratoren unter „Hilfe und Daten") -->
        <ListRow title={t('Feedback & Ideen')} label={t('Feedback & Ideen')} onclick={() => openFeedback()}>
          {#snippet tile()}<Tile color="orange"><Icon name="message" size={22} stroke={1.8} /></Tile>{/snippet}
          {#snippet meta()}{t('Fehler melden, Wünsche, Lob und Kritik')}{/snippet}
          {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
        </ListRow>
      {/if}
      {#each groups as g (g.id)}
        <div class="flex flex-col gap-2">
          <SectionHeader title={g.title} />
          {#if g.actions?.includes('header')}
            <ListRow title={t('HA-Kopfzeile ausblenden')}>
              {#snippet tile()}<Tile color="gray"><Icon name="columns" size={22} stroke={1.8} /></Tile>{/snippet}
              {#snippet meta()}{t('Titel und Menü über der App')}{/snippet}
              {#snippet right()}
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
              {/snippet}
            </ListRow>
          {/if}
          {#each g.pages as p (p.id)}
            {@const look = LOOK[p.id] ?? { color: 'gray' as TileColor, meta: () => '' }}
            <ListRow title={p.title} label={p.title} onclick={() => openSettings(p.id)}>
              {#snippet tile()}<Tile color={look.color}><Icon name={p.icon} size={22} stroke={1.8} /></Tile>{/snippet}
              {#snippet meta()}{look.meta()}{/snippet}
              {#snippet right()}
                {#if valueOf(p.id)}<span class="shrink-0 text-[14px] text-fg2">{valueOf(p.id)}</span>{/if}
                <span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>
              {/snippet}
            </ListRow>
          {/each}
          {#if g.actions?.includes('onboarding')}
            <ListRow title={t('Einrichtung nochmal durchgehen')} label={t('Einrichtung nochmal durchgehen')} onclick={() => void restartOnboarding()}>
              {#snippet tile()}<Tile color="gray"><Icon name="spark" size={22} stroke={1.8} /></Tile>{/snippet}
              {#snippet meta()}{t('Personen, Wächter und Testnachricht')}{/snippet}
              {#snippet right()}<span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>{/snippet}
            </ListRow>
          {/if}
        </div>
      {/each}

      <p class="flex items-center justify-center gap-2 py-2 text-center text-[12px] text-dim">
        <img src={logo} alt="" class="h-5 w-5 rounded-[5px]" width="20" height="20" />
        <span>
          {#if !feat.standalone}{t('Angemeldet als {name}', { name: ui.me?.displayName ?? '—' })}{/if}
          {#if ui.caps?.version}{!feat.standalone ? '· ' : ''}{t('Version {version}', { version: ui.caps.version })}{/if}
          {#if feat.haUi}· <a class="text-accent-text" href="diagnose.html">{t('Diagnose-Seite')}</a>{/if}
        </span>
      </p>
    </div>
  </Sheet>
{/if}
