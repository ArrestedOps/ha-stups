<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { boardColorKey } from '../lib/schedule';
  import { activeScheduleFilter, setScheduleFilter, ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';

  /**
   * Kalender, Desktop: „Boards ▾“ blendet Boards wie Kalender ein und aus (Häkchen in der Boardfarbe). Ohne Auswahl im Filter sind alle sichtbar;
   * wählt man alle, hebt sich die Auswahl wieder auf.
   */
  let open = $state(false);
  const sf = $derived(activeScheduleFilter());
  const on = (id: string) => sf.boardIds.length === 0 || sf.boardIds.includes(id);
  const colorOf = (id: string, color: string | null) => `var(--c-${boardColorKey(color, ui.boards.findIndex((b) => b.id === id))}-fg)`;
  function toggle(id: string) {
    const all = ui.boards.map((x) => x.id);
    const current = sf.boardIds.length === 0 ? all : sf.boardIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setScheduleFilter({ boardIds: next.length === all.length || next.length === 0 ? [] : next });
  }
</script>

<span class="relative inline-flex shrink-0" data-testid="calendar-boards">
  <button
    class="inline-flex h-9 items-center gap-2 rounded-full bg-surface pr-2.5 pl-3 text-[14px] font-semibold shadow-[0_0_0_0.5px_var(--sep)] hover:bg-surface2"
    aria-haspopup="menu"
    aria-expanded={open}
    data-testid="calendar-boards-button"
    onclick={() => (open = !open)}
  >
    <span class="flex gap-[3px]" aria-hidden="true">
      {#each ui.boards.filter((b) => on(b.id)).slice(0, 5) as b (b.id)}<i class="h-[9px] w-[9px] rounded-full" style:background={colorOf(b.id, b.color)}></i>{/each}
    </span>
    Boards<Icon name="chevron-down" size={16} stroke={2.4} />
  </button>
  {#if open}
    <button class="fixed inset-0 z-40 cursor-default" aria-label={t('Schließen')} tabindex="-1" onclick={() => (open = false)}></button>
    <div class="absolute top-11 right-0 z-50 max-h-[360px] min-w-[240px] overflow-y-auto rounded-[14px] bg-surface p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.22)]" role="menu" aria-label="Boards">
      {#each ui.boards as b (b.id)}
        <button class="flex h-10 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[14px] font-medium hover:bg-surface2" role="menuitemcheckbox" aria-checked={on(b.id)} onclick={() => toggle(b.id)}>
          <span class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-bg" style:border-color={colorOf(b.id, b.color)} style:background={on(b.id) ? colorOf(b.id, b.color) : 'transparent'}>
            {#if on(b.id)}<Icon name="check" size={12} stroke={3.2} />{/if}
          </span>
          <span class="min-w-0 flex-1 truncate">{b.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</span>
