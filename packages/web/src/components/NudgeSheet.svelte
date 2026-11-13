<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, ApiError, type NudgeInfo, type NudgeResult, type NudgeTemplate } from '../lib/api';
  import { preselected, sentMessage, targetHint } from '../lib/nudge';
  import { closeSheet, hopCard, refresh, toast, ui } from '../lib/store.svelte';
  import logo from '../assets/stups-icon.png';
  import { formatDue } from '../lib/datetime';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import ListRow from './ui/ListRow.svelte';
  import SectionHeader from './ui/SectionHeader.svelte';
  import CardTile from './CardTile.svelte';

  let { id }: { id: string } = $props();

  const card = $derived(ui.view?.cards.find((c) => c.id === id));
  const board = $derived(ui.boards.find((b) => b.id === card?.boardId));

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

{#snippet cancelButton()}
  <button class="inline-flex h-11 items-center px-2 text-[16px] font-semibold text-accent-text" onclick={closeSheet}>{t('Abbrechen')}</button>
{/snippet}

{#snippet footerCta()}
  <CtaButton disabled={!ready || busy} onclick={send}><Icon name="hand" size={22} stroke={2} />{t('Stups senden')}</CtaButton>
{/snippet}

<Sheet footer={info?.canNudge ? footerCta : undefined} title={t('Stupsen')} onclose={closeSheet} left={cancelButton} hideClose>
  {#if loadError}
    <p class="py-10 text-center text-danger">{loadError}</p>
  {:else if !info}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else if !info.canNudge}
    <p class="py-10 text-center text-fg2">{t('Stupsen können nur Personen, die unter Einstellungen › Personen & Zugriff stehen.')}</p>
  {:else}
    <div class="flex flex-col gap-3.5 pt-1">
      {#if card}
        <ListRow title={card.title}>
          {#snippet tile()}<CardTile {card} glyph={22} />{/snippet}
          {#snippet meta()}
            {#if card.dueAt}<span class="shrink-0">{formatDue(card.dueAt)}</span><span class="shrink-0 text-sep" aria-hidden="true">•</span>{/if}
            <span class="truncate">{board?.name ?? ''}</span>
          {/snippet}
        </ListRow>
      {/if}

      <section aria-label={t('An wen?')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('An wen?')} />
        <div class="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t('An wen?')}>
          {#each info.people as p (p.id)}
            {@const on = selected.includes(p.id)}
            <Chip photo active={on} pressed={on} disabled={!p.selectable} onclick={() => toggle(p.id, !on)}>
              <Avatar person={{ displayName: p.name, color: p.color }} size={32} ring={on ? 0 : 1.5} />{p.name}
            </Chip>
          {:else}
            <p class="px-1 py-2 text-[15px] text-fg2">{t('Es gibt keine andere Person, die du stupsen könntest.')}</p>
          {/each}
        </div>
        {#each info.people as p (p.id)}
          {@const hint = targetHint(p)}
          {#if hint}<p class="px-1 text-[13px] text-fg2"><b class="font-semibold text-fg">{p.name}:</b> {hint}</p>{/if}
        {/each}
        <p class="px-1 text-[12.5px] leading-[1.45] text-hint">{t('Es bekommt jeder einen eigenen Stups. Pro Aufgabe und Person geht höchstens einer alle 30 Minuten.')}</p>
      </section>

      <section aria-label={t('Nachricht')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('Nachricht')} />
        <div class="list-group !mt-0" role="radiogroup" aria-label={t('Nachricht')}>
          {#each TEMPLATES as k (k)}
            {@const on = template === k && !custom.trim()}
            <button
              type="button"
              role="radio"
              aria-checked={on}
              class="flex h-[46px] w-full items-center justify-between gap-3 px-4 text-left text-[17px]"
              onclick={() => {
                template = k;
                custom = '';
              }}
            >
              {templateText(k)}{#if on}<span class="text-accent-text"><Icon name="check" size={20} stroke={2.6} /></span>{/if}
            </button>
          {/each}
        </div>
        <label class="flex flex-col gap-1.5 rounded-row bg-surface px-4 py-3 focus-within:ring-2 focus-within:ring-accent">
          <span class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase">{t('Eigener Text (optional)')}</span>
          <span class="flex items-center gap-3">
            <input
              bind:value={custom}
              maxlength={info.maxText}
              placeholder={t('z. B. Brauchst du noch was vom Baumarkt?')}
              enterkeyhint="send"
              class="min-h-6 min-w-0 flex-1 bg-transparent text-[17px] placeholder:text-dim"
              aria-label={t('Eigener Text')}
            />
            {#if custom}<span class="text-[13px] text-fg2">{custom.length}/{info.maxText}</span>{/if}
          </span>
        </label>
      </section>

      <section aria-label={t('So kommt es an')} class="flex flex-col gap-3.5">
        <SectionHeader title={t('So kommt es an')} />
        <div class="flex gap-2.5 rounded-[16px] bg-surface p-3" aria-label={t('Vorschau der Push-Nachricht')} data-testid="nudge-preview">
          <img src={logo} alt="" width="34" height="34" class="h-[34px] w-[34px] shrink-0 rounded-lg" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-[14px] font-bold">{t('{names} stupst dich', { names: ui.me?.displayName ?? '' })}</p>
            <p class="mt-0.5 text-[13px] leading-[1.35] text-text-soft2">{card?.title ?? ''} · {previewText}</p>
            <p class="mt-2 flex gap-1.5 text-[12px] font-semibold">
              {#each [t('Erledigt'), t('Mach ich'), t('Später')] as label (label)}<span class="inline-flex h-7 items-center rounded-lg bg-track px-2.5">{label}</span>{/each}
            </p>
          </div>
        </div>
        <p class="flex items-center gap-1.5 px-1 text-[12.5px] text-hint"><Icon name="moon" size={14} stroke={2} />{t('Während der Ruhezeit kommen Stupse erst am Morgen an.')}</p>
      </section>
    </div>
  {/if}
</Sheet>
