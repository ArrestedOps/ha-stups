<script lang="ts">
  import { api, ApiError } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { feat, logout, toast, ui } from '../../lib/store.svelte';
  import Group from '../Group.svelte';
  import PasskeySettings from '../PasskeySettings.svelte';
  import Row from '../Row.svelte';
  import Page from './Page.svelte';

  /** Eigener Container mit eigener Anmeldung: Passwort, Passkeys, Abmelden (ein Kind meldet sich nur ab) */
  let changingPassword = $state(false);
  let pwCurrent = $state('');
  let pwNext = $state('');
  let pwRepeat = $state('');
  let pwBusy = $state(false);

  async function savePassword(e: Event) {
    e.preventDefault();
    if (pwNext !== pwRepeat) {
      toast(t('Die beiden neuen Passwörter sind nicht gleich'), { tone: 'error' });
      return;
    }
    pwBusy = true;
    try {
      await api.changePassword(pwCurrent, pwNext);
      toast(t('Passwort geändert. Andere Geräte melden sich neu an.'));
      changingPassword = false;
      pwCurrent = pwNext = pwRepeat = '';
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Passwort konnte nicht geändert werden'), { tone: 'error' });
    }
    pwBusy = false;
  }
</script>

<Page title={t('Konto und Anmeldung')}>
  <Group title={t('Konto')} hint={t('Wenn du dein Passwort änderst, melden sich deine anderen Geräte ab.')}>
    <Row label={t('Angemeldet als')}><span class="text-fg2">{ui.me?.displayName ?? '—'}</span></Row>
    {#if ui.isChild}
      <!-- ein Kind meldet sich nur ab; das Passwort ändert der Administrator -->
    {:else if changingPassword}
      <form onsubmit={savePassword} class="space-y-2 px-4 py-3" aria-label={t('Passwort ändern')}>
        <input type="password" bind:value={pwCurrent} autocomplete="current-password" placeholder={t('Aktuelles Passwort')} aria-label={t('Aktuelles Passwort')} class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
        <input type="password" bind:value={pwNext} autocomplete="new-password" placeholder={t('Neues Passwort (mindestens 10 Zeichen)')} aria-label={t('Neues Passwort')} minlength="10" class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
        <input type="password" bind:value={pwRepeat} autocomplete="new-password" placeholder={t('Neues Passwort wiederholen')} aria-label={t('Neues Passwort wiederholen')} class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
        <div class="flex gap-2">
          <button class="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60" disabled={pwBusy}>{t('Speichern')}</button>
          <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (changingPassword = false)}>{t('Abbrechen')}</button>
        </div>
      </form>
    {:else}
      <Row label={t('Passwort')}>
        <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={() => (changingPassword = true)}>{t('Ändern')}</button>
      </Row>
    {/if}
    <Row label={t('Auf diesem Gerät')}>
      <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold text-danger" onclick={() => void logout()}>{t('Abmelden')}</button>
    </Row>
  </Group>
  {#if feat.passkeys && !ui.isChild}<PasskeySettings />{/if}
</Page>
