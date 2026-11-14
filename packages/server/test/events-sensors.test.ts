import { beforeEach, describe, expect, it } from 'vitest';
import { channelNames } from '../src/channel.js';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createEventBus } from '../src/events.js';
import { createSensors, personSlugs, slugify } from '../src/sensors.js';
import { createStore, type Store } from '../src/store.js';

describe('Event-Bus', () => {
  it('liefert Ereignisse mit fortlaufender Nummer an alle Abonnenten', () => {
    const bus = createEventBus();
    const a: number[] = [];
    const b: number[] = [];
    bus.subscribe((e) => a.push(e.seq));
    const off = bus.subscribe((e) => b.push(e.seq));
    bus.emit({ by: 'u1' });
    off();
    bus.emit({ by: null });
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1]);
    expect(bus.seq).toBe(2);
  });

  it('ein fehlerhafter Abonnent stört die anderen nicht', () => {
    const bus = createEventBus();
    const got: number[] = [];
    bus.subscribe(() => {
      throw new Error('kaputt');
    });
    bus.subscribe((e) => got.push(e.seq));
    expect(() => bus.emit({ by: null })).not.toThrow();
    expect(got).toEqual([1]);
  });
});

describe('slugify', () => {
  it('macht aus Namen saubere Entity-Namen', () => {
    expect(slugify('Rene')).toBe('rene');
    expect(slugify('René')).toBe('rene');
    expect(slugify('Conny Müller')).toBe('conny_mueller');
  });
});

describe('Sensoren', () => {
  let now: Date;
  let store: Store;
  let states: Record<string, { state: string; attributes: any }>;
  let rene: { id: string };
  let conny: { id: string };

  const options = parseOptions({ users: [{ name: 'Rene' }, { name: 'Conny' }] });

  function make() {
    return createSensors({
      store,
      ha: {
        setState: async (entityId: string, state: string, attributes: Record<string, unknown>) => {
          states[entityId] = { state, attributes };
        },
      },
      options,
      now: () => now,
      timeZone: () => 'Europe/Berlin',
    });
  }

  beforeEach(() => {
    now = new Date('2026-11-01T07:00:00Z'); // So 08:00 Berlin
    store = createStore(openDb(':memory:'), { now: () => now });
    store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]);
    rene = store.resolveUser({ haId: 'a', name: 'rene', displayName: 'René' });
    conny = store.resolveUser({ haId: 'b', name: 'conny', displayName: 'Conny' });
    states = {};
  });

  it('zählt überfällige und heute fällige Aufgaben gesamt und pro Person', async () => {
    const b = store.createBoard({ name: 'Haushalt' });
    const col = store.getBoardView(b.id).columns[0]!.id;
    const add = (title: string, dueAt: string | null, who: string[]) =>
      store.createCard(b.id, { columnId: col, title, dueAt, assigneeIds: who }, rene.id);
    add('Steuer', '2026-10-31T10:00:00Z', [conny.id]); // überfällig
    add('Müll', '2026-11-01T15:00:00Z', [conny.id, rene.id]); // heute
    add('Auto', '2026-11-01T11:00:00Z', [rene.id]); // heute
    add('später', '2026-11-09T11:00:00Z', [rene.id]);
    add('ohne Datum', null, [rene.id]);
    add('ohne Zuweisung', '2026-10-31T10:00:00Z', []); // zählt gesamt, aber bei niemandem einzeln

    await make().publish();

    expect(states['sensor.stups_ueberfaellig']!.state).toBe('2');
    expect(states['sensor.stups_heute_faellig']!.state).toBe('2');
    expect(states['sensor.stups_ueberfaellig_conny']!.state).toBe('1');
    expect(states['sensor.stups_heute_faellig_conny']!.state).toBe('1');
    expect(states['sensor.stups_ueberfaellig_rene']!.state).toBe('0');
    expect(states['sensor.stups_heute_faellig_rene']!.state).toBe('2');
  });

  it('Namen ohne lateinische Buchstaben oder mit gleichem Kürzel bekommen eigene, stabile Sensornamen (keine Kollision)', async () => {
    const lena = store.addPerson({ name: 'Лена' });
    const li = store.addPerson({ name: '李雷' });
    const rene2 = store.addPerson({ name: 'Réne' }); // gleiches Kürzel wie Rene
    await make().publish();
    const keys = Object.keys(states).filter((k) => k.startsWith('sensor.stups_gestupst_'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(5); // Rene, Conny und die drei neuen: je ein eigener Sensor
    expect(keys.every((k) => /^sensor\.stups_gestupst_[a-z0-9_]+$/.test(k) && !k.endsWith('_'))).toBe(true);
    const slugs = personSlugs(store.people());
    expect(slugs.get(lena.id)).toMatch(/^[a-z0-9_]+$/);
    expect(slugs.get(li.id)).not.toBe(slugs.get(lena.id));
    expect(slugs.get(rene2.id)).not.toBe(slugs.get(rene.id));
    // dieselben Personen ergeben dieselben Namen
    expect(personSlugs(store.people()).get(li.id)).toBe(slugs.get(li.id));
  });

  it('Beta: eigene Namen (sensor.stups_beta_…, „Stups Beta …"), nichts davon heißt wie bei der normalen App', async () => {
    const b = store.createBoard({ name: 'Haushalt' });
    const col = store.getBoardView(b.id).columns[0]!.id;
    store.createCard(b.id, { columnId: col, title: 'Steuer', dueAt: '2026-10-31T10:00:00Z', assigneeIds: [conny.id] }, rene.id);
    await createSensors({
      store,
      ha: { setState: async (id: string, state: string, attributes: Record<string, unknown>) => void (states[id] = { state, attributes }) },
      options,
      now: () => now,
      timeZone: () => 'Europe/Berlin',
      names: channelNames('beta'),
    }).publish();
    const ids = Object.keys(states);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) expect(id.startsWith('sensor.stups_beta_'), id).toBe(true);
    expect(states['sensor.stups_beta_ueberfaellig']!.state).toBe('1');
    expect(states['sensor.stups_beta_ueberfaellig']!.attributes.friendly_name).toBe('Stups Beta überfällig');
    expect(states['sensor.stups_beta_ueberfaellig_conny']!.attributes.friendly_name).toBe('Stups Beta überfällig (Conny)');
    expect(states['sensor.stups_beta_stupse_offen']!.attributes.friendly_name).toBe('Stups Beta offene Stupse');
    expect(states['sensor.stups_beta_waechter_offen']!.attributes.friendly_name).toBe('Stups Beta offene Wächter-Aufgaben');
    expect(states['sensor.stups_beta_gestupst_conny']!.attributes.friendly_name).toBe('Stups Beta gestupst (Conny)');
    // die normale App schreibt weiter ihre eigenen Namen
    states = {};
    await make().publish();
    expect(Object.keys(states).every((id) => id.startsWith('sensor.stups_') && !id.startsWith('sensor.stups_beta_'))).toBe(true);
    expect(states['sensor.stups_ueberfaellig']!.attributes.friendly_name).toBe('Stups überfällig');
  });

  it('liefert Titel und Termine als Attribute, mit Einheit und Symbol', async () => {
    const b = store.createBoard({ name: 'Haushalt' });
    const col = store.getBoardView(b.id).columns[0]!.id;
    store.createCard(b.id, { columnId: col, title: 'Steuer', dueAt: '2026-10-31T10:00:00Z', assigneeIds: [conny.id] }, rene.id);
    await make().publish();
    const s = states['sensor.stups_ueberfaellig']!;
    expect(s.attributes).toMatchObject({
      unit_of_measurement: 'Aufgaben',
      icon: 'mdi:alert-circle-outline',
      friendly_name: 'Stups überfällig',
      tasks: [{ title: 'Steuer', due: '2026-10-31T10:00:00.000Z', board: 'Haushalt' }],
    });
    expect(states['sensor.stups_heute_faellig']!.attributes.icon).toBe('mdi:calendar-today');
  });

  it('veröffentlicht auch bei leerem Stand Nullen', async () => {
    await make().publish();
    expect(states['sensor.stups_ueberfaellig']!.state).toBe('0');
    // überfällig und heute fällig (gesamt und je Person), offene Stupse (gesamt und je Person), offene Wächter-Aufgaben
    expect(Object.keys(states)).toHaveLength(2 + 2 * 2 + 1 + 2 + 1);
    expect(states['sensor.stups_waechter_offen']!.state).toBe('0');
    expect(states['sensor.stups_stupse_offen']!.state).toBe('0');
  });

  it('zählt offene Stupse gesamt und je Person, mit Aufgabe und Absender als Attribut', async () => {
    store.setNotifyServices(conny.id, ['svc']);
    const b = store.createBoard({ name: 'Haushalt' });
    const col = store.getBoardView(b.id).columns[0]!.id;
    const c = store.createCard(b.id, { columnId: col, title: 'Mülltonne raus' }, rene.id);
    store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    await make().publish();

    expect(states['sensor.stups_stupse_offen']).toMatchObject({
      state: '1',
      attributes: { friendly_name: 'Stups offene Stupse', unit_of_measurement: 'Stupse' },
    });
    expect(states['sensor.stups_gestupst_conny']).toMatchObject({
      state: '1',
      attributes: { friendly_name: 'Stups gestupst (Conny)', nudges: [{ card: 'Mülltonne raus', from: 'Rene', since: '2026-11-01T07:00:00.000Z' }] },
    });
    expect(states['sensor.stups_gestupst_rene']!.state).toBe('0');
  });

  it('publishSoon bündelt viele Änderungen zu einer Veröffentlichung', async () => {
    let calls = 0;
    const sensors = createSensors({
      store,
      ha: { setState: async () => void (calls += 1) },
      options,
      now: () => now,
      timeZone: () => 'Europe/Berlin',
      debounceMs: 10,
    });
    sensors.publishSoon();
    sensors.publishSoon();
    sensors.publishSoon();
    await new Promise((r) => setTimeout(r, 80));
    expect(calls).toBe(10); // 10 Sensoren, einmal
  });
});
