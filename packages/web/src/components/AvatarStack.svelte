<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { stackPlan } from '../lib/avatarStack';
  import Avatar from './Avatar.svelte';

  type Person = { id?: string; displayName: string; color: string | null; avatarRev?: number | null };
  // Die Zuständigen einer Karte als überlappende Kreise (höchstens drei breit, siehe lib/avatarStack.ts); für Screenreader steht jeder Name im Text
  let { people, size = 28 }: { people: Person[]; size?: number } = $props();
  const plan = $derived(stackPlan(people.length));
  const names = $derived(people.map((p) => p.displayName).join(', '));
</script>

{#if people.length}
  <span class="inline-flex shrink-0 items-center" role="img" aria-label={t('Zuständig: {names}', { names })} data-testid="card-assignees">
    {#each people.slice(0, plan.shown) as p, i (p.id ?? i)}
      <span class="inline-flex {i > 0 ? '-ml-2.5' : ''}" aria-hidden="true"><Avatar person={p} {size} ring={1.5} /></span>
    {/each}
    {#if plan.more > 0}
      <span
        class="-ml-2.5 inline-flex items-center justify-center rounded-full bg-surface2 font-bold text-fg ring-[1.5px] ring-surface"
        style:width="{size}px"
        style:height="{size}px"
        style:font-size="{Math.round(size * 0.43)}px"
        aria-hidden="true"
      >+{plan.more}</span>
    {/if}
  </span>
{/if}
