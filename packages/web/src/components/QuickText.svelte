<script lang="ts">
  import { autogrow } from '../lib/autogrow';
  import { highlightSegments, type QuickToken } from '../lib/quickadd';

  /**
   * Die Schnell-Zeile: ein Textfeld, in dem erkannte Teile (Datum, Uhrzeit, Person, Kategorie, Wiederholung, Priorität)
   * farbig hinterlegt sind. Die Farbe liegt auf einer Spiegel-Ebene hinter dem Feld, Cursor und Auswahl bleiben die des Browsers.
   */
  let {
    value = $bindable(''),
    tokens,
    placeholder,
    onenter,
  }: { value?: string; tokens: QuickToken[]; placeholder: string; onenter: () => void } = $props();

  const segments = $derived(highlightSegments(value, tokens));
  // Beide Ebenen müssen gleich gesetzt sein, sonst verrutscht die Hervorhebung
  const font = 'text-[26px] leading-tight font-bold tracking-tight';

  function focus(node: HTMLElement) {
    node.focus();
  }
</script>

<div class="relative mt-1">
  <div class="pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap text-transparent {font}" aria-hidden="true" data-testid="quick-mirror">
    {#each segments as s, i (i)}{#if s.token}<mark
          class="rounded-md text-transparent {s.token.status === 'ok' || s.token.status === 'new' ? 'bg-accent/30' : 'bg-danger-bg'}"
          data-kind={s.token.kind}>{s.text}</mark
        >{:else}{s.text}{/if}{/each}
  </div>
  <textarea
    use:focus
    use:autogrow={value}
    rows="1"
    bind:value
    {placeholder}
    maxlength="200"
    enterkeyhint="done"
    autocapitalize="sentences"
    spellcheck="false"
    class="relative block w-full resize-none overflow-hidden bg-transparent {font}"
    aria-label="Titel"
    onkeydown={(e) => {
      // Eingabetaste legt an, statt einen Zeilenumbruch in den Titel zu schreiben
      if (e.key === 'Enter') {
        e.preventDefault();
        onenter();
      }
    }}
  ></textarea>
</div>
