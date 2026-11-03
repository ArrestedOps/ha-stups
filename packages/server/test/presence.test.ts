import { describe, expect, it } from 'vitest';
import type { HaState } from '../src/ha.js';
import { createPresence, personOfEntity, presenceOf, type PresencePerson } from '../src/presence.js';

const state = (entity_id: string, s: string, attributes: Record<string, unknown> = {}): HaState => ({ entity_id, state: s, attributes }) as HaState;

const ben: PresencePerson = { id: 'u-ben', name: 'ben', displayName: 'Ben', haUserId: 'ha-ben' };
const anna: PresencePerson = { id: 'u-anna', name: 'anna', displayName: 'Anna K.', haUserId: null };
const kind: PresencePerson = { id: 'u-kind', name: 'mia', displayName: 'Mia', haUserId: null };

describe('Zuordnung der Personen zu Home Assistant', () => {
  it('über den Benutzer der HA-Person, sonst über Name oder Anzeigename (ohne Groß/Klein)', () => {
    const states = [
      state('person.ben_x', 'home', { user_id: 'ha-ben', friendly_name: 'Irgendwer' }),
      state('person.anna', 'not_home', { friendly_name: 'anna k.' }),
      state('sensor.nichts', 'on'),
    ];
    const { entityOf, home } = presenceOf([ben, anna, kind], states);
    expect(entityOf.get('u-ben')).toBe('person.ben_x');
    expect(entityOf.get('u-anna')).toBe('person.anna');
    expect(entityOf.has('u-kind')).toBe(false); // keine passende Person in Home Assistant
    expect([...home]).toEqual(['u-ben']);
  });

  it('personOfEntity: von der Entität zurück zur Stups-Person', () => {
    const entity = state('person.mia', 'home', { friendly_name: ' MIA ' });
    expect(personOfEntity(entity, [ben, anna, kind])?.id).toBe('u-kind');
    expect(personOfEntity(state('person.x', 'home', { user_id: 'ha-ben' }), [ben, anna, kind])?.id).toBe('u-ben');
    expect(personOfEntity(state('person.x', 'home', { friendly_name: 'Fremd' }), [ben, anna, kind])).toBeUndefined();
    expect(personOfEntity(undefined, [ben])).toBeUndefined();
  });
});

describe('createPresence.homeOf', () => {
  const make = (states: HaState[], opts: { people?: PresencePerson[] } = {}) => {
    let t = 1_000_000;
    let calls = 0;
    const presence = createPresence({
      ha: { getStates: async () => (calls++, states) },
      people: () => opts.people ?? [ben, anna, kind],
      now: () => new Date(t),
      maxAgeMs: 15_000,
    });
    return { presence, calls: () => calls, advance: (ms: number) => (t += ms) };
  };

  it('home, away und unknown (keine passende HA-Person)', async () => {
    const { presence } = make([state('person.ben', 'home', { user_id: 'ha-ben' }), state('person.anna', 'not_home', { friendly_name: 'Anna K.' })]);
    expect(await presence.homeOf('u-ben')).toBe('home');
    expect(await presence.homeOf('u-anna')).toBe('away');
    expect(await presence.homeOf('u-kind')).toBe('unknown');
    expect(await presence.homeOf('gibt-es-nicht')).toBe('unknown');
  });

  it('fragt Home Assistant nicht bei jedem Aufruf, aber nach Ablauf der Frist wieder', async () => {
    const m = make([state('person.ben', 'home', { user_id: 'ha-ben' })]);
    await m.presence.homeOf('u-ben');
    await m.presence.homeOf('u-ben');
    expect(m.calls()).toBe(1);
    m.advance(16_000);
    await m.presence.homeOf('u-ben');
    expect(m.calls()).toBe(2);
    await m.presence.homeOf('u-ben', { fresh: true }); // frisch erzwingen (Heimkehr)
    expect(m.calls()).toBe(3);
  });

  it('ist Home Assistant nicht erreichbar, ist es unknown und kein Fehler', async () => {
    const presence = createPresence({
      ha: {
        getStates: async () => {
          throw new Error('offline');
        },
      },
      people: () => [ben],
      now: () => new Date(),
    });
    expect(await presence.homeOf('u-ben')).toBe('unknown');
  });

  it('personEntityIds liefert die Entitäten der zugeordneten Personen (für das Abonnement auf die Heimkehr)', async () => {
    const { presence } = make([state('person.ben', 'home', { user_id: 'ha-ben' }), state('person.fremd', 'home')]);
    expect(await presence.personEntityIds()).toEqual(['person.ben']);
  });
});
