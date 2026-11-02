<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, ApiError, type NudgeInfo, type NudgeResult, type NudgeTemplate } from '../lib/api';
  import { preselected, sentMessage, targetHint } from '../lib/nudge';
  import { closeSheet, hopCard, refresh, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { id }: { id: string } = $props();

  const card = $derived(ui.view?.cards.find((c) => c.id === id));

  let info = $state<NudgeInfo | null>(null);
  let loadError = $state('');
  let selected = $state<string[]>([]);
  let template = $state<NudgeTemplate>('think');
  let custom = $state('');
  let busy = $state(false);

  async function load(keepSelection = false) {
    try {
      info = await api.nudgeInfo(id);
      selected = keepSelection ? selected.filter((s) => info!.people.find((p) => p.id === s)?.selectable) : preselected(info.people);
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : t('Konnte die Auswahl nicht laden');
    }
  }
  onMount(() => load());

  const TEMPLATES: NudgeTemplate[] = ['think', 'today', 'help', 'thanks'];
  // Die Vorlagen kommen vom Server (deutsch); hier stehen sie als Text, damit sie übersetzt werden
  const templateText = (k: string): string =>
    ({ think: t('Denkst du dran?'), today: t('Heute noch?'), help: t('Brauch deine Hilfe'), thanks: t('Danke dir! ❤️') })[k as 'think'] ?? (info?.templates as Record<string, string> | undefined)?.[k] ?? k;
  const nameOf = (pid: string) => ui.people.find((p) => p.id === pid)?.displayName ?? t('Jemand');
  const ready = $derived(selected.length > 0 && (custom.trim().length > 0 || !!template));

  function toggle(pid: string, on: boolean) {
    selected = on ? [...selected, pid] : selected.filter((s) => s !== pid);
  }

  async function send() {
    if (!ready || busy) return;
    busy = true;
    // `id` hängt am geöffneten Sheet und ist nach closeSheet() weg: vorher merken
    const cardId = id;
    try {
      const text = custom.trim();
      const res: NudgeResult = await api.nudge(cardId, { to: selected, ...(text ? { text } : { template }) });
      closeSheet();
      toast(sentMessage(res, nameOf));
      hopCard(cardId);
      void refresh();
    } catch (e) {
      // Alle Empfänger gesperrt: die Auskunft steht schon in der Liste, die Auswahl wird neu geladen
      if (e instanceof ApiError && e.status === 409) {
        toast(t('Gerade nicht möglich. Unter den Namen steht, ab wann es wieder geht.'), { tone: 'error' });
        await load(true);
      } else {
        toast(e instanceof ApiError ? e.message : t('Senden fehlgeschlagen'), { tone: 'error' });
      }
    }
    busy = false;
  }
</script>

<Sheet title={t('Stupsen')} onclose={closeSheet}>
  {#if loadError}
    <p class="py-10 text-center text-danger">{loadError}</p>
  {:else if !info}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else if !info.canNudge}
    <p class="py-10 text-center text-fg2">{t('Stupsen können nur Personen, die unter Einstellungen › Personen & Zugriff stehen.')}</p>
  {:else}
    <p class="mt-1 px-3 text-[15px] text-fg2">{card?.title ?? ''}</p>

    <Group title={t('An wen')} hint={t('Es bekommt jeder einen eigenen Stups. Pro Karte und Person geht höchstens einer alle 30 Minuten.')}>
      {#each info.people as t (t.id)}
        {@const hint = targetHint(t)}
        <label class="flex min-h-[56px] items-center gap-3 px-4 {t.selectable ? '' : 'opacity-50'}">
          <input
            type="checkbox"
            class="h-5 w-5 accent-[var(--accent)]"
            checked={selected.includes(t.id)}
            disabled={!t.selectable}
            aria-label={t.name}
            onchange={(e) => toggle(t.id, e.currentTarget.checked)}
          />
          <Avatar person={{ displayName: t.name, color: t.color }} size={30} />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[17px] font-medium">{t.name}</span>
            {#if hint}<span class="block text-[13px] text-fg2">{hint}</span>{/if}
          </span>
        </label>
      {:else}
        <p class="px-4 py-4 text-[15px] text-fg2">{t('Es gibt keine andere Person, die du stupsen könntest.')}</p>
      {/each}
    </Group>

    <Group title={t('Nachricht')}>
      <div class="flex flex-wrap gap-2 px-4 py-3" role="radiogroup" aria-label={t('Nachricht')}>
        {#each TEMPLATES as k (k)}
          <button
            type="button"
            role="radio"
            aria-checked={template === k && !custom.trim()}
            class="min-h-10 rounded-xl border px-3.5 text-[15px] {template === k && !custom.trim() ? 'border-accent bg-surface2 font-semibold' : 'border-line text-fg2'}"
            onclick={() => {
              template = k;
              custom = '';
            }}
          >
            {templateText(k)}
          </button>
        {/each}
      </div>
      <label class="flex items-center gap-3 px-4">
        <input
          bind:value={custom}
          maxlength={info.maxText}
          placeholder={t('Oder ein eigener Text')}
          enterkeyhint="send"
          class="min-w-0 flex-1 bg-transparent py-3.5"
          aria-label={t('Eigener Text')}
        />
        {#if custom}<span class="text-[13px] text-fg2">{custom.length}/{info.maxText}</span>{/if}
      </label>
    </Group>

    <button
      class="mt-4 mb-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent-grad text-[17px] font-bold disabled:opacity-40"
      disabled={!ready || busy}
      onclick={send}
    >
      <Icon name="hand" size={20} />{t('Stups senden')}
    </button>
  {/if}
</Sheet>
