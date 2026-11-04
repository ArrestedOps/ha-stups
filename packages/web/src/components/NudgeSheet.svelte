<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, ApiError, type NudgeInfo, type NudgeResult, type NudgeTemplate } from '../lib/api';
  import { preselected, sentMessage, targetHint } from '../lib/nudge';
  import { closeSheet, hopCard, refresh, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import SheetFooter from './ui/SheetFooter.svelte';

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
  const previewText = $derived(custom.trim() || (info ? templateText(template) : ''));
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
    <p class="mt-1 px-1 text-[17px] font-bold">{card?.title ?? ''}</p>

    <SectionHeader title={t('An wen')} />
    <div class="flex flex-col gap-2">
      {#each info.people as p (p.id)}
        {@const hint = targetHint(p)}
        <div class={p.selectable ? '' : 'opacity-50'}>
          <ListRow title={p.name} check={{ done: selected.includes(p.id), label: p.name, onchange: () => toggle(p.id, !selected.includes(p.id)), disabled: !p.selectable }}>
            {#snippet tile()}<Avatar person={{ displayName: p.name, color: p.color }} size={32} />{/snippet}
            {#snippet meta()}{hint ?? ''}{/snippet}
          </ListRow>
        </div>
      {:else}
        <p class="px-1 py-2 text-[15px] text-fg2">{t('Es gibt keine andere Person, die du stupsen könntest.')}</p>
      {/each}
    </div>
    <p class="mt-2 px-1 text-[13px] text-fg2">{t('Es bekommt jeder einen eigenen Stups. Pro Karte und Person geht höchstens einer alle 30 Minuten.')}</p>

    <SectionHeader title={t('Nachricht')} />
    <div class="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Nachricht')}>
      {#each TEMPLATES as k (k)}
        <button
          type="button"
          role="radio"
          aria-checked={template === k && !custom.trim()}
          class="min-h-10 rounded-full border px-4 text-[15px] font-semibold {template === k && !custom.trim() ? 'bg-accent-grad border-transparent' : 'border-line bg-surface'}"
          onclick={() => {
            template = k;
            custom = '';
          }}
        >
          {templateText(k)}
        </button>
      {/each}
    </div>
    <label class="mt-3 flex items-center gap-3 rounded-row border border-line bg-surface px-4">
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

    <SectionHeader title={t('So kommt es an')} />
    <div class="flex gap-3 rounded-row border border-line bg-surface p-3" aria-label={t('Vorschau der Push-Nachricht')} data-testid="nudge-preview">
      <span class="bg-accent-grad flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[18px] font-extrabold">s</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-[15px] font-bold">{t('{names} stupst dich', { names: ui.me?.displayName ?? '' })}</p>
        <p class="truncate text-[14px] text-fg2">{card?.title ?? ''} · {previewText}</p>
        <p class="mt-2 flex gap-2 text-[13px] font-semibold">
          {#each [t('Erledigt'), t('Mach ich'), t('Später')] as label (label)}<span class="rounded-full bg-surface2 px-3 py-1">{label}</span>{/each}
        </p>
      </div>
    </div>
    <p class="mt-2 flex items-center gap-2 px-1 text-[13px] text-fg2"><Icon name="clock" size={14} />{t('Während der Ruhezeit kommen Stupse erst am Morgen an.')}</p>

    <SheetFooter>
      <CtaButton disabled={!ready || busy} onclick={send}><Icon name="hand" size={20} />{t('Stups senden')}</CtaButton>
    </SheetFooter>
  {/if}
</Sheet>
