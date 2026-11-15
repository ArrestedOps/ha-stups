<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { activeScheduleFilter, personById, setPersonScope, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  /**
   * „Für wen?“: das Menü oben rechts auf Aufgaben, Kalender und Wächter (Desktop), wie „Meine Aufgaben ▾“ am Handy. Es wählt die Personen, deren
   * Aufgaben und Wächter alle Seiten zeigen: Alle, Meine oder eine Person. Mit dem Chip daneben sieht man auch bei acht Personen, was gilt.
   */
  let { noun }: { noun: 'tasks' | 'watchers' } = $props();
  let open = $state(false);
  const sf = $derived(activeScheduleFilter());
  const meId = $derived(ui.me?.id ?? null);
  const onlyId = $derived(sf.personIds.length === 1 ? sf.personIds[0]! : null);
  const people = $derived(ui.people.filter((p) => p.isPerson && p.id !== meId));
  const all = $derived(noun === 'tasks' ? t('Alle Aufgaben') : t('Alle Wächter'));
  const mine = $derived(noun === 'tasks' ? t('Meine Aufgaben') : t('Meine Wächter'));
  const ofName = (name: string) => (noun === 'tasks' ? t('Aufgaben von {name}', { name }) : t('Wächter von {name}', { name }));
  const label = $derived.by(() => {
    if (sf.personIds.length === 0) return all;
    if (onlyId && onlyId === meId) return mine;
    if (onlyId) return ofName(personById(onlyId)?.displayName ?? '…');
    return t('Mehrere Personen');
  });
  const shown = $derived(onlyId ? personById(onlyId) : null);
  const pick = (ids: string[]) => {
    setPersonScope(ids);
    open = false;
  };
</script>

{#snippet item(text: string, on: boolean, ids: string[], who: { displayName: string; color: string | null; id?: string } | null)}
  <button class="flex h-10 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[14px] hover:bg-surface2 {on ? 'font-bold' : 'font-medium'}" role="menuitemradio" aria-checked={on} onclick={() => pick(ids)}>
    {#if who}<Avatar person={who} size={26} />{:else}<span class="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-surface2 text-text-soft"><Icon name="list" size={14} stroke={2} /></span>{/if}
    <span class="min-w-0 flex-1 truncate">{text}</span>
    {#if on}<span class="text-accent-text"><Icon name="check" size={16} stroke={2.6} /></span>{/if}
  </button>
{/snippet}

<span class="relative inline-flex shrink-0" data-testid="scope-menu">
  <button
    class="inline-flex h-9 items-center gap-2 rounded-full bg-surface pr-2.5 pl-[5px] text-[14px] font-semibold shadow-[0_0_0_0.5px_var(--sep)] hover:bg-surface2"
    aria-haspopup="menu"
    aria-expanded={open}
    data-testid="scope-trigger"
    onclick={() => (open = !open)}
  >
    {#if shown}<Avatar person={shown} size={26} />{:else}<span class="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-surface2 text-text-soft"><Icon name="list" size={14} stroke={2} /></span>{/if}
    <span class="max-w-[190px] truncate" data-testid="scope-label">{label}</span><Icon name="chevron-down" size={16} stroke={2.4} />
  </button>
  {#if open}
    <button class="fixed inset-0 z-40 cursor-default" aria-label={t('Schließen')} tabindex="-1" onclick={() => (open = false)}></button>
    <div class="absolute top-11 right-0 z-50 min-w-[250px] rounded-[14px] bg-surface p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.22)]" role="menu" aria-label={t('Personen')}>
      {@render item(all, sf.personIds.length === 0, [], null)}
      {#if ui.me?.isPerson}{@render item(mine, onlyId === meId, [ui.me.id], ui.me)}{/if}
      {#if people.length > 0}<hr class="mx-2 my-1 border-0 border-t border-line" />{/if}
      {#each people as p (p.id)}{@render item(p.displayName, onlyId === p.id, [p.id], p)}{/each}
    </div>
  {/if}
</span>
