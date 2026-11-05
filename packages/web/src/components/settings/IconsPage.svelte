<script lang="ts">
  import { api } from '../../lib/api';
  import { i18n, t, tn } from '../../lib/i18n/index.svelte';
  import { act, toast, ui } from '../../lib/store.svelte';
  import { chunk, detectForCards } from '../../lib/symbols/bulk';
  import Group from '../Group.svelte';
  import Icon from '../Icon.svelte';
  import Page from './Page.svelte';

  /**
   * „Symbole aus Titeln erkennen“: nur Administratoren, nur auf Wunsch (nie automatisch). Setzt für alle Karten ohne Symbol das zum
   * Titel passende; Karten, die schon eins haben, bleiben. Erst kommt eine Rückfrage, am Ende steht das Ergebnis als Zahl.
   */
  let busy = $state(false);
  let result = $state('');

  async function start() {
    if (busy) return;
    result = '';
    busy = true;
    const cards = await act(() => api.iconCandidates());
    busy = false;
    if (!cards) return;
    if (cards.length === 0) {
      result = t('Alle Karten haben schon ein Symbol.');
      return;
    }
    ui.confirm = {
      title: t('Symbole erkennen?'),
      text: tn(
        '{n} Karte hat noch kein Symbol. Stups sucht zu ihrem Titel ein passendes. Karten mit Symbol bleiben, wie sie sind; einzelne Symbole änderst du später an der Karte.',
        '{n} Karten haben noch kein Symbol. Stups sucht zu jedem Titel ein passendes. Karten mit Symbol bleiben, wie sie sind; einzelne Symbole änderst du später an der Karte.',
        cards.length,
      ),
      label: t('Erkennen'),
      run: () => run(cards),
    };
  }

  async function run(cards: { id: string; title: string }[]) {
    busy = true;
    const found = detectForCards(cards, i18n.lang);
    let updated = 0;
    for (const part of chunk(found.items, 500)) {
      const r = await act(() => api.applyIcons(part));
      if (!r) {
        busy = false;
        return;
      }
      updated += r.updated;
    }
    busy = false;
    result =
      tn('{n} Karte hat jetzt ein Symbol.', '{n} Karten haben jetzt ein Symbol.', updated) +
      (found.unmatched > 0 ? ' ' + tn('Zu {n} Karte passte keins.', 'Zu {n} Karten passte keins.', found.unmatched) : '');
    toast(result);
  }
</script>

<Page title={t('Symbole')}>
  <Group
    title={t('Symbole aus Titeln erkennen')}
    hint={t('Neue Karten bekommen ihr Symbol beim Anlegen aus dem Titel. Für Karten, die es schon gibt, löst du die Erkennung hier selbst aus, einmal und nur für Karten ohne Symbol. Nur Administratoren.')}
  >
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px] disabled:opacity-50" disabled={busy || !ui.isAdmin} onclick={start}>
      <Icon name="spark" size={20} /><span class="flex-1">{busy ? t('Erkenne …') : t('Symbole aus Titeln erkennen')}</span>
    </button>
  </Group>
  {#if result}<p class="px-3 text-[15px] font-semibold" role="status" data-testid="icons-result">{result}</p>{/if}
</Page>
