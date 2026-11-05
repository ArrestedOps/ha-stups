<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api, ApiError } from '../lib/api';
  import { passkeyErrorText, signInWithPasskey } from '../lib/passkeys';
  import { feat, reloadApp, ui } from '../lib/store.svelte';
  import logo from '../assets/stups-icon.png';
  import Icon from './Icon.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import Field from './ui/Field.svelte';

  const setup = $derived(ui.gate === 'setup');

  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let repeat = $state('');
  let code = $state('');
  let error = $state('');
  let busy = $state(false);

  async function withPasskey() {
    if (busy) return;
    error = '';
    busy = true;
    try {
      await signInWithPasskey();
      reloadApp();
    } catch (err) {
      error = passkeyErrorText(err);
      busy = false;
    }
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    error = '';
    if (setup) {
      if (password !== repeat) {
        error = t('Die beiden Passwörter sind nicht gleich');
        return;
      }
    }
    busy = true;
    try {
      if (setup) await api.setup({ code, username, displayName, password });
      else await api.login(username, password);
      reloadApp();
    } catch (err) {
      error = err instanceof ApiError ? err.message : t('Etwas ist schiefgelaufen');
      busy = false;
    }
  }
</script>

<main class="relative mx-auto flex min-h-full max-w-[420px] flex-col gap-3.5 overflow-hidden px-5 pt-[calc(var(--safe-top)+96px)] pb-10" data-testid={setup ? 'setup' : 'login'}>
  <div class="pointer-events-none absolute -top-[120px] left-1/2 -ml-[210px] h-[320px] w-[420px] rounded-full" style="background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 28%, transparent), transparent)" aria-hidden="true"></div>
  <img src={logo} alt="Stups" class="relative z-[1] mx-auto block h-[88px] w-[88px] rounded-[22px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]" width="88" height="88" />
  <h1 class="relative z-[1] mt-1 text-center text-[34px] leading-tight font-extrabold tracking-tight">stups<span class="text-brand-dot">.</span></h1>
  <p class="relative z-[1] -mt-2 mb-3.5 text-center text-[14px] text-fg2">{setup ? t('Willkommen! Richte den ersten Administrator ein.') : t('Euer Board. Mit einem freundlichen Stups.')}</p>

  {#if !setup && feat.passkeys}
    <div class="relative z-[1]">
      <CtaButton disabled={busy} onclick={withPasskey}>
        <span class="flex items-center gap-2" data-testid="passkey-login"><Icon name="lock" size={22} stroke={1.8} />{t('Mit Passkey anmelden')}</span>
      </CtaButton>
    </div>
    <div class="relative z-[1] my-1 flex items-center gap-2.5 text-[12px] font-semibold text-dim before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{t('oder mit Passwort')}</div>
  {/if}

  <form onsubmit={submit} class="relative z-[1] flex flex-col gap-3.5" aria-label={setup ? t('Einrichtung') : t('Anmeldung')}>
    {#if setup}
      <div class="flex flex-col gap-1.5">
        <Field id="auth-code" label={t('Einrichtungscode')} bind:value={code} autocomplete="off" autocapitalize="characters" spellcheck={false} placeholder="ABCD-EFGH" required />
        <span class="px-1 text-[12.5px] text-hint">{t('Den Code zeigt das Protokoll des Containers an (zum Beispiel mit {command}).', { command: 'docker logs stups' })}</span>
      </div>
    {/if}
    <Field id="auth-user" label={t('Benutzername')} bind:value={username} autocomplete="username" autocapitalize="none" spellcheck={false} required />
    {#if setup}
      <Field id="auth-name" label={t('Name in Stups')} bind:value={displayName} maxlength={60} autocomplete="name" placeholder={t('Wie du angezeigt wirst')} />
    {/if}
    <div class="flex flex-col gap-1.5">
      <Field id="auth-pw" label={t('Passwort')} type="password" bind:value={password} autocomplete={setup ? 'new-password' : 'current-password'} minlength={setup ? 10 : undefined} required />
      {#if setup}<span class="px-1 text-[12.5px] text-hint">{t('Mindestens 10 Zeichen.')}</span>{/if}
    </div>
    {#if setup}
      <Field id="auth-repeat" label={t('Passwort wiederholen')} type="password" bind:value={repeat} autocomplete="new-password" required />
    {/if}

    {#if error}<p class="rounded-xl bg-danger-bg px-4 py-3 text-[15px] text-danger" role="alert">{error}</p>{/if}

    <CtaButton type="submit" ghost={!setup && feat.passkeys} disabled={busy}>{setup ? t('Einrichten') : t('Anmelden')}</CtaButton>
  </form>

  <p class="relative z-[1] mt-auto pt-4 text-center text-[12px] leading-[1.5] text-dim">
    {t('Stups läuft hier ohne Home Assistant, im eigenen Container.')}<br />{t('Nach 5 Fehlversuchen kurz warten.')}
  </p>
</main>
