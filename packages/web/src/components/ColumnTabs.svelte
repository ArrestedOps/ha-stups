<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { countByColumn, filterCards } from '../lib/filters';
  import { selectColumn, ui } from '../lib/store.svelte';
  import Segmented from './ui/Segmented.svelte';

  const columns = $derived(ui.view?.columns ?? []);
  const counts = $derived(
    countByColumn(
      filterCards(ui.view?.cards ?? [], ui.filter, ui.me?.id ?? null),
      columns.map((c) => c.id),
    ),
  );
  const items = $derived(columns.map((c) => ({ id: c.id, label: `${c.name} · ${counts[c.id] ?? 0}` })));
</script>

<!-- bis vier Spalten stehen gleich breit nebeneinander (wie im Mockup), bei mehr wischt die Leiste seitlich -->
<Segmented {items} value={ui.columnId} label={t('Spalten')} kind="tabs" scroll={items.length > 4} onchange={selectColumn} />
