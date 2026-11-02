<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api, ApiError } from '../lib/api';
  import { passkeyErrorText, signInWithPasskey } from '../lib/passkeys';
  import { feat, reloadApp, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  const setup = $derived(ui.gate === 'setup');

  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let repeat = $state('');
  let code = $state('');
  let error = $state('');
  let busy = $state(false);

  const field = 'min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-[17px]';

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

<main class="mx-auto flex min-h-full max-w-[420px] flex-col justify-center gap-6 px-6 py-10" data-testid={setup ? 'setup' : 'login'}>
  <div class="text-center">
    <span class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[18px] bg-accent-grad"><Icon name="columns" size={28} /></span>
    <h1 class="text-[34px] leading-tight font-bold tracking-tight">Stups</h1>
    <p class="mt-1 text-fg2">{setup ? t('Willkommen! Richte den ersten Administrator ein.') : t('Bitte melde dich an.')}</p>
  </div>

  <form onsubmit={submit} class="flex flex-col gap-3" aria-label={setup ? t('Einrichtung') : t('Anmeldung')}>
    {#if setup}
      <div class="flex flex-col gap-1.5">
        <label class="flex flex-col gap-1.5">
          <span class="text-[13px] font-semibold text-fg2">{t('Einrichtungscode')}</span>
          <input class={field} bind:value={code} autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" required />
        </label>
        <span class="text-[13px] text-fg2">{t('Den Code zeigt das Protokoll des Containers an (zum Beispiel mit {command}).', { command: 'docker logs stups' })}</span>
      </div>
    {/if}
    <label class="flex flex-col gap-1.5">
      <span class="text-[13px] font-semibold text-fg2">{t('Benutzername')}</span>
      <input class={field} bind:value={username} autocomplete="username" autocapitalize="none" spellcheck="false" required />
    </label>
    {#if setup}
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-fg2">{t('Name in Stups')}</span>
        <input class={field} bind:value={displayName} maxlength="60" autocomplete="name" placeholder={t('Wie du angezeigt wirst')} />
      </label>
    {/if}
    <div class="flex flex-col gap-1.5">
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-fg2">{t('Passwort')}</span>
        <input
          class={field}
          type="password"
          bind:value={password}
          autocomplete={setup ? 'new-password' : 'current-password'}
          minlength={setup ? 10 : undefined}
          required
        />
      </label>
      {#if setup}<span class="text-[13px] text-fg2">{t('Mindestens 10 Zeichen.')}</span>{/if}
    </div>
    {#if setup}
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-fg2">{t('Passwort wiederholen')}</span>
        <input class={field} type="password" bind:value={repeat} autocomplete="new-password" required />
      </label>
    {/if}

    {#if error}<p class="rounded-xl bg-danger-bg px-4 py-3 text-[15px] text-danger" role="alert">{error}</p>{/if}

    <button class="mt-1 min-h-12 rounded-xl bg-accent px-5 text-[17px] font-semibold text-on-accent disabled:opacity-60" disabled={busy}>
      {setup ? t('Einrichten') : t('Anmelden')}
    </button>
  </form>

  {#if !setup && feat.passkeys}
    <div class="flex flex-col gap-3">
      <p class="text-center text-[13px] text-fg2">{t('oder')}</p>
      <button
        type="button"
        class="min-h-12 rounded-xl border border-line bg-surface px-5 text-[17px] font-semibold disabled:opacity-60"
        disabled={busy}
        data-testid="passkey-login"
        onclick={withPasskey}
      >
        {t('Mit Passkey anmelden')}
      </button>
    </div>
  {/if}
</main>
