import { api, type Today } from './api';
import type { ScheduleCard } from './schedule';

const DAY = 86_400_000;
/** so weit schaut die Liste voraus (Karten ohne Termin kommen in der Liste nicht vor, sie stehen in den Boards) */
export const HORIZON_DAYS = 365 * 5;

/**
 * Die Daten hinter „Aufgaben": heute (Vom Haus, Bei den anderen), offene Karten mit Termin und
 * zuletzt Erledigtes.
 */
export const agenda = $state({
  today: null as Today | null,
  open: [] as ScheduleCard[],
  recentDone: [] as ScheduleCard[],
  /** offene Karten ohne Termin: kommen nur mit dem Filter „Ohne Termin" in die Liste */
  undated: [] as ScheduleCard[],
  failed: false,
  loaded: false,
});

let request = 0;

/** Lädt alles neu (die letzte Anfrage gewinnt) */
export async function loadAgenda(): Promise<void> {
  const mine = ++request;
  const to = new Date(Date.now() + HORIZON_DAYS * DAY).toISOString();
  try {
    const [td, o, d, u] = await Promise.all([
      api.today(),
      api.schedule({ to }),
      // zuletzt Erledigtes (für „erledigt heute" und auf Wunsch die Gruppe Erledigt)
      api.schedule({ from: new Date(Date.now() - 14 * DAY).toISOString(), to, done: true }),
      api.schedule({ undated: true }),
    ]);
    if (mine !== request) return;
    agenda.today = td;
    agenda.open = o;
    agenda.undated = u;
    const weekAgo = Date.now() - 7 * DAY;
    agenda.recentDone = d.filter((c) => c.completedAt && Date.parse(c.completedAt) >= weekAgo);
    agenda.failed = false;
    agenda.loaded = true;
  } catch {
    if (mine === request) agenda.failed = true;
  }
}
