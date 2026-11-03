<script lang="ts">
  import { avatarUrl } from '../lib/avatar';

  let { person, size = 26 }: { person: { id?: string; displayName: string; color: string | null; avatarRev?: number | null }; size?: number } = $props();

  // Das Bild der Person, sonst die Initiale in der Personenfarbe; lädt das Bild nicht, bleibt es bei der Initiale
  const src = $derived(avatarUrl(person));
  let failed = $state<string | null>(null);
  const showImage = $derived(src !== null && failed !== src);
</script>

<span
  class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[9px] font-bold text-[#0e0f13]"
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.46)}px"
  style:background={person.color ?? '#a2a7b3'}
  title={person.displayName}
>
  {#if showImage}
    <img {src} alt="" class="h-full w-full object-cover" onerror={() => (failed = src)} />
  {:else}
    {person.displayName.charAt(0).toUpperCase()}
  {/if}
</span>
