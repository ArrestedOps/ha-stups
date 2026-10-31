<script lang="ts">
  // Sichtbarer „Hinzufügen"-Knopf für Eingabezeilen: Auf dem iPhone ist die Eingabetaste nicht überall zu finden
  let { show, label = 'Hinzufügen', busy = false }: { show: boolean; label?: string; busy?: boolean } = $props();
</script>

{#if show}
  <button type="submit" disabled={busy} class="min-h-9 shrink-0 rounded-xl bg-accent px-3.5 text-[15px] font-bold text-on-accent disabled:opacity-40">
    {label}
  </button>
{/if}
