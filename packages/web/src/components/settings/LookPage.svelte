<script lang="ts">
  import { type LanguageChoice, t } from '../../lib/i18n/index.svelte';
  import { changeLanguage, feat, ui } from '../../lib/store.svelte';
  import AccentPicker from '../AccentPicker.svelte';
  import Group from '../Group.svelte';
  import SettingRow from '../SettingRow.svelte';
  import SelectField from '../SelectField.svelte';
  import HeaderToggle from './HeaderToggle.svelte';
  import Page from './Page.svelte';
</script>

<Page title={t('Sprache und Farbe')}>
  <Group title={t('Sprache')} hint={t('Gilt auf allen deinen Geräten und für Push-Nachrichten. „Automatisch“ folgt der Sprache des Geräts.')}>
    <SettingRow label={t('Sprache')}>
      <SelectField label={t('Sprache')} value={ui.me?.languageChoice ?? 'auto'} onchange={(e) => void changeLanguage(e.currentTarget.value as LanguageChoice)}>
        <option value="auto">{t('Automatisch')}</option>
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </SelectField>
    </SettingRow>
  </Group>
  <Group title={t('Farbe')} hint={t('Die Farbe der Knöpfe und Reiter. Gilt auf allen deinen Geräten, jede Person wählt ihre eigene.')}>
    <AccentPicker />
  </Group>
  <!-- Administratoren finden diese Wahl in der Übersicht der Einstellungen unter Home Assistant › HA-Kopfzeile ausblenden -->
  {#if feat.haUi && !ui.isAdmin}<HeaderToggle />{/if}
</Page>
