<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { symbolSuggestions } from '../lib/symbols/detect';
  import { DEFAULT_SYMBOL, SECTIONS, SYMBOLS, SYMBOL_COLORS, sectionColor, sectionTitle, symbolById, symbolName, type SymbolInfo } from '../lib/symbols/library';
  import { pushRecent, recentSymbols } from '../lib/symbols/recent';
  import { searchSymbols } from '../lib/symbols/search';
  import type { TileColor } from './ui/Tile.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import Tile from './ui/Tile.svelte';
  import { colorName } from '../lib/symbols/colors';

  /**
   * „Symbol wählen“: Vorschau, Suche, Farbe (Auto oder fest), dann Vorschläge zum Titel, zuletzt benutzt und sechs Bereiche.
   * Übernommen wird erst mit dem großen Knopf; „Zurück“ lässt alles, wie es war.
   */
  let {
    title,
    icon,
    color,
    source,
    onpick,
    onclose,
  }: {
    /** Titel der Karte (für die Vorschläge und den Satz „automatisch erkannt aus …“) */
    title: string;
    icon: string | null;
    color: string | null;
    source: 'auto' | 'manual' | null;
    onpick: (v: { icon: string; color: TileColor | null }) => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let sel = $state<string | null>(symbolById(icon) ? icon : null);
  // svelte-ignore state_referenced_locally
  let chosenColor = $state<TileColor | null>(SYMBOL_COLORS.includes(color as TileColor) ? (color as TileColor) : null);
  let touched = $state(false);
  let q = $state('');
  const query = $derived(q.trim());

  const shownId = $derived(sel ?? DEFAULT_SYMBOL);
  const shownInfo = $derived(symbolById(shownId)!);
  const shownColor = $derived<TileColor>(chosenColor ?? sectionColor(shownInfo.section));
  const note = $derived(
    touched || source === 'manual'
      ? t('Von dir gewählt')
      : source === 'auto' && sel
        ? t('Automatisch erkannt aus „{title}“', { title })
        : t('Standardsymbol, bis du eins wählst'),
  );

  const hits = $derived(query ? searchSymbols(query, i18n.lang) : []);
  const suggestions = $derived(title.trim() ? symbolSuggestions(title, i18n.lang, 4).map((id) => symbolById(id)!) : []);
  // einmal beim Öffnen gelesen: die Liste ändert sich nicht, solange das Fenster offen ist
  const recent = recentSymbols().map((id) => symbolById(id)!);
  const sections = $derived.by(() => {
    const out: { key: string; title: string; items: SymbolInfo[] }[] = [];
    if (query) {
      if (hits.length) out.push({ key: 'hits', title: t('Treffer'), items: hits });
      return out;
    }
    if (suggestions.length) out.push({ key: 'suggest', title: t('Passt zu „{title}“', { title: title.trim() }), items: suggestions });
    if (recent.length) out.push({ key: 'recent', title: t('Zuletzt benutzt'), items: recent });
    for (const s of SECTIONS) out.push({ key: s, title: sectionTitle(s), items: SYMBOLS.filter((x) => x.section === s) });
    return out;
  });

  function pick(id: string) {
    sel = id;
    touched = true;
  }
  function pickColor(c: TileColor | null) {
    chosenColor = c;
    touched = true;
  }
  function apply() {
    if (touched) {
      pushRecent(shownId);
      onpick({ icon: shownId, color: chosenColor });
    } else {
      onclose();
    }
  }

  /** Pfeiltasten im Raster: links und rechts ein Symbol, auf und ab eine Zeile (6 Spalten) */
  function gridKey(e: KeyboardEvent) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 6 : e.key === 'ArrowUp' ? -6 : 0;
    if (!delta) return;
    const grid = e.currentTarget as HTMLElement;
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>('button[data-sym]')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next = buttons[at + delta];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }
</script>

{#snippet back()}
  <button type="button" class="inline-flex h-11 items-center gap-0.5 pr-2 pl-0.5 text-[16px] font-semibold text-accent-text" onclick={onclose}>
    <Icon name="chevron-left" size={22} stroke={2.2} />{t('Zurück')}
  </button>
{/snippet}

{#snippet foot()}
  <CtaButton onclick={apply}><Icon name="check" size={22} stroke={2.6} />{t('Symbol übernehmen')}</CtaButton>
{/snippet}

<Sheet title={t('Symbol wählen')} {onclose} left={back} footer={foot}>
  <div class="sticky top-0 z-[1] -mx-3 flex flex-col gap-2.5 bg-bg px-3 pb-3.5">
    <div class="flex h-row items-center gap-3 rounded-row border border-line bg-surface px-3">
      <Tile color={shownColor} px={44} radius={12}><SymbolIcon id={shownId} size={26} /></Tile>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[15px] font-bold" data-testid="symbol-name">{symbolName(shownId)}</div>
        <div class="flex items-center gap-[5px] text-[13px] text-fg2">
          <span class="inline-flex shrink-0 text-sig-orange"><Icon name="spark" size={13} fill /></span><span class="line-clamp-2">{note}</span>
        </div>
      </div>
    </div>

    <label class="focus-ring-in flex h-12 items-center gap-2.5 rounded-row border border-line bg-surface pr-1.5 pl-3.5 text-fg2">
      <Icon name="search" size={20} stroke={2} />
      <input
        class="h-11 min-w-0 flex-1 bg-transparent p-0 text-[16px] font-medium text-fg outline-none placeholder:text-dim"
        type="search"
        aria-label={t('Symbol suchen')}
        placeholder={t('Suchen, z. B. Müll, Rasen, Auto')}
        bind:value={q}
      />
      {#if query}
        <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-text-soft" aria-label={t('Suche leeren')} onclick={() => (q = '')}>
          <Icon name="x" size={14} stroke={2.6} />
        </button>
      {/if}
    </label>

    <div class="no-scrollbar flex h-11 items-center gap-2 overflow-x-auto" role="radiogroup" aria-label={t('Farbe')}>
      <span class="mr-0.5 shrink-0 text-[13px] font-semibold text-fg2">{t('Farbe')}</span>
      <button
        type="button"
        role="radio"
        aria-checked={chosenColor === null}
        class="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold {chosenColor === null ? 'tok !h-[30px] !px-2.5 !text-[12px]' : 'border-track bg-surface text-text-soft'}"
        onclick={() => pickColor(null)}
      >
        <Icon name="spark" size={11} fill />{t('Auto')}
      </button>
      {#each SYMBOL_COLORS as c (c)}
        <button
          type="button"
          role="radio"
          aria-checked={chosenColor === c}
          aria-label={colorName(c)}
          class="h-[30px] w-[30px] shrink-0 rounded-full border-2 bg-clip-content p-0.5 {chosenColor === c ? 'border-fg' : 'border-transparent'}"
          style:background-image="linear-gradient(160deg, var(--tile-{c}-a), var(--tile-{c}-b))"
          onclick={() => pickColor(c)}
        ></button>
      {/each}
    </div>
  </div>

  <div class="flex flex-col gap-1.5 pt-0.5">
    {#each sections as s (s.key)}
      <div>
        <div class="mt-1.5 flex h-[34px] items-center gap-2 px-1">
          <h2 class="text-[15px] font-extrabold tracking-tight">{s.title}</h2>
          <span class="inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-count px-2 text-[12px] font-bold text-text-soft">{s.items.length}</span>
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="grid grid-cols-6 gap-1" role="group" aria-label={s.title} onkeydown={gridKey}>
          {#each s.items as o, i (o.id)}
            {@const on = o.id === sel}
            <button
              type="button"
              data-sym={o.id}
              aria-label={symbolName(o.id)}
              aria-pressed={on}
              tabindex={(s.items.some((x) => x.id === sel) ? on : i === 0) ? 0 : -1}
              class="flex h-[58px] items-center justify-center rounded-[15px] border-2 {on ? 'border-brand-dot shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_45%,transparent)]' : 'border-transparent'}"
              onclick={() => pick(o.id)}
            >
              <Tile color={chosenColor ?? sectionColor(o.section)} px={44} radius={12}><SymbolIcon id={o.id} size={24} /></Tile>
            </button>
          {/each}
        </div>
      </div>
    {/each}
    {#if query && hits.length === 0}
      <p class="px-3 py-7 text-center text-[14px] leading-normal text-fg2" role="status">
        {t('Nichts gefunden für „{query}“.', { query })}<br />{t('Versuch ein anderes Wort, zum Beispiel „Wäsche“ statt „Waschmaschine“.')}
      </p>
    {/if}
    <div class="mt-2.5 flex items-center gap-2 rounded-row border border-dashed border-track px-3.5 py-3 text-[13px] leading-snug text-fg2">
      <span class="inline-flex shrink-0 text-sig-orange"><Icon name="info" size={18} /></span>
      <span>{t('Die Suche kennt auch ähnliche Wörter und Tippfehler, zum Beispiel „Wäsche“ für die Waschmaschine. Eingebaut sind {n} Symbole.', { n: SYMBOLS.length })}</span>
    </div>
  </div>
</Sheet>
