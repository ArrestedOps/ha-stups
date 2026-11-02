<script lang="ts">
  import { openSheet } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
</script>

<!-- Zahnrad oben rechts in der Kopfzeile jedes Reiters: ohne Rahmen, damit es neben Suche, Filter und „+" nicht mitzählt -->
<button class="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-fg2" aria-label="Einstellungen öffnen" onclick={() => openSheet({ type: 'settings' })}>
  <Icon name="gear" size={22} />
</button>
