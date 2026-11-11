import { conditionMet } from '../watcher-types.js';
import type { Ctx } from './context.js';
import { POLL_MS, POLL_RETRY_MS } from './external.js';
import type { Parts } from './parts.js';
import { minutes } from './schedule.js';
import type { CalendarEvents, ForecastItems } from './types.js';

/** Der Takt (alle 30 Sekunden) und der Start */
export function createTick(ctx: Ctx, calls: () => Parts) {
  const { deps, data, ha, now, log, mem, guarded, seenOf } = ctx;

  /** Takt: Wartezeiten abwarten, Rückfall nach 24 Stunden. Ein Fehler bei einem Wächter hält die anderen nicht auf. */
  async function tick(): Promise<void> {
    if (deps.enabled && !deps.enabled()) return;
    calls().ensureStates();
    const nowMs = now().getTime();
    const fetched = await calls().fetchExternal(nowMs); // Netz: außerhalb der Warteschlange
    await guarded('Takt', async () => {
      const each = async (what: string, fn: () => Promise<void> | void): Promise<void> => {
        try {
          await fn();
        } catch (err) {
          log.warn(`Wächter: ${what}: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      for (const { w, result } of fetched) {
        if (result.status === 'rejected') {
          mem.lastPoll.set(w.id, nowMs - POLL_MS + POLL_RETRY_MS);
          log.warn(`Wächter „${w.name}": Abfrage von ${w.trigger.entityId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
          continue;
        }
        if (result.value === null) continue;
        await each(`Abfrage „${w.name}"`, async () => {
          try {
            if (w.trigger.kind === 'calendar_event') await calls().applyCalendar(w, nowMs, result.value as CalendarEvents);
            else await calls().applyForecast(w, nowMs, result.value as ForecastItems);
          } catch (err) {
            mem.lastPoll.set(w.id, nowMs - POLL_MS + POLL_RETRY_MS);
            throw err;
          }
        });
      }
      for (const w of data.list()) {
        if (!w.active) continue;
        await each(`Takt „${w.name}"`, async () => {
          const st = data.getState(w.id);
          if (!st.armed || !st.metSince) return;
          const s = seenOf(w.trigger.entityId);
          if (!s || !conditionMet(w.trigger, s.state)) return;
          if (nowMs - Date.parse(st.metSince) >= minutes(w.trigger.forMin)) await calls().fire(w);
        });
      }
      await each('Warten', () => calls().checkWaiting(nowMs));
      await each('Vorschläge', () => calls().checkSuggestions(nowMs));
    });
  }

  function start(): void {
    ha.onConnected(() => void calls().snapshot());
    calls().syncSubscriptions();
  }

  return { tick, start };
}
