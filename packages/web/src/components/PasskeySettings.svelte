<script lang="ts">
  import { numberLocale, t } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, type PasskeyInfo } from '../lib/api';
  import { createPasskey, passkeyErrorText } from '../lib/passkeys';
  import { toast, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import Tile, { type TileColor } from './ui/Tile.svelte';

  let list = $state<PasskeyInfo[] | null>(null);
  let adding = $state(false);
  let name = $state('');
  let busy = $state(false);

  onMount(async () => {
    list = await api.passkeys().catch(() => []);
  });

  const TONES: TileColor[] = ['orange', 'blue', 'teal', 'violet'];
  const day = (iso: string) => new Date(iso).toLocaleDateString(numberLocale(), { day: 'numeric', month: 'short' });

  function startAdding() {
    name = '';
    adding = true;
  }

  async function add(e: Event) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const created = await createPasskey(name.trim() || t('Dieses Gerät'));
      list = [...(list ?? []), created];
      adding = false;
      toast(t('Passkey angelegt. Beim nächsten Mal genügt „Mit Passkey anmelden“.'));
    } catch (err) {
      toast(passkeyErrorText(err), { tone: 'error' });
    }
    busy = false;
  }

  function remove(p: PasskeyInfo) {
    ui.confirm = {
      title: t('Passkey entfernen?'),
      text: t('„{name}“ kann sich danach nicht mehr anmelden. Das Passwort bleibt. Auf dem Gerät selbst bleibt der Passkey liegen, bis du ihn dort löschst.', { name: p.name }),
      label: t('Entfernen'),
      run: async () => {
        try {
          await api.deletePasskey(p.id);
          list = (list ?? []).filter((x) => x.id !== p.id);
        } catch (err) {
          toast(passkeyErrorText(err), { tone: 'error' });
        }
      },
    };
  }
</script>

<section class="flex flex-col gap-2">
  <SectionHeader title="Passkeys" count={list?.length} />
  <p class="-mt-1 px-1 text-[12.5px] leading-[1.45] text-hint">
    {list !== null && list.length === 0 ? `${t('Noch kein Passkey')}. ` : ''}{t('Anmelden mit Fingerabdruck, Gesicht oder Bildschirmsperre. Das Passwort bleibt als Rückfall.')}
  </p>
  {#each list ?? [] as p, i (p.id)}
    <div data-testid="passkey-row">
      <ListRow title={p.name}>
        {#snippet tile()}<Tile color={TONES[i % TONES.length]!}><Icon name="lock" size={22} stroke={1.8} /></Tile>{/snippet}
        {#snippet meta()}{t('angelegt {when}', { when: day(p.createdAt) })} • {p.lastUsedAt ? t('zuletzt benutzt {when}', { when: day(p.lastUsedAt) }) : t('noch nicht benutzt')}{/snippet}
        {#snippet right()}
          <button class="inline-flex h-[34px] w-9 items-center justify-center rounded-[12px] bg-danger/15 text-danger" aria-label={t('Passkey {name} entfernen', { name: p.name })} onclick={() => remove(p)}>
            <Icon name="trash" size={16} />
          </button>
        {/snippet}
      </ListRow>
    </div>
  {/each}
  {#if adding}
    <form onsubmit={add} class="flex flex-col gap-3.5" aria-label={t('Passkey anlegen')}>
      <div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3">
        <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="passkey-name">{t('Name des Passkeys')}</label>
        <input id="passkey-name" bind:value={name} maxlength="60" placeholder={t('Name, zum Beispiel iPhone von Anna')} class="block min-h-6 w-full bg-transparent p-0 text-[16px] font-semibold outline-none placeholder:text-dim" />
      </div>
      <div class="flex gap-2">
        <div class="flex-1"><CtaButton type="submit" disabled={busy}>{t('Anlegen')}</CtaButton></div>
        <div class="flex-1"><CtaButton ghost onclick={() => (adding = false)}>{t('Abbrechen')}</CtaButton></div>
      </div>
    </form>
  {:else if list !== null}
    <ListRow title={t('Passkey hinzufügen')} dashed onclick={startAdding}>
      {#snippet tile()}<Tile color="gray"><Icon name="plus" size={22} stroke={1.8} /></Tile>{/snippet}
      {#snippet meta()}{t('für dieses Gerät')}{/snippet}
    </ListRow>
  {/if}
</section>
