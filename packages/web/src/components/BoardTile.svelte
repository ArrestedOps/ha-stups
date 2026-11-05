<script lang="ts">
  import { boardColorKey } from '../lib/schedule';
  import { tileColorOf } from '../lib/cardTile';
  import { symbolById } from '../lib/symbols/library';
  import { ui } from '../lib/store.svelte';
  import Icon from './Icon.svelte';
  import SymbolIcon from './SymbolIcon.svelte';
  import Tile, { type TileSize } from './ui/Tile.svelte';

  /** Die Kachel eines Boards: sein Symbol (sonst Spalten) in seiner Farbe (sonst reihum, wie im Kalender) */
  let { board, size = 'md' }: { board: { id: string; icon: string | null; color: string | null }; size?: TileSize } = $props();
  const color = $derived(tileColorOf(boardColorKey(board.color, ui.boards.findIndex((b) => b.id === board.id))));
  const px = $derived(size === 'sm' ? 18 : size === 'lg' ? 26 : 22);
</script>

<Tile {color} {size}>
  {#if symbolById(board.icon)}<SymbolIcon id={board.icon} size={px} />{:else}<Icon name="kanban" size={px} stroke={1.8} />{/if}
</Tile>
