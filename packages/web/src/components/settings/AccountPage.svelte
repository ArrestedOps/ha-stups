<script lang="ts">
  import { api, ApiError } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { feat, logout, toast, ui } from '../../lib/store.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import Field from '../ui/Field.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import Tile from '../ui/Tile.svelte';
  import CtaButton from '../ui/CtaButton.svelte';
  import PasskeySettings from '../PasskeySettings.svelte';
  import SectionHeader from '../ui/SectionHeader.svelte';
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
  <div class="flex flex-col gap-3.5 pt-1">
    {#if ui.me}
      <div class="flex items-center gap-3.5 rounded-row border border-line bg-surface p-3.5">
        <Avatar person={ui.me} size={56} />
        <div class="min-w-0">
          <p class="truncate text-[17px] font-bold tracking-tight">{ui.me.displayName}</p>
          <p class="mt-0.5 text-[13px] text-fg2">{t('Angemeldet als')} {ui.me.name} · {ui.isChild ? t('Kind') : ui.isAdmin ? t('Administrator') : t('Mitglied')}</p>
        </div>
      </div>
    {/if}

    {#if feat.passkeys && !ui.isChild}<PasskeySettings />{/if}

    {#if !ui.isChild}
      <div class="flex flex-col gap-2">
        <SectionHeader title={t('Passwort ändern')} />
        {#if changingPassword}
          <form onsubmit={savePassword} class="flex flex-col gap-3.5" aria-label={t('Passwort ändern')}>
            <Field id="pw-current" label={t('Aktuelles Passwort')} type="password" bind:value={pwCurrent} autocomplete="current-password" required />
            <Field id="pw-next" label={t('Neues Passwort')} type="password" bind:value={pwNext} autocomplete="new-password" placeholder={t('mindestens 10 Zeichen')} minlength={10} required />
            <Field id="pw-repeat" label={t('Neues Passwort wiederholen')} type="password" bind:value={pwRepeat} autocomplete="new-password" required />
            <p class="-mt-1 px-1 text-[12.5px] leading-[1.45] text-hint">{t('Wenn du dein Passwort änderst, melden sich deine anderen Geräte ab.')}</p>
            <div class="flex gap-2">
              <div class="flex-1"><CtaButton type="submit" disabled={pwBusy}>{t('Speichern')}</CtaButton></div>
              <div class="flex-1"><CtaButton ghost onclick={() => (changingPassword = false)}>{t('Abbrechen')}</CtaButton></div>
            </div>
          </form>
        {:else}
          <ListRow title={t('Passwort')}>
            {#snippet tile()}<Tile color="gray"><Icon name="lock" size={22} stroke={1.8} /></Tile>{/snippet}
            {#snippet meta()}{t('Danach melden sich deine anderen Geräte ab.')}{/snippet}
            {#snippet right()}
              <button class="bg-surface2 inline-flex h-[34px] items-center rounded-[12px] px-3 text-[13px] font-bold text-text-soft" onclick={() => (changingPassword = true)}>{t('Ändern')}</button>
            {/snippet}
          </ListRow>
        {/if}
      </div>
    {/if}

    <button class="flex h-[52px] w-full items-center justify-center gap-2 rounded-row border border-danger/35 bg-danger/10 text-[15px] font-bold text-danger" onclick={() => void logout()}>
      <Icon name="arrow-left" size={18} />{t('Auf diesem Gerät abmelden')}
    </button>
  </div>
</Page>
