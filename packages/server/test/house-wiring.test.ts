import { beforeEach, describe, expect, it } from 'vitest';
import { createBetaGate } from '../src/beta-gate.js';
import { openDb } from '../src/db.js';
import { createHousePush, createHouseSubscription } from '../src/house.js';
import { combinePush, type PushMessage } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

const TZ = 'Europe/Berlin';

let store: Store;
let ben: string;
let spoken: string[];
let where: 'home' | 'away' | 'unknown';
const drivers = {
  speak: async (_c: unknown, text: string) => void spoken.push(text),
  light: async () => undefined,
};
const presence = { homeOf: async () => where };
const now = () => new Date('2026-11-03T12:00:00Z'); // 13:00 Berlin

const nudge: PushMessage = { title: 'T', body: 'B', tag: 'x', kind: 'nudge', spoken: 'Ben, Anna stupst dich.' };

beforeEach(() => {
  store = createStore(openDb(':memory:'), { now, timeZone: () => TZ });
  ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  spoken = [];
  where = 'home';
  store.setHouseTts('tts.piper');
});

describe('Beta-Schalter und Haus-Weg', () => {
  const setup = (betaOn: boolean) => {
    const settings = new Map<string, string>();
    const gate = createBetaGate({
      enabled: betaOn,
      settings: { get: (k) => settings.get(k) ?? null, put: (k, v) => void (v === null ? settings.delete(k) : settings.set(k, v)) },
      people: () => store.people().map((p) => p.id),
    });
    const house = createHousePush({ store, drivers, presence, now, timeZone: () => TZ, allowed: (id) => gate.pushAllowed(id) });
    const push = gate.gatePush(combinePush([house]));
    return { gate, house, push };
  };

  beforeEach(() => {
    store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben' });
  });

  it('in der Beta bleibt es im Haus still, solange Push aus ist; nach dem Einschalten kommt es an', async () => {
    const { gate, push } = setup(true);
    expect(push.canReach(ben, 'nudge')).toBe(false);
    expect(await push.send(ben, nudge)).toBe(false);
    expect(spoken).toEqual([]);

    gate.set({ push: { mode: 'all' } });
    expect(push.canReach(ben, 'nudge')).toBe(true);
    expect(await push.send(ben, nudge)).toBe(true);
    expect(spoken).toEqual(['Ben, Anna stupst dich.']);
  });

  it('„nur für eine Person" gilt auch im Haus', async () => {
    const { gate, push } = setup(true);
    const anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
    store.addHouseChannel(anna, { type: 'speak', entityId: 'media_player.anna' });
    gate.set({ push: { mode: 'only', personId: anna } });
    expect(await push.send(ben, nudge)).toBe(false);
    expect(await push.send(anna, nudge)).toBe(true);
    expect(spoken).toHaveLength(1);
  });

  it('die normale App lässt alles durch', async () => {
    const { push } = setup(false);
    expect(await push.send(ben, nudge)).toBe(true);
    expect(spoken).toHaveLength(1);
  });

  it('wird Push in der Beta ausgeschaltet, liefert auch die Warteschlange nichts mehr aus (sie bleibt, bis es wieder erlaubt ist)', async () => {
    const { gate, house, push } = setup(true);
    const c = store.houseChannels()[0]!;
    store.updateHouseChannel(c.id, { whenAway: 'wait' });
    gate.set({ push: { mode: 'all' } });
    where = 'away';
    await push.send(ben, nudge);
    expect(store.housePendingOf(ben)).toHaveLength(1);

    gate.set({ push: { mode: 'off' } });
    where = 'home';
    await house.arrival(ben);
    await house.tick();
    expect(spoken).toEqual([]);
    expect(store.housePendingOf(ben)).toHaveLength(1);

    gate.set({ push: { mode: 'all' } });
    await house.tick();
    expect(spoken).toEqual(['Ben, Anna stupst dich.']);
    expect(store.housePendingOf(ben)).toEqual([]);
  });
});

describe('Abonnement auf die Heimkehr', () => {
  interface Sub {
    key: string;
    payload: any;
    onEvent: (ev: any) => void;
  }
  let subs: Sub[];
  let unsubs: string[];
  let arrivals: string[];
  let owners: Map<string, string>;

  const make = () =>
    createHouseSubscription({
      ha: {
        subscribe: (key, payload, onEvent) => {
          subs.push({ key, payload, onEvent });
          return () => undefined;
        },
        unsubscribe: (key) => void unsubs.push(key),
      },
      presence: { entityOwners: async () => owners },
      store,
      house: { arrival: async (id) => void arrivals.push(id) },
    });

  beforeEach(() => {
    subs = [];
    unsubs = [];
    arrivals = [];
    owners = new Map([['person.ben', ben], ['person.anna', 'u-anna']]);
  });

  it('ohne wartende Kanäle wird nichts abonniert', async () => {
    store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', whenAway: 'skip' });
    await make().sync();
    expect(subs).toEqual([]);
  });

  it('mit einem Kanal „warten" wird auf den Wechsel der Personen zu „home" abonniert, ein Ereignis löst die Heimkehr aus', async () => {
    store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', whenAway: 'wait' });
    await make().sync();
    expect(subs).toHaveLength(1);
    expect(subs[0]!.key).toBe('house:arrival');
    expect(subs[0]!.payload).toEqual({ type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: ['person.anna', 'person.ben'], to: 'home' } });

    subs[0]!.onEvent({ variables: { trigger: { entity_id: 'person.ben' } } });
    subs[0]!.onEvent({ variables: { trigger: { entity_id: 'person.fremd' } } }); // gehört niemandem
    subs[0]!.onEvent({});
    await Promise.resolve();
    expect(arrivals).toEqual([ben]);
  });

  it('ändert sich nichts, wird nicht noch einmal abonniert; ändern sich die Personen, schon', async () => {
    store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', whenAway: 'wait' });
    const s = make();
    await s.sync();
    await s.sync();
    expect(subs).toHaveLength(1);
    owners = new Map([['person.ben', ben]]);
    await s.sync();
    expect(subs).toHaveLength(2);
  });

  it('fällt der letzte wartende Kanal weg, wird das Abonnement beendet', async () => {
    const c = store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', whenAway: 'wait' });
    const s = make();
    await s.sync();
    store.updateHouseChannel(c.id, { whenAway: 'skip' });
    await s.sync();
    expect(unsubs).toEqual(['house:arrival']);
    await s.sync(); // nur einmal
    expect(unsubs).toHaveLength(1);
  });

  it('ein ausgeschalteter Kanal zählt nicht', async () => {
    store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', whenAway: 'wait', enabled: false });
    await make().sync();
    expect(subs).toEqual([]);
  });
});

