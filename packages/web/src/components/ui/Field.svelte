<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  // Beschriftetes Eingabefeld (wie `.field` im Mockup): Beschriftung in Großbuchstaben, darunter das Feld; bei Fokus oranger Rand.
  let {
    label,
    value = $bindable(''),
    id,
    ...rest
  }: { label: string; value?: string; id: string } & Omit<HTMLInputAttributes, 'value' | 'id' | 'class'> = $props();
</script>

<div class="focus-ring-in flex flex-col gap-1.5 rounded-row border border-line bg-surface px-3.5 py-3">
  <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for={id}>{label}</label>
  <input {id} bind:value class="block min-h-6 w-full bg-transparent p-0 text-[16px] font-semibold outline-none placeholder:text-dim" {...rest} />
</div>
