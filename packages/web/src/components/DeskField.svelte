<script lang="ts">
  /**
   * Eingabefeld im Formular „Neuer Wächter“ am Desktop (Wert mit Einheit, Zahl oder Text): Rahmen mit Fokusring, dahinter die Einheit.
   * Der Wert bleibt ein Text, damit unfertige Eingaben erlaubt sind (das Formular prüft beim Speichern).
   */
  let {
    value = $bindable(),
    label,
    unit,
    placeholder = '',
    inputmode = 'decimal',
    width = 'w-28',
    onchange,
  }: {
    value: string;
    label: string;
    unit?: string;
    placeholder?: string;
    inputmode?: 'decimal' | 'numeric' | 'text';
    /** Breite als Tailwind-Klasse */
    width?: string;
    onchange?: () => void;
  } = $props();
</script>

<label class="focus-ring-in flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-track bg-bg px-3 {width} max-w-full">
  <input class="min-w-0 flex-1 bg-transparent text-[15px] font-bold placeholder:text-dim" {inputmode} bind:value {placeholder} aria-label={label} {onchange} />
  {#if unit}<span class="shrink-0 text-[13px] text-fg2">{unit}</span>{/if}
</label>
