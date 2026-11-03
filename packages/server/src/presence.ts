import type { HaState } from './ha.js';

/**
 * Wer ist zu Hause? Die Stups-Person wird der Person in Home Assistant (`person.*`) zugeordnet: über den Benutzer der HA-Person
 * (`user_id`), sonst über Namen oder Anzeigenamen. Gemeinsam für die Wächter („wer ist zu Hause") und die Haus-Kanäle.
 */
export interface PresencePerson {
  id: string;
  name: string;
  displayName: string;
  haUserId: string | null;
}

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase();

/** Die HA-Person zu einer Stups-Person, soweit zuzuordnen */
export function personEntity(person: PresencePerson, states: HaState[]): HaState | undefined {
  const names = [person.name, person.displayName].map(norm);
  return (
    (person.haUserId ? states.find((s) => s.attributes?.user_id === person.haUserId) : undefined) ??
    states.find((s) => names.includes(norm(s.attributes?.friendly_name)))
  );
}

/** Die Stups-Person zu einer HA-Person (für die Heimkehr: das Ereignis nennt nur die Entität) */
export function personOfEntity<P extends PresencePerson>(entity: HaState | undefined, people: P[]): P | undefined {
  if (!entity) return undefined;
  return people.find((p) => {
    const names = [p.name, p.displayName].map(norm);
    return (!!p.haUserId && entity.attributes?.user_id === p.haUserId) || names.includes(norm(entity.attributes?.friendly_name));
  });
}

export interface PresenceMap {
  /** Home-Assistant-Entität je Person, soweit zuzuordnen */
  entityOf: Map<string, string>;
  /** Wer zu Hause ist (nur zugeordnete Personen) */
  home: Set<string>;
}

export function presenceOf(people: PresencePerson[], states: HaState[]): PresenceMap {
  const entityOf = new Map<string, string>();
  const home = new Set<string>();
  for (const p of people) {
    const match = personEntity(p, states);
    if (!match) continue;
    entityOf.set(p.id, match.entity_id);
    if (match.state === 'home') home.add(p.id);
  }
  return { entityOf, home };
}

export type HomeState = 'home' | 'away' | 'unknown';

export interface PresenceDeps {
  ha: { getStates(): Promise<HaState[]> };
  people: () => PresencePerson[];
  now: () => Date;
  /** Wie lange ein Abruf als frisch gilt (Vorgabe 15 Sekunden) */
  maxAgeMs?: number;
}

/** Anwesenheit mit kurzem Zwischenspeicher: nicht bei jeder Nachricht ganz Home Assistant fragen */
export function createPresence(deps: PresenceDeps) {
  const maxAge = deps.maxAgeMs ?? 15_000;
  let cached: HaState[] = [];
  let cachedAt = 0;

  async function persons(fresh: boolean): Promise<HaState[] | null> {
    if (!fresh && cached.length > 0 && deps.now().getTime() - cachedAt < maxAge) return cached;
    try {
      const states = await deps.ha.getStates();
      cached = states.filter((s) => s.entity_id.startsWith('person.'));
      cachedAt = deps.now().getTime();
      return cached;
    } catch {
      return null; // Home Assistant nicht erreichbar: unbekannt, kein Fehler
    }
  }

  return {
    /** `unknown`: keine passende HA-Person oder Home Assistant nicht erreichbar */
    async homeOf(userId: string, opts: { fresh?: boolean } = {}): Promise<HomeState> {
      const states = await persons(opts.fresh === true);
      const person = deps.people().find((p) => p.id === userId);
      if (!states || !person) return 'unknown';
      const match = personEntity(person, states);
      if (!match) return 'unknown';
      return match.state === 'home' ? 'home' : 'away';
    },
    /** Die Entitäten der Stups-Personen, die sich zuordnen lassen (für das Abonnement auf die Heimkehr) */
    async personEntityIds(): Promise<string[]> {
      const states = await persons(true);
      if (!states) return [];
      return [...presenceOf(deps.people(), states).entityOf.values()].sort();
    },
  };
}
