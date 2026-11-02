<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  /**
   * Auswahlfeld im Stil der übrigen Zeilen: sichtbar der gewählte Wert mit Pfeil, darüber liegt ein durchsichtiges natives
   * <select>. So öffnet sich der Picker des Handys (Rädchen), das Aussehen bestimmt aber die App. Die <option>s kommen als Inhalt.
   * plain: Wert rechts in einer Zeile (Gruppen, Einstellungen); box: Feld mit Hintergrund und Rahmen (im Fließtext, in Formularen).
   */
  let {
    value = $bindable(),
    label,
    children,
    onchange,
    disabled = false,
    variant = 'plain',
    class: extra = '',
  }: {
    value?: string | number;
    label: string;
    children: Snippet;
    onchange?: (e: Event & { currentTarget: HTMLSelectElement }) => void;
    disabled?: boolean;
    variant?: 'plain' | 'box';
    class?: string;
  } = $props();

  let select: HTMLSelectElement | undefined = $state();
  let text = $state('');

  const read = () => (text = select?.selectedOptions[0]?.textContent?.trim() ?? '');

  // Der angezeigte Text folgt dem gewählten Eintrag, auch wenn sich Einträge oder ihre Beschriftung ändern
  onMount(() => {
    read();
    const observer = new MutationObserver(read);
    if (select) observer.observe(select, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  });
  $effect(() => {
    void value;
    void tick().then(read);
  });
</script>

<span
  class="relative inline-flex max-w-full min-w-0 items-center gap-1.5 {variant === 'box'
    ? 'min-h-11 rounded-xl border border-line bg-surface2 px-3 text-fg'
    : 'min-h-10 max-w-[220px] text-fg2'} focus-within:ring-2 focus-within:ring-accent {disabled ? 'opacity-60' : ''} {extra}"
>
  <span class="min-w-0 truncate {variant === 'plain' ? 'text-right' : ''}" data-testid="select-value">{text}</span>
  <span class="shrink-0 text-fg2" aria-hidden="true"><Icon name="chevron-down" size={14} /></span>
  <select
    bind:this={select}
    bind:value
    class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
    aria-label={label}
    {disabled}
    {onchange}
  >
    {@render children()}
  </select>
</span>
