import type { Watcher } from '../watcher-data.js';
import type { Ctx } from './context.js';
import type { Parts } from './parts.js';
import { eventMs, minutes } from './schedule.js';
import type { CalendarEvents, ForecastItems } from './types.js';

/** Kalender und Vorhersage werden höchstens so oft abgefragt */
export const POLL_MS = 30 * 60_000;
/** Nach einem Fehlversuch geht es nach so langer Zeit weiter */
export const POLL_RETRY_MS = 5 * 60_000;

/** Regnet es in der Vorhersage? Condition „rainy" und Verwandte, oder eine Wahrscheinlichkeit ab 50 %, oder spürbarer Niederschlag */
const RAINY = new Set(['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy', 'hail']);

/** Kalender und Vorhersage: im Takt abgefragt (nicht über Zustandswechsel), die Antworten ausgewertet */
export function createExternal(ctx: Ctx, calls: () => Parts) {
  const { deps, store, data, ha, timeZone, mem } = ctx;

  /** Nur die Abfrage (Netz), ohne Zugriff auf die Warteschlange: ein langsames Home Assistant hält nichts anderes auf */
  const fetchCalendar = (w: Watcher, nowMs: number): Promise<CalendarEvents> | null =>
    ha.getCalendarEvents ? ha.getCalendarEvents(w.trigger.entityId, new Date(nowMs).toISOString(), new Date(nowMs + 7 * 86_400_000).toISOString()) : null;

  async function applyCalendar(w: Watcher, nowMs: number, events: CalendarEvents): Promise<void> {
    const lead = minutes(w.trigger.leadMin ?? 720);
    const upcoming = events
      .map((e) => ({ ...e, startMs: eventMs(e.start, timeZone()), endMs: eventMs(e.end, timeZone()) }))
      .filter((e) => Number.isFinite(e.startMs) && Number.isFinite(e.endMs) && e.endMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);
    let next: { title: string; at: string } | null = null;
    for (const e of upcoming) {
      // Der Schlüssel ist die Kennung des Termins (nicht Titel oder Beginn: wer sie ändert, bekäme sonst eine zweite Karte).
      // Ohne Kennung (und für Karten aus früheren Versionen) gilt der alte Schlüssel aus Beginn und Titel.
      const legacyKey = `cal:${w.id}:${new Date(e.startMs).toISOString()}:${e.title}`;
      const key = e.uid ? `cal:${w.id}:uid:${e.uid}${e.recurrenceId ? `:${e.recurrenceId}` : ''}` : legacyKey;
      if (store.hasCardWithDedupeKey(key) || store.hasCardWithDedupeKey(legacyKey)) continue; // dieser Termin hat seine Karte schon (auch erledigt oder im Papierkorb)
      if (e.startMs - lead <= nowMs) {
        data.patchState(w.id, { lastFireAt: new Date(nowMs).toISOString() });
        await calls().createCard(w, nowMs, false, key);
      } else if (!next) {
        next = { title: e.title, at: new Date(e.startMs).toISOString() };
      }
    }
    if (next) mem.nextEvents.set(w.id, next);
    else mem.nextEvents.delete(w.id);
  }

  const fetchForecast = (w: Watcher): Promise<ForecastItems> | null => (ha.getForecast ? ha.getForecast(w.trigger.entityId) : null);

  async function applyForecast(w: Watcher, nowMs: number, items: ForecastItems): Promise<void> {
    const hours = w.trigger.forecast?.hours ?? 3;
    const wet = items.some((i) => {
      const at = Date.parse(i.datetime);
      if (!Number.isFinite(at) || at < nowMs - 30 * 60_000 || at > nowMs + hours * 3_600_000) return false;
      return (typeof i.condition === 'string' && RAINY.has(i.condition)) || (i.precipitation_probability ?? 0) >= 50 || (i.precipitation ?? 0) >= 0.3;
    });
    // wie bei Zuständen: erst wieder scharf, wenn es einmal trocken war; Sperrzeit und Doppelkarten-Regel gelten wie sonst
    const st = data.getState(w.id);
    if (!wet) {
      if (!st.armed || st.metSince) data.patchState(w.id, { armed: true, metSince: null });
      return;
    }
    if (!st.metSince) data.patchState(w.id, { metSince: new Date(nowMs).toISOString() });
    if (st.armed) await calls().fire(w);
  }

  /** Zeitlimit für eine Abfrage von Kalender oder Vorhersage */
  const pollTimeoutMs = deps.pollTimeoutMs ?? 20_000;

  function withTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Zeitüberschreitung')), pollTimeoutMs);
    });
    return Promise.race([p, limit]).finally(() => clearTimeout(timer));
  }

  /**
   * Fragt Kalender und Vorhersage ab, höchstens alle 30 Minuten je Wächter; nach einem Fehler nach 5 Minuten wieder.
   * Die Abfragen laufen parallel und außerhalb der Warteschlange (mit Zeitlimit); nur das Auswerten der Antworten geht durch sie.
   */
  async function fetchExternal(nowMs: number): Promise<{ w: Watcher; result: PromiseSettledResult<CalendarEvents | ForecastItems | null> }[]> {
    const due = data.list().filter((w) => {
      const kind = w.trigger.kind;
      if (!w.active || (kind !== 'calendar_event' && kind !== 'forecast')) return false;
      if (nowMs - (mem.lastPoll.get(w.id) ?? -Infinity) < POLL_MS) return false;
      mem.lastPoll.set(w.id, nowMs);
      return true;
    });
    const results = await Promise.allSettled(
      due.map(async (w) => {
        const pending: Promise<CalendarEvents | ForecastItems> | null = w.trigger.kind === 'calendar_event' ? fetchCalendar(w, nowMs) : fetchForecast(w);
        return pending ? await withTimeout(pending) : null;
      }),
    );
    return due.map((w, i) => ({ w, result: results[i]! }));
  }

  return { fetchExternal, applyCalendar, applyForecast };
}
