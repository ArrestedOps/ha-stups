<script lang="ts">
  import { autogrow } from '../../lib/autogrow';
  import { deviceTz } from '../../lib/datetime';
  import { t } from '../../lib/i18n/index.svelte';
  import { catDot } from '../../lib/newCard';
  import type { QuickResult, QuickToken } from '../../lib/quickadd';
  import { chipLabel } from '../../lib/quickadd/labels';
  import { personById, ui } from '../../lib/store.svelte';
  import { symbolName } from '../../lib/symbols/library';
  import type { TileColor } from '../ui/Tile.svelte';
  import Avatar from '../Avatar.svelte';
  import CardTile from '../CardTile.svelte';
  import Icon from '../Icon.svelte';
  import SymbolIcon from '../SymbolIcon.svelte';

  /**
   * Die Schnell-Eingabe: Symbol, Titel und die erkannten Teile (Chips). Der Aufrufer hält den Titel und das Ergebnis der Erkennung;
   * hier steht nur die Darstellung. Das Fenster zur Symbolwahl öffnet der Aufrufer (`onopensymbol`).
   */
  let {
    title = $bindable(),
    parsed,
    symbol,
    quickProblem,
    ondrop,
    onopensymbol,
    onclearsymbol,
    oncreate,
  }: {
    title: string;
    parsed: QuickResult;
    symbol: { icon: string | null; iconColor: TileColor | null; iconSource: 'auto' | 'manual' | null };
    quickProblem: string | null;
    /** ein erkannter Teil wird zurückgenommen */
    ondrop: (tokenId: string) => void;
    onopensymbol: () => void;
    onclearsymbol: () => void;
    oncreate: () => void;
  } = $props();

  const tz = deviceTz();

  const hasToken = $derived(parsed.tokens.length > 0);
  const hint = $derived(
    !title.trim()
      ? t('Tipp: Datum, @Person, #Kategorie und „jede Woche“ einfach mitschreiben')
      : hasToken || symbol.icon
        ? t('Stups hat erkannt – zum Entfernen auf ✕ tippen')
        : t('Noch nichts erkannt – Standard-Symbol „Aufgabe“'),
  );

  const tokenCategory = (tok: QuickToken) => (ui.view?.categories ?? []).find((c) => c.name.toLowerCase() === (tok.value ?? '').toLowerCase());
  const tokenPerson = (tok: QuickToken) => {
    const a = parsed.assignees.find((x) => x.name.toLowerCase() === (tok.value ?? '').toLowerCase() && x.personId);
    return a?.personId ? personById(a.personId) : undefined;
  };
  const tokenIcon = (k: QuickToken['kind']) => (k === 'recurrence' ? 'repeat' : k === 'priority' ? 'flag' : k === 'person' ? 'user' : 'calendar');
</script>

<!-- Schnell-Eingabe: Symbol, Titel, erkannte Teile -->
<div class="flex flex-col gap-3 rounded-row border border-line bg-surface px-3.5 pt-3.5 pb-3">
  <div class="flex items-start gap-3">
    <button
      type="button"
      class="relative block shrink-0 rounded-[14px]"
      aria-label={t('Symbol ändern, gerade: {name}', { name: symbolName(symbol.icon) })}
      data-testid="symbol-tile"
      onclick={onopensymbol}
    >
      <CardTile card={symbol} glyph={28} />
      {#if symbol.iconSource === 'auto'}
        <span
          class="bg-accent-grad absolute -right-[5px] -bottom-[5px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface !shadow-none"
          data-testid="symbol-spark"
        ><Icon name="spark" size={12} fill /></span>
      {/if}
    </button>
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <label class="text-[12px] font-bold tracking-[0.06em] text-fg2 uppercase" for="quick">{t('Was steht an?')}</label>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        id="quick"
        rows="2"
        use:autogrow={title}
        bind:value={title}
        placeholder={t('z. B. Müll raus morgen 19 Uhr @Ben')}
        maxlength="200"
        enterkeyhint="done"
        autocapitalize="sentences"
        spellcheck="false"
        autofocus
        class="block min-h-[52px] w-full resize-none overflow-hidden bg-transparent p-0 text-[18px] leading-[1.35] font-bold outline-none placeholder:text-dim"
        onkeydown={(e) => {
          // Eingabetaste legt an, statt einen Zeilenumbruch in den Titel zu schreiben
          if (e.key === 'Enter') {
            e.preventDefault();
            oncreate();
          }
        }}
      ></textarea>
    </div>
  </div>
  <p class="flex items-center gap-1.5 text-[12px] text-fg2" role="status">
    <span class="inline-flex shrink-0 text-accent-text"><Icon name="spark" size={14} stroke={2} /></span>{hint}
  </p>
  {#if hasToken || symbol.icon}
    <div class="flex flex-wrap gap-1.5" role="group" aria-label={t('Erkannt')} data-testid="quick-chips">
      {#if symbol.icon}
        <span class="tok" data-testid="symbol-chip">
          <button type="button" class="inline-flex items-center gap-1.5" onclick={onopensymbol}>
            <SymbolIcon id={symbol.icon} size={14} />{t('Symbol: {name}', { name: symbolName(symbol.icon) })}
          </button>
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-full bg-(--count-on) text-tok-fg"
            aria-label={t('Symbol entfernen')}
            onclick={onclearsymbol}
          ><Icon name="x" size={12} stroke={2.6} /></button>
        </span>
      {/if}
      {#each parsed.tokens as tok (tok.id + ':' + tok.start)}
        {@const label = chipLabel(tok, parsed, tz)}
        {@const warn = tok.status === 'unknown' || tok.status === 'ambiguous'}
        {@const who = tok.kind === 'person' && tok.status === 'ok' ? tokenPerson(tok) : undefined}
        {@const cat = tok.kind === 'category' ? tokenCategory(tok) : undefined}
        <button
          type="button"
          class="tok {warn ? 'tok-warn' : ''} {who ? '!pl-[3px]' : ''}"
          data-testid="quick-chip"
          data-kind={tok.kind}
          data-status={tok.status}
          aria-label={t('{label}: zurücknehmen', { label })}
          title={t('Antippen nimmt es zurück')}
          onclick={() => ondrop(tok.id)}
        >
          {#if who}<Avatar person={who} size={24} />
          {:else if tok.kind === 'category'}<span class="h-[9px] w-[9px] shrink-0 rounded-full" style:background={cat ? catDot(cat.color) : 'var(--sig-orange)'}></span>
          {:else}<Icon name={tokenIcon(tok.kind)} size={14} stroke={2} />{/if}
          {label}
          <span class="flex h-6 w-6 items-center justify-center rounded-full bg-(--count-on)"><Icon name="x" size={12} stroke={2.6} /></span>
        </button>
      {/each}
    </div>
  {/if}
</div>
{#if quickProblem}<p class="rounded-xl bg-danger-bg px-3 py-2 text-[14px] text-danger" role="alert">{quickProblem}</p>{/if}
