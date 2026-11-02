<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type BetaState } from '../lib/api';
  import { toast, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Row from './Row.svelte';

  let gate = $state<BetaState | null>(null);
  let busy = $state(false);

  onMount(async () => {
    gate = await api.beta().catch(() => null);
  });

  const mode = $derived(gate?.push.mode ?? 'off');

  async function change(patch: Partial<BetaState>) {
    if (busy || !ui.isAdmin) return;
    busy = true;
    try {
      gate = await api.setBeta(patch);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Das ging nicht', { tone: 'error' });
    }
    busy = false;
  }

  const choices = $derived([
    { id: 'off', label: 'Aus', run: () => change({ push: { mode: 'off' } }) },
    { id: 'only', label: 'Nur für mich', run: () => ui.me && change({ push: { mode: 'only', personId: ui.me.id } }) },
    { id: 'all', label: 'An', run: () => change({ push: { mode: 'all' } }) },
  ]);
</script>

<Group
  title="Beta"
  hint={ui.isAdmin
    ? 'Das ist die Beta-Version von Stups mit eigenen Daten. Push und Wächter sind zunächst aus, damit niemand Nachrichten doppelt bekommt (auch nicht aus der normalen App). Schalte sie nur ein, wenn du sie testen willst.'
    : 'Das ist die Beta-Version von Stups mit eigenen Daten. Push und Wächter schaltet ein Administrator ein.'}
>
  <div class="flex min-h-[46px] items-center gap-2 bg-accent px-4 py-2 text-on-accent" data-testid="beta-banner">
    <span class="rounded-md bg-on-accent px-2 py-0.5 text-[12px] font-bold text-accent">BETA</span>
    <span class="text-[15px] font-semibold">Beta-Version mit eigenen Daten</span>
  </div>
  {#if gate !== null}
    <div class="px-4 py-3">
      <div class="mb-1.5 text-[17px]" id="beta-push-label">Push-Nachrichten</div>
      <div class="flex gap-2" role="radiogroup" aria-labelledby="beta-push-label">
        {#each choices as c (c.id)}
          <button
            type="button"
            role="radio"
            aria-checked={mode === c.id}
            disabled={!ui.isAdmin || busy}
            class="min-h-11 flex-1 rounded-xl px-2 text-[15px] font-semibold disabled:opacity-60 {mode === c.id ? 'bg-accent text-on-accent' : 'bg-surface2'}"
            onclick={c.run}
          >
            {c.label}
          </button>
        {/each}
      </div>
    </div>
    <Row label="Wächter">
      <input
        type="checkbox"
        class="h-6 w-6 accent-[var(--accent)]"
        checked={gate.watchers}
        disabled={!ui.isAdmin || busy}
        aria-label="Wächter in der Beta einschalten"
        onchange={(e) => change({ watchers: e.currentTarget.checked })}
      />
    </Row>
  {/if}
</Group>
