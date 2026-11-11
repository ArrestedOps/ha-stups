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
let running: AbortController | null = null;

/**
 * Lädt alles neu (die letzte Anfrage gewinnt). Eine überholte Runde wird abgebrochen: Sie überträgt nichts mehr zu Ende, und ihr Abbruch
 * zählt nicht als Fehler, denn eine neuere Runde ist schon unterwegs.
 */
export async function loadAgenda(): Promise<void> {
  const mine = ++request;
  running?.abort();
  const { signal } = (running = new AbortController());
  const to = new Date(Date.now() + HORIZON_DAYS * DAY).toISOString();
  try {
    const [td, o, d, u] = await Promise.all([
      api.today(signal),
      api.schedule({ to }, signal),
      // zuletzt Erledigtes (für „erledigt heute" und auf Wunsch die Gruppe Erledigt): nach dem Datum der Erledigung gefragt,
      // nicht nach der Fälligkeit (sonst fehlten Karten, die vor Wochen fällig oder ohne Termin waren)
      api.schedule({ completedSince: new Date(Date.now() - 7 * DAY).toISOString() }, signal),
      api.schedule({ undated: true }, signal),
    ]);
    if (mine !== request) return;
    agenda.today = td;
    agenda.open = o;
    agenda.undated = u;
    agenda.recentDone = d;
    agenda.failed = false;
    agenda.loaded = true;
  } catch {
    if (mine === request) agenda.failed = true;
  }
}
