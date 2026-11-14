<script lang="ts">
  // Kästchen zum Auswählen in Listen (Wächter, „Gefunden“): ein echtes Kontrollkästchen mit 44 px Tippfläche, rund mit Haken in der Akzentfarbe
  let { checked, label, disabled = false, onchange }: { checked: boolean; label: string; disabled?: boolean; onchange: () => void } = $props();
</script>

<label class="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center {disabled ? 'opacity-40' : ''}" data-testid="select-box">
  <input type="checkbox" class="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" {checked} {disabled} aria-label={label} {onchange} />
  <span class="flex h-6 w-6 items-center justify-center rounded-[8px] border-2 border-track bg-bg text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" aria-hidden="true">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
  </span>
</label>
