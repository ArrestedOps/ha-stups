import type { HaState } from '../ha.js';
import { isRunning, type PhaseMemory } from '../home.js';
import { presenceOf, type PresenceMap } from '../presence.js';
import type { User } from '../store.js';
import type { Watcher } from '../watcher-data.js';
import { conditionMet } from '../watcher-types.js';
import { toSeen } from './seen.js';
import type { Seen, WatcherDeps } from './types.js';

/**
 * Was alle Teile der Wächter gemeinsam brauchen: die Mittel aus `WatcherDeps`, den Stand im Speicher (zuletzt gesehene Zustände,
 * Abos, Personen), die Warteschlange und die kleinen Hilfen darüber. Die Teile (cards, evaluate, subscriptions, …) bekommen diesen
 * Kontext und rufen einander über `Parts` auf (siehe parts.ts).
 */
export function createContext(deps: WatcherDeps) {
  const { store, data, ha, now, timeZone } = deps;
  const log = deps.log ?? { info: () => undefined, warn: () => undefined };

  /** Der Stand im Speicher; die Teile lesen und schreiben ihn über dieses eine Objekt */
  const mem = {
    /** Zuletzt gesehene Zustände beobachteter Entitäten */
    seen: new Map<string, Seen>(),
    /** Abos, die gerade angelegt sind (Schlüssel → Beschreibung des Auslösers, um Änderungen zu erkennen) */
    subscribed: new Map<string, string>(),
    persons: [] as HaState[],
    personsAt: 0,
    /** Die Zustände aus Home Assistant sind einmal geladen (Abgleich oder Speichern): erst dann gilt eine fehlende Entität als fehlend */
    statesLoaded: false,
    /** Was für „Zuhause" gemerkt wird (Beginn eines laufenden Vorgangs) */
    memory: new Map<string, PhaseMemory>(),
    /** Nächste Termine von Kalender-Wächtern (Stufe 6), je Wächter */
    nextEvents: new Map<string, { title: string; at: string }>(),
    /** Wann Kalender und Vorhersage je Wächter zuletzt abgefragt wurden */
    lastPoll: new Map<string, number>(),
  };

  // ---------- Warteschlange: eine Auswertung nach der anderen ----------

  let chain: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  }
  /** Wartet, bis alles Eingereihte abgearbeitet ist (für Tests und sauberes Beenden) */
  const idle = (): Promise<void> => chain.then(() => undefined);

  function guarded(what: string, fn: () => Promise<void> | void): Promise<void> {
    return enqueue(async () => {
      // Ausgeschaltet (Beta): alle Auswertungen, der Takt und die Heimkehr fallen weg; der Abgleich beim Einschalten holt den Stand nach
      if (deps.enabled && !deps.enabled()) return;
      try {
        await fn();
      } catch (err) {
        log.warn(`Wächter: ${what}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  // ---------- Hilfen ----------

  /** Personen, aus denen dieser Wächter wählen darf: die, die das Board seiner Aufgaben sehen (auf einem privaten Board nur der Besitzer) */
  function peopleOf(w: Pick<Watcher, 'card'>): User[] {
    const seeing = new Set(store.boardPeopleIds(w.card.boardId));
    return store.people().filter((p) => seeing.has(p.id));
  }

  const seenOf = (entityId: string): Seen | null => mem.seen.get(entityId) ?? null;

  /** Übernimmt die Zustände aus Home Assistant in den Speicher (zuletzt gesehen, Personen) */
  function absorb(states: HaState[]): Map<string, Seen> {
    const bySeen = new Map<string, Seen>();
    for (const s of states) {
      const v = toSeen(s);
      if (v) {
        bySeen.set(s.entity_id, v);
        mem.seen.set(s.entity_id, v);
      }
    }
    mem.persons = states.filter((s) => s.entity_id.startsWith('person.'));
    mem.personsAt = now().getTime();
    return bySeen;
  }

  async function personStates(maxAgeMs = 15_000): Promise<HaState[]> {
    if (now().getTime() - mem.personsAt < maxAgeMs && mem.persons.length > 0) return mem.persons;
    absorb(await ha.getStates());
    return mem.persons;
  }

  /** Wer ist zu Hause? Zuordnung über den Benutzer der HA-Person, sonst über den Namen */
  async function presence(): Promise<PresenceMap> {
    return presenceOf(store.people(), await personStates());
  }

  // ---------- Zuhause: läuft gerade? ----------

  const memoryOf = (id: string): PhaseMemory => {
    let m = mem.memory.get(id);
    if (!m) mem.memory.set(id, (m = { runningSince: null, touched: false }));
    return m;
  };

  /** Merkt sich bei jeder Beobachtung, ob der Vorgang läuft und seit wann */
  function remember(w: Watcher, s: Seen | null, lastFireAt: string | null): void {
    const m = memoryOf(w.id);
    if (s && w.trigger.kind === 'above' && conditionMet(w.trigger, s.state)) m.touched = true;
    const running = isRunning(w.trigger, s, lastFireAt, m.touched);
    // Ein Beginn gilt nur, wenn Stups ihn erlebt hat (vorher war es ruhig); beim Start mitten im Vorgang bleibt er unbekannt
    if (running && !m.runningSince && m.sawQuiet) m.runningSince = now().toISOString();
    else if (!running) {
      m.runningSince = null;
      m.sawQuiet = true;
    }
  }

  // ---------- Zähler ----------

  /** Aktueller Zählerstand; wurde seit dem Zählen eine Aufgabe des Wächters erledigt, beginnt er von vorn */
  function counterOf(id: string): number {
    const st = data.getState(id);
    if (st.counter > 0 && st.counterSince && store.watcherCardCompletedSince(id, st.counterSince)) {
      data.patchState(id, { counter: 0, counterSince: null });
      return 0;
    }
    return st.counter;
  }

  return { deps, store, data, ha, now, timeZone, log, mem, enqueue, idle, guarded, peopleOf, seenOf, absorb, personStates, presence, memoryOf, remember, counterOf };
}

export type Ctx = ReturnType<typeof createContext>;
