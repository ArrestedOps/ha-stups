import { api, type Today } from './api';
import { mayConfirm } from './confirm';
import { t } from './i18n/index.svelte';
import { inboxItems, type InboxItem } from './inbox';
import type { ScheduleCard } from './schedule';
import { ui } from './store.svelte';

const DAY = 86_400_000;
/** so weit schaut die Liste voraus (Karten ohne Termin kommen in der Liste nicht vor, sie stehen in den Boards) */
export const HORIZON_DAYS = 365 * 5;

/**
 * Die Daten hinter „Aufgaben" und hinter der Glocke oben (Mitteilungen): heute (Vom Haus, Bei den anderen), offene Karten mit Termin und
 * zuletzt Erledigtes. Sie gehören dem Store, weil die Kopfzeile aller Reiter den Punkt an der Glocke daraus ableitet.
 */
export const agenda = $state({
  today: null as Today | null,
  open: [] as ScheduleCard[],
  recentDone: [] as ScheduleCard[],
  failed: false,
  loaded: false,
});

let request = 0;

/** Lädt alles neu (die letzte Anfrage gewinnt) */
export async function loadAgenda(): Promise<void> {
  const mine = ++request;
  const to = new Date(Date.now() + HORIZON_DAYS * DAY).toISOString();
  try {
    const [td, o, d] = await Promise.all([
      api.today(),
      api.schedule({ to }),
      // zuletzt Erledigtes (für „erledigt heute" und auf Wunsch die Gruppe Erledigt)
      api.schedule({ from: new Date(Date.now() - 14 * DAY).toISOString(), to, done: true }),
    ]);
    if (mine !== request) return;
    agenda.today = td;
    agenda.open = o;
    const weekAgo = Date.now() - 7 * DAY;
    agenda.recentDone = d.filter((c) => c.completedAt && Date.parse(c.completedAt) >= weekAgo);
    agenda.failed = false;
    agenda.loaded = true;
  } catch {
    if (mine === request) agenda.failed = true;
  }
}

/** Was gerade für die eingeloggte Person offen ist (Glocke und Mitteilungen): aus denselben Daten wie „Aufgaben", ohne eigenen Server-Weg */
export function currentInbox(): InboxItem[] {
  return inboxItems({
    open: agenda.open,
    house: agenda.today?.house ?? [],
    meId: ui.me?.id ?? null,
    isChild: ui.isChild,
    mayConfirm: (childId) =>
      mayConfirm(ui.me, ui.isAdmin, ui.people.find((p) => p.id === childId)),
    nameOf: (id) => ui.people.find((p) => p.id === id)?.displayName ?? t('Jemand'),
  });
}
