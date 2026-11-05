<script lang="ts">
  import { api, ApiError } from '../../lib/api';
  import { prepareAvatar } from '../../lib/avatar';
  import { t } from '../../lib/i18n/index.svelte';
  import { refresh, toast, ui } from '../../lib/store.svelte';
  import Avatar from '../Avatar.svelte';

  /** Kopf der Einstellungen (wie „Konto" im Mockup): Bild, Name, Herkunft des Bilds, „Bild ändern" / „Bild entfernen" (für sich selbst) */
  let input: HTMLInputElement | undefined = $state();
  let busy = $state(false);
  const me = $derived(ui.me);
  const origin = $derived(me?.avatarSource === 'ha' ? t('Bild aus Home Assistant') : me?.avatarSource === 'upload' ? t('Eigenes Bild') : t('Noch kein Bild'));
  // Ein Kind ändert sein Bild nicht selbst (der Administrator tut es unter Personen und Zugriff)
  const canChange = $derived(!ui.isChild);

  async function pick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file || !me) return;
    busy = true;
    try {
      await api.uploadAvatar(me.id, await prepareAvatar(file));
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError || err instanceof Error ? err.message : t('Das Bild konnte nicht gespeichert werden'), { tone: 'error' });
    }
    busy = false;
  }

  async function remove() {
    if (!me) return;
    busy = true;
    try {
      await api.removeAvatar(me.id);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Das Bild konnte nicht entfernt werden'), { tone: 'error' });
    }
    busy = false;
  }
</script>

{#if me}
  <div class="flex items-center gap-3.5 rounded-row border border-line bg-surface p-3.5" data-testid="settings-head">
    <Avatar person={me} size={56} />
    <div class="min-w-0 flex-1">
      <p class="truncate text-[17px] font-bold tracking-tight">{me.displayName}</p>
      <p class="mt-0.5 text-[13px] text-fg2" data-testid="avatar-origin">{origin}{#if ui.isAdmin && !ui.isChild}&nbsp;•&nbsp;{t('Administrator')}{/if}</p>
      {#if canChange}
        <div class="mt-0.5 flex gap-4">
          <button class="min-h-9 text-[14px] font-semibold text-accent-text disabled:opacity-40" disabled={busy} onclick={() => input?.click()}>{t('Bild ändern')}</button>
          {#if me.avatarSource === 'upload'}
            <button class="min-h-9 text-[14px] font-semibold text-fg2 disabled:opacity-40" disabled={busy} onclick={remove}>{t('Bild entfernen')}</button>
          {/if}
        </div>
      {/if}
    </div>
    <input bind:this={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" class="hidden" aria-label={t('Bild wählen')} onchange={pick} />
  </div>
{/if}
