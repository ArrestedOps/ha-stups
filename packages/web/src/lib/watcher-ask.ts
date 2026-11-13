import { t } from './i18n/index.svelte';
import type { ConfirmRequest } from './store.svelte';
import type { MetNow } from './watcher-types';

/** Die Meldung des Servers nach dem Speichern, falls sie vollständig ist (sonst gibt es nichts zu fragen) */
export function metNowOf(res: { metNow?: MetNow | null }): MetNow | null {
  const m = res.metNow;
  if (!m || m.reason !== 'already_met' || !m.entityName || !m.stateText) return null;
  return m;
}

/**
 * Die Rückfrage nach dem Speichern, wenn die Bedingung schon erfüllt ist und der Wächter deshalb nicht von selbst auslöst
 * („Tür ist gerade aus … Soll jetzt eine Aufgabe erstellt werden?“). `run` legt die Aufgabe an („Ja“); „Nein“ schließt nur.
 */
export function askCard(m: MetNow, cardTitle: string, run: ConfirmRequest['run']): ConfirmRequest {
  return {
    title: t('Aufgabe jetzt erstellen?'),
    text: t('{name} ist gerade {state} – die Bedingung ist also schon erfüllt. Soll jetzt eine Aufgabe „{title}“ erstellt werden?', { name: m.entityName, state: m.stateText, title: cardTitle }),
    label: t('Ja, Aufgabe erstellen'),
    cancelLabel: t('Nein, erst beim nächsten Mal'),
    tone: 'primary',
    run,
  };
}
