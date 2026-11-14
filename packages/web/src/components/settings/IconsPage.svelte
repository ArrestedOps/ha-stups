<script lang="ts">
  import { api } from '../../lib/api';
  import { i18n, t, tn } from '../../lib/i18n/index.svelte';
  import { act, can, toast, ui } from '../../lib/store.svelte';
  import { chunk, detectForCards } from '../../lib/symbols/bulk';
  import { loadKeywords } from '../../lib/symbols/words.svelte';
  import Group from '../Group.svelte';
  import Icon from '../Icon.svelte';
  import Page from './Page.svelte';

  /**
   * „Symbole aus Titeln erkennen“: Administratoren und Recht „settings“, nur auf Wunsch (nie automatisch). Setzt für alle Aufgaben ohne Symbol das zum
   * Titel passende; Aufgaben, die schon eins haben, bleiben. Erst kommt eine Rückfrage, am Ende steht das Ergebnis als Zahl.
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
      result = t('Alle Aufgaben haben schon ein Symbol.');
      return;
    }
    ui.confirm = {
      title: t('Symbole erkennen?'),
      text: tn(
        '{n} Aufgabe hat noch kein Symbol. Stups sucht zu ihrem Titel ein passendes. Aufgaben mit Symbol bleiben, wie sie sind; einzelne Symbole änderst du später an der Aufgabe.',
        '{n} Aufgaben haben noch kein Symbol. Stups sucht zu jedem Titel ein passendes. Aufgaben mit Symbol bleiben, wie sie sind; einzelne Symbole änderst du später an der Aufgabe.',
        cards.length,
      ),
      label: t('Erkennen'),
      run: () => run(cards),
    };
  }

  async function run(cards: { id: string; title: string }[]) {
    busy = true;
    await loadKeywords().catch(() => undefined);
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
      tn('{n} Aufgabe hat jetzt ein Symbol.', '{n} Aufgaben haben jetzt ein Symbol.', updated) +
      (found.unmatched > 0 ? ' ' + tn('Zu {n} Aufgabe passte keins.', 'Zu {n} Aufgaben passte keins.', found.unmatched) : '');
    toast(result);
  }
</script>

<Page title={t('Symbole')}>
  <Group
    title={t('Symbole aus Titeln erkennen')}
    hint={t('Neue Aufgaben bekommen ihr Symbol beim Anlegen aus dem Titel. Für Aufgaben, die es schon gibt, löst du die Erkennung hier selbst aus, einmal und nur für Aufgaben ohne Symbol. Das dürfen Administratoren und wer die Berechtigung „App-Einstellungen“ hat.')}
  >
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px] disabled:opacity-50" disabled={busy || !can('settings')} onclick={start}>
      <Icon name="spark" size={20} /><span class="flex-1">{busy ? t('Erkenne …') : t('Symbole aus Titeln erkennen')}</span>
    </button>
  </Group>
  {#if result}<p class="px-3 text-[15px] font-semibold" role="status" data-testid="icons-result">{result}</p>{/if}
</Page>
