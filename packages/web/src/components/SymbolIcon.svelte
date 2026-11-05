<script lang="ts">
  import { symbolPath } from '../lib/symbols/library';

  // Symbol aus der Bibliothek (mdi, gefüllt): reine Zierde, der Titel trägt die Bedeutung. Unbekannte Namen zeigen das Standardsymbol.
  let { id, size = 24 }: { id: string | null | undefined; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={symbolPath(id)} /></svg>
