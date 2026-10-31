<script lang="ts">
  import type { User } from '../lib/api';

  let { person, size = 26 }: { person: Pick<User, 'displayName' | 'color'>; size?: number } = $props();
</script>

<span
  class="inline-flex shrink-0 items-center justify-center rounded-[9px] font-bold text-[#0e0f13]"
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.46)}px"
  style:background={person.color ?? '#a2a7b3'}
  title={person.displayName}
>
  {person.displayName.charAt(0).toUpperCase()}
</span>
