<script lang="ts">
  import { cardTile } from '../lib/cardTile';
  import SymbolIcon from './SymbolIcon.svelte';
  import Tile, { type TileSize } from './ui/Tile.svelte';

  // Die Kachel einer Aufgabe: ihr Symbol auf ihrer Farbe (Standard: Aufgabe, orange). Das Funken-Abzeichen setzt der Aufrufer darüber.
  let { card, size = 'md', glyph }: { card: { icon: string | null; iconColor: string | null }; size?: TileSize; glyph?: number } = $props();
  const tile = $derived(cardTile(card));
  const px = $derived(glyph ?? (size === 'lg' ? 28 : size === 'sm' ? 20 : 24));
</script>

<Tile color={tile.color} {size}><SymbolIcon id={tile.icon} size={px} /></Tile>
