<script lang="ts">
  import { ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';

  let { selected, onchange }: { selected: string[]; onchange: (ids: string[]) => void } = $props();

  function toggle(id: string) {
    onchange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
</script>

<div class="flex flex-wrap justify-end gap-2">
  {#each ui.people as p (p.id)}
    <button
      type="button"
      aria-pressed={selected.includes(p.id)}
      class="flex min-h-10 items-center gap-2 rounded-xl border px-3 text-[15px] {selected.includes(p.id)
        ? 'border-accent bg-surface2 font-semibold'
        : 'border-line text-fg2'}"
      onclick={() => toggle(p.id)}
    >
      <Avatar person={p} size={22} />{p.displayName}
    </button>
  {/each}
</div>
