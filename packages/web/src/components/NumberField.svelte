<script lang="ts">
  /**
   * Zahlenfeld des Entwurfs (`.num`): 56 × 40, Rundung 12, Rand, zentriert, 15 px fett; dahinter die Einheit („Min.", „×").
   * Der Wert bleibt ein Text, damit unfertige Eingaben erlaubt sind (das Formular prüft beim Speichern).
   */
  let {
    value = $bindable(),
    label,
    unit,
    placeholder = '',
    decimal = false,
    disabled = false,
  }: { value: string; label: string; unit?: string; placeholder?: string; decimal?: boolean; disabled?: boolean } = $props();
</script>

<span class="flex shrink-0 items-center gap-1.5">
  <input
    class="h-10 w-14 rounded-xl border border-track bg-bg px-1 text-center text-[15px] font-bold placeholder:text-dim disabled:opacity-50"
    inputmode={decimal ? 'decimal' : 'numeric'}
    bind:value
    {placeholder}
    aria-label={label}
    {disabled}
  />
  {#if unit}<span class="text-[13px] text-fg2">{unit}</span>{/if}
</span>
