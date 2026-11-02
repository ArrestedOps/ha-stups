<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type PasskeyInfo } from '../lib/api';
  import { createPasskey, passkeyErrorText } from '../lib/passkeys';
  import { toast, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Row from './Row.svelte';

  let list = $state<PasskeyInfo[] | null>(null);
  let adding = $state(false);
  let name = $state('');
  let busy = $state(false);

  onMount(async () => {
    list = await api.passkeys().catch(() => []);
  });

  const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function startAdding() {
    name = '';
    adding = true;
  }

  async function add(e: Event) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const created = await createPasskey(name.trim() || 'Dieses Gerät');
      list = [...(list ?? []), created];
      adding = false;
      toast('Passkey angelegt. Beim nächsten Mal genügt „Mit Passkey anmelden“.');
    } catch (err) {
      toast(passkeyErrorText(err), { tone: 'error' });
    }
    busy = false;
  }

  function remove(p: PasskeyInfo) {
    ui.confirm = {
      title: 'Passkey entfernen?',
      text: `„${p.name}“ kann sich danach nicht mehr anmelden. Das Passwort bleibt. Auf dem Gerät selbst bleibt der Passkey liegen, bis du ihn dort löschst.`,
      label: 'Entfernen',
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

<Group
  title="Passkeys"
  hint="Mit einem Passkey meldest du dich mit Fingerabdruck, Gesicht oder Bildschirmsperre an, ohne Passwort zu tippen. Das Passwort bleibt als Rückfall."
>
  {#each list ?? [] as p (p.id)}
    <div class="flex min-h-[52px] items-center gap-3 px-4 py-1.5" data-testid="passkey-row">
      <div class="min-w-0 flex-1">
        <div class="truncate text-[17px]">{p.name}</div>
        <div class="text-[13px] text-fg2">
          angelegt {day(p.createdAt)}, {p.lastUsedAt ? `zuletzt benutzt ${day(p.lastUsedAt)}` : 'noch nicht benutzt'}
        </div>
      </div>
      <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold text-danger" aria-label={`Passkey ${p.name} entfernen`} onclick={() => remove(p)}>
        Entfernen
      </button>
    </div>
  {/each}
  {#if adding}
    <form onsubmit={add} class="space-y-2 px-4 py-3" aria-label="Passkey anlegen">
      <input
        bind:value={name}
        maxlength="60"
        placeholder="Name, zum Beispiel iPhone von Anna"
        aria-label="Name des Passkeys"
        class="min-h-11 w-full rounded-xl bg-surface2 px-3"
      />
      <div class="flex gap-2">
        <button class="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60" disabled={busy}>Anlegen</button>
        <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (adding = false)}>Abbrechen</button>
      </div>
    </form>
  {:else if list !== null}
    <Row label={list.length === 0 ? 'Noch kein Passkey' : undefined}>
      <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={startAdding}>Passkey hinzufügen</button>
    </Row>
  {/if}
</Group>
