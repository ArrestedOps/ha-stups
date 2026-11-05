<script lang="ts">
  import { api } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { act, can, ui } from '../../lib/store.svelte';
  import Group from '../Group.svelte';
  import SettingRow from '../SettingRow.svelte';
  import Page from './Page.svelte';

  async function saveDefaultTime(value: string) {
    // Ein geleertes Feld stellt die Vorgabe (09:00) wieder her
    const settings = await act(() => api.saveSettings({ defaultDueTime: value === '' ? null : value }));
    if (settings) ui.settings = settings;
  }
</script>

<Page title={t('Termine')}>
  <Group title={t('Vorgaben')} hint={t('Gilt für alle: Schreibst du beim Anlegen einer Karte nur ein Datum („morgen“) ohne Uhrzeit, bekommt der Termin diese Uhrzeit. Das ändern Administratoren und wer die Berechtigung „App-Einstellungen“ hat.')}>
    <SettingRow label={t('Standard-Uhrzeit für Termine')}>
      <input
        type="time"
        class="min-h-10 rounded-xl bg-surface2 px-3 disabled:opacity-60"
        value={ui.settings?.defaultDueTime ?? '09:00'}
        disabled={!can('settings')}
        aria-label={t('Standard-Uhrzeit für Termine')}
        onchange={(e) => void saveDefaultTime(e.currentTarget.value)}
      />
    </SettingRow>
  </Group>
</Page>
