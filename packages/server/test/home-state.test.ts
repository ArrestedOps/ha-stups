import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData, type Watcher, type WatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';
import { createWatchers, type Watchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

// Zuhause: der Zustand der Wächter (Phasen), berechnet aus dem, was Stups beobachtet hat
const ENTITY = 'sensor.waschmaschine_leistung';
let t: number;
let ha: FakeHa;
let store: Store;
let data: WatcherData;
let engine: Watchers;
let boardId: string;
let columnId: string;
let anna: string;

/** Ein Leistungssensor: nur so ist „über der Schwelle" ein laufender Vorgang */
const POWER = { unit_of_measurement: 'W', device_class: 'power' };
const advance = (min: number) => (t += min * 60_000);
const fireKey = (w: Watcher) => `w:${w.id}:fire`;
const only = () => engine.homeState().items[0]!;

async function create(extra: Record<string, unknown> = {}): Promise<Watcher> {
  const w = data.create(
    parseWatcher({
      name: 'Waschmaschine fertig',
      trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
      card: { boardId, columnId, title: 'Wäsche aufhängen' },
      assign: { mode: 'fixed', personIds: [anna] },
      cooldownMin: 10,
      ...extra,
    }),
  );
  await engine.onSaved(w.id);
  return w;
}
async function emit(w: Watcher, value: string) {
  ha.set(ENTITY, value);
  ha.emit(fireKey(w), value, undefined, POWER);
  await engine.idle();
}

beforeEach(() => {
  t = Date.parse('2026-11-04T10:00:00Z');
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db, { now: () => new Date(t), timeZone: () => 'Europe/Berlin' });
  data = createWatcherData(db, () => new Date(t));
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  const board = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = board.id;
  columnId = store.getBoardView(board.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(ENTITY, '1', undefined, POWER);
  engine = createWatchers({ store, data, ha, now: () => new Date(t), timeZone: () => 'Europe/Berlin' });
  engine.start();
});

describe('homeState nach einem Neustart', () => {
  const make = () =>
    data.create(
      parseWatcher({
        name: 'Waschmaschine fertig',
        trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
        card: { boardId, columnId, title: 'Wäsche aufhängen' },
        assign: { mode: 'fixed', personIds: [anna] },
      }),
    );

  it('vor dem ersten Abgleich gilt die Entität nicht als fehlend; der Blick in die Übersicht holt den Abgleich nach', async () => {
    make();
    expect(only().entityMissing).toBe(false);
    await engine.idle();
    expect(only()).toMatchObject({ entityMissing: false, value: '1 W' });
  });

  it('ein gescheiterter Abgleich beim Verbinden wird nachgeholt, ohne „Entität fehlt" dazwischen', async () => {
    make();
    ha.failStates = true;
    ha.reconnect();
    await engine.idle();
    expect(only().entityMissing).toBe(false);
    ha.failStates = false;
    advance(1);
    only(); // der nächste Blick stößt den Abgleich wieder an
    await engine.idle();
    expect(only()).toMatchObject({ entityMissing: false, value: '1 W' });
  });

  it('nicht öfter als alle 10 Sekunden neu versuchen', async () => {
    make();
    ha.failStates = true;
    let calls = 0;
    const real = ha.getStates.bind(ha);
    ha.getStates = async () => {
      calls += 1;
      return real();
    };
    ha.reconnect();
    await engine.idle();
    for (let i = 0; i < 5; i++) only();
    await engine.idle();
    expect(calls).toBe(1);
  });

  it('nach geladenen Zuständen gilt eine wirklich fehlende Entität als fehlend', async () => {
    make();
    ha.states = [];
    ha.reconnect();
    await engine.idle();
    expect(only().entityMissing).toBe(true);
  });
});

describe('homeState', () => {
  it('ruhig, solange nichts läuft; der Wächter nennt die Karte, die danach kommt', async () => {
    await create();
    expect(only()).toMatchObject({ name: 'Waschmaschine fertig', phase: 'quiet', nextCard: 'Wäsche aufhängen', progress: null, entityMissing: false, openCard: null });
  });

  it('nennt den aktuellen Wert mit Einheit; ohne Wert (unavailable) nichts', async () => {
    const w = await create();
    expect(only().value).toBe('1 W');
    await emit(w, 'unavailable');
    expect(only().value).toBeNull();
  });

  it('ein Batterie-Wächter mit Wert über der Schwelle ist ruhig und zeigt den Wert, nie „läuft gerade"', async () => {
    ha.set('sensor.handy_battery', '26', undefined, { unit_of_measurement: '%', device_class: 'battery' });
    const w = data.create(
      parseWatcher({
        name: 'Batterie schwach',
        trigger: { entityId: 'sensor.handy_battery', kind: 'below', value: 10, forMin: 10 },
        card: { boardId, columnId, title: 'Batterie wechseln' },
        assign: { mode: 'none' },
      }),
    );
    await engine.onSaved(w.id);
    expect(only()).toMatchObject({ phase: 'quiet', since: null, value: '26 %' });
  });

  it('läuft gerade, sobald die Leistung über den Schwellwert steigt, mit Dauer seit Beginn', async () => {
    const w = await create();
    await emit(w, '120');
    expect(only()).toMatchObject({ phase: 'running', since: new Date(t).toISOString() });
    advance(25);
    await emit(w, '90');
    expect(only().since).toBe('2026-11-04T10:00:00.000Z'); // Beginn bleibt
  });

  it('wartet auf jemanden, sobald die Karte entstanden ist, mit der zuständigen Person', async () => {
    const w = await create();
    await emit(w, '120');
    advance(30);
    await emit(w, '1');
    expect(only()).toMatchObject({ phase: 'waiting', openCard: { title: 'Wäsche aufhängen', assigneeIds: [anna] } });
    // die Karte wird erledigt: wieder ruhig
    store.completeCard(only().openCard!.id, { by: anna, source: 'app' });
    expect(only().phase).toBe('quiet');
  });

  it('Zähler: „2 von 3" ist bald dran', async () => {
    const w = await create({ trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0, count: 3 }, cooldownMin: 0 });
    for (let i = 0; i < 2; i += 1) {
      await emit(w, '120');
      advance(1);
      await emit(w, '1');
      advance(1);
    }
    expect(only()).toMatchObject({ phase: 'soon', progress: { n: 2, of: 3 } });
  });

  it('fehlende Entität: ruhig, mit Warnung', async () => {
    ha.states = ha.states.filter((s) => s.entity_id !== ENTITY);
    await create();
    expect(only()).toMatchObject({ phase: 'quiet', entityMissing: true });
  });

  it('pausierte Wächter bleiben in der Liste: ruhig, „aus", ohne Lauf-Erkennung', async () => {
    const w = await create();
    data.setActive(w.id, false);
    expect(engine.homeState().items).toHaveLength(1);
    expect(only()).toMatchObject({ watcherId: w.id, active: false, phase: 'quiet' });
  });

  it('ein pausierter Wächter gilt nicht als „läuft gerade", auch wenn die Leistung über der Schwelle liegt', async () => {
    const w = await create();
    data.setActive(w.id, false);
    ha.set(ENTITY, '120', undefined, POWER);
    await engine.snapshot();
    ha.set(ENTITY, '120', undefined, POWER);
    expect(only()).toMatchObject({ active: false, phase: 'quiet' });
  });

  it('ein aktiver Wächter ist active: true', async () => {
    await create();
    expect(only().active).toBe(true);
  });

  it('Verbindung: ohne Angabe der Verbindung gilt Home Assistant als erreichbar', async () => {
    await create();
    expect(engine.homeState()).toMatchObject({ available: true, lostSince: null });
  });

  it('Verbindung getrennt: available false mit Zeitpunkt', async () => {
    const lost = '2026-11-04T09:30:00.000Z';
    const e = createWatchers({ store, data, ha: Object.assign(ha, { connection: () => ({ connected: false, lostSince: lost }) }), now: () => new Date(t), timeZone: () => 'Europe/Berlin' });
    expect(e.homeState()).toMatchObject({ available: false, lostSince: lost });
  });
});

describe('homeState: alles für die Wächter-Ansicht', () => {
  it('Kategorie, Bedingung, Einheit, letzte Auslösung und Zuständige', async () => {
    const w = await create({ category: 'Haushaltsgeräte' });
    ha.set(ENTITY, '120', undefined, POWER);
    await engine.snapshot();
    const before = only();
    expect(before).toMatchObject({
      category: 'Haushaltsgeräte',
      entityUnit: 'W',
      lastFiredAt: null,
      trigger: { kind: 'below', value: 5, forMin: 0, count: 1, to: null },
      assign: { mode: 'fixed', personIds: [anna] },
      lastAssigneeIds: [],
    });
    expect(before.trigger.entityId).toBe(ENTITY);
    data.markFired(w.id, [anna]);
    expect(only()).toMatchObject({ lastFiredAt: new Date(t).toISOString(), lastAssigneeIds: [anna] });
  });

  it('ohne Kategorie ist category null', async () => {
    await create();
    expect(only().category).toBeNull();
  });
});

describe('view: Kategorie und Vorschlag', () => {
  it('liefert category und active, dazu den Vorschlag aus der Geräteklasse', async () => {
    const w = await create({ name: 'Irgendwas', trigger: { entityId: 'sensor.tuer_batterie', kind: 'below', value: 20, forMin: 0 } });
    ha.set('sensor.tuer_batterie', '50', undefined, { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Tür Batterie' });
    await engine.snapshot();
    const v = engine.view().find((x) => x.id === w.id)!;
    expect(v).toMatchObject({ active: true, category: null, suggestedCategory: 'Batterien' });
    data.setCategory(w.id, 'Meine');
    expect(engine.view().find((x) => x.id === w.id)).toMatchObject({ category: 'Meine' });
  });

  it('der Vorschlag gilt auch bei unbekannter Entität (aus Name und Domäne)', async () => {
    ha.states = [];
    await create({ name: 'Waschmaschine fertig' });
    expect(engine.view()[0]!.suggestedCategory).toBe('Haushaltsgeräte');
  });
});
