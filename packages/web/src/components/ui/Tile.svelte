<script lang="ts" module>
  export type TileColor = 'orange' | 'purple' | 'violet' | 'blue' | 'teal' | 'green' | 'red' | 'gray';
  export type TileSize = 'sm' | 'md' | 'lg';
  export const TILE_COLORS: TileColor[] = ['orange', 'purple', 'violet', 'blue', 'teal', 'green', 'red', 'gray'];
  /** Kantenlänge in px je Größe (klein 34, normal 42, groß 52) */
  export const TILE_PX: Record<TileSize, number> = { sm: 34, md: 42, lg: 52 };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  // Farbige Kachel mit Verlauf und feinem hellem Rand; trägt ein Symbol (children). Die Farben stehen in app.css.
  let {
    color = 'orange',
    size = 'md',
    px,
    radius: round,
    children,
  }: {
    color?: TileColor;
    size?: TileSize;
    /** eine andere Kantenlänge als die drei Größen (Symbol-Fenster: 48 und 44) */
    px?: number;
    radius?: number;
    children?: Snippet;
  } = $props();
  const edge = $derived(px ?? TILE_PX[size]);
  const radius = $derived(round ?? (size === 'sm' ? 9 : size === 'lg' ? 14 : 11));
</script>

<span class="tile tile-{color}" style:width="{edge}px" style:height="{edge}px" style:border-radius="{radius}px" aria-hidden="true">
  {@render children?.()}
</span>
