<script lang="ts">
  import { avatarUrl } from '../lib/avatar';

  let {
    person,
    size = 26,
    ring = 0,
  }: { person: { id?: string; displayName: string; color: string | null; avatarRev?: number | null }; size?: number; ring?: number } = $props();

  // Das Bild der Person, sonst die Initiale in der Personenfarbe; lädt das Bild nicht, bleibt es bei der Initiale
  const src = $derived(avatarUrl(person));
  let failed = $state<string | null>(null);
  const showImage = $derived(src !== null && failed !== src);
</script>

<span
  class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-on-avatar"
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.46)}px"
  style:background={person.color ?? 'var(--track)'}
  style:box-shadow={ring ? `0 0 0 ${ring}px var(--avatar-ring)` : undefined}
  title={person.displayName}
>
  {#if showImage}
    <img {src} alt="" class="h-full w-full object-cover" onerror={() => (failed = src)} />
  {:else}
    {person.displayName.charAt(0).toUpperCase()}
  {/if}
</span>
