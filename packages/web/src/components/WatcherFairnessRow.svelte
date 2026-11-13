<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import type { WatcherEditor } from '../lib/watcher-editor.svelte';
  import Icon from './Icon.svelte';
  import ListRow from './ui/ListRow.svelte';
  import Tile from './ui/Tile.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * „Zählt zur Fairness": gehören die Aufgaben dieses Wächters in die Auswertung der Woche? Zählt das Board nicht mit (oder ist es privat),
   * ist der Schalter grau, aus und gesperrt, die Zeile sagt „Board zählt nicht mit: nicht möglich". Der gespeicherte Wert bleibt dabei erhalten
   * (zählt das Board später wieder, gilt er wieder). Am Desktop als breite Aufgabe mit ausführlicherem Satz (`wide`).
   */
  let { ed, wide = false, readOnly = false }: { ed: WatcherEditor; wide?: boolean; readOnly?: boolean } = $props();

  const locked = $derived(!ed.boardCounts);
  const name = $derived(ed.board?.name ?? '');
  const note = $derived(
    locked
      ? t('Board zählt nicht mit: nicht möglich')
      : wide
        ? t('Board {name} zählt mit. Ist das Board von der Fairness ausgenommen, ist dieser Schalter grau und aus.', { name })
        : t('Board {name} zählt mit', { name }),
  );
</script>

<div data-testid="fairness-row" data-locked={locked ? '' : undefined}>
  <ListRow wrap title={t('Zählt zur Fairness')} dim={locked}>
    {#snippet tile()}<Tile color="green"><Icon name="columns" size={22} stroke={1.8} /></Tile>{/snippet}
    {#snippet meta()}<span class="wrap-anywhere" data-testid="fairness-meta">{note}</span>{/snippet}
    {#snippet right()}
      <Toggle label={t('Zählt zur Fairness')} checked={locked ? false : ed.counts} disabled={locked || readOnly} onchange={(v) => (ed.form.countsForFairness = v)} />
    {/snippet}
  </ListRow>
</div>
