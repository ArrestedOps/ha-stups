<script lang="ts">
  import { ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center" data-testid="no-access">
  <Icon name="lock" size={32} />
  <p class="text-[20px] font-semibold">Kein Zugriff</p>
  <p class="max-w-[320px] text-fg2">
    {#if ui.me}Du bist als {ui.me.displayName} angemeldet, aber noch nicht für Stups freigegeben.{:else}Du bist noch nicht für Stups freigegeben.{/if}
    Bitte einen Administrator von Home Assistant, dich unter <strong>Einstellungen › Personen &amp; Zugriff</strong> hinzuzufügen.
  </p>
  <button class="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent" onclick={() => location.reload()}>Erneut prüfen</button>
</div>
