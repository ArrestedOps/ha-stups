<script lang="ts">
  // Schalter 51 × 31: aus grau, an mit Verlauf. Ein Knopf mit role="switch", Tippfläche mindestens 44 px hoch.
  let { checked = false, label, disabled = false, onchange }: { checked?: boolean; label: string; disabled?: boolean; onchange?: (value: boolean) => void } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  class="relative flex h-11 w-[51px] shrink-0 items-center disabled:opacity-40"
  onclick={() => onchange?.(!checked)}
>
  <span class="absolute inset-x-0 top-1/2 h-[31px] -translate-y-1/2 rounded-full transition-colors {checked ? 'bg-(--switch)' : 'bg-track'}"></span>
  <span
    class="absolute top-1/2 h-[27px] w-[27px] -translate-y-1/2 rounded-full bg-on-media shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-[left]"
    style:left={checked ? '22px' : '2px'}
  ></span>
</button>
