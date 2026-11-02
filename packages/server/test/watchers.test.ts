import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore, type Card, type Store } from '../src/store.js';
import { createWatcherData, type Watcher, type WatcherData } from '../src/watcher-data.js';
import { parseWatcher, WAITING_MARKER } from '../src/watcher-types.js';
import { createWatchers, type Watchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

const ENTITY = 'sensor.waschmaschine_leistung';

let t: number;
let ha: FakeHa;
let store: Store;
let data: WatcherData;
let engine: Watchers;
let boardId: string;
let columnId: string;
let anna: string;
let ben: string;
let conny: string;
let assigned: { card: Card; ids: string[] }[];

const advance = (min: number) => (t += min * 60_000);
const home = (person: 'anna' | 'ben' | 'conny', on: boolean) => ha.set(`person.${person}`, on ? 'home' : 'not_home');
const cards = (): Card[] => store.getBoardView(boardId).cards;
const fireKey = (w: Watcher) => `w:${w.id}:fire`;

let enabled: boolean;

function startEngine(): Watchers {
  engine = createWatchers({
    store,
    data,
    ha,
    now: () => new Date(t),
    timeZone: () => 'Europe/Berlin',
    enabled: () => enabled,
    onAssigned: (card, ids) => assigned.push({ card, ids }),
  });
  engine.start();
  return engine;
}

const watcher = (extra: Record<string, unknown> = {}) =>
  data.create(
    parseWatcher({
      name: 'Waschmaschine fertig',
      trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0 },
      card: { boardId, columnId, title: 'Waschmaschine ausräumen', due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'fixed', personIds: [anna] },
      cooldownMin: 10,
      ...extra,
    }),
  );

/** Wächter anlegen und wie die App danach starten (Startzustand, Abos) */
async function create(extra: Record<string, unknown> = {}): Promise<Watcher> {
  const w = watcher(extra);
  await engine.onSaved(w.id);
  return w;
}

/** Laufender Betrieb: Leistung fällt unter den Schwellwert */
async function done(w: Watcher, power = '2') {
  ha.set(ENTITY, power);
  ha.emit(fireKey(w), power);
  await engine.idle();
}
async function running(w: Watcher, power = '120') {
  ha.set(ENTITY, power);
  ha.emit(fireKey(w), power);
  await engine.idle();
}

beforeEach(() => {
  t = Date.parse('2026-11-04T10:00:00Z');
  enabled = true;
  ha = new FakeHa();
  assigned = [];
  const db = openDb(':memory:');
  store = createStore(db, { now: () => new Date(t), timeZone: () => 'Europe/Berlin' });
  data = createWatcherData(db, () => new Date(t));
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  ben = store.addPerson({ haUserId: 'u-ben', name: 'Ben' }).id;
  conny = store.addPerson({ haUserId: 'u-conny', name: 'Conny' }).id;
  const board = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = board.id;
  columnId = store.getBoardView(board.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  for (const p of ['anna', 'ben', 'conny']) {
    ha.set(`person.${p}`, 'not_home', '2026-11-04T08:00:00Z', { friendly_name: p[0]!.toUpperCase() + p.slice(1), user_id: `u-${p}` });
  }
  ha.set(ENTITY, '120');
  startEngine();
});

describe('Ausgeschaltet (Beta)', () => {
  it('legt keine Karte an und weist keine zu, solange die Wächter aus sind; danach läuft alles wie sonst', async () => {
    const w = await create();
    enabled = false;
    await done(w);
    advance(5);
    await engine.tick();
    expect(cards()).toHaveLength(0);
    expect(assigned).toEqual([]);
    expect(data.runs(w.id)).toEqual([]);

    // wieder an: Abgleich holt den aktuellen Zustand nach, genau einmal
    enabled = true;
    ha.set(ENTITY, '120');
    ha.emit(fireKey(w), '120');
    await engine.idle();
    await done(w);
    expect(cards()).toHaveLength(1);
  });
});

describe('Auslösen', () => {
  it('legt bei Erfüllung der Bedingung eine Karte an, mit Termin ab jetzt und der festen Person', async () => {
    const w = await create();
    await done(w);
    expect(cards()).toHaveLength(1);
    const c = cards()[0]!;
    expect(c).toMatchObject({ title: 'Waschmaschine ausräumen', assigneeIds: [anna], watcherId: w.id });
    expect(c.dueAt).toBe('2026-11-04T10:30:00.000Z');
    expect(assigned.map((a) => a.ids)).toEqual([[anna]]);
    expect(data.runs(w.id)[0]).toMatchObject({ result: 'created', cardId: c.id, assignedTo: [anna] });
    expect(data.get(w.id).lastFiredAt).not.toBeNull();
  });

  it('Zahlenwerte gelten erst nach der Wartezeit; der Takt löst dann aus', async () => {
    const w = await create({ trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 3 } });
    await done(w);
    expect(cards()).toHaveLength(0);
    advance(2);
    await engine.tick();
    expect(cards()).toHaveLength(0);
    advance(1);
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('ein kurzer Einbruch unter die Wartezeit löst nichts aus', async () => {
    const w = await create({ trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 3 } });
    await done(w);
    advance(2);
    await running(w); // Leistung steigt wieder
    advance(5);
    await engine.tick();
    expect(cards()).toHaveLength(0);
    expect(data.getState(w.id)).toMatchObject({ armed: true, metSince: null });
  });

  it('Zustandswechsel: gilt sofort, wenn keine Wartezeit eingestellt ist', async () => {
    ha.set('binary_sensor.waschmaschine_laeuft', 'on');
    const w = await create({ trigger: { entityId: 'binary_sensor.waschmaschine_laeuft', kind: 'state', to: 'off' } });
    ha.emit(fireKey(w), 'off');
    await engine.idle();
    expect(cards()).toHaveLength(1);
  });

  it('löst nicht aus, wenn der Wächter pausiert ist', async () => {
    const w = await create();
    data.setActive(w.id, false);
    engine.syncSubscriptions();
    expect(ha.subs.has(fireKey(w))).toBe(false);
  });
});

describe('Neustart-fest', () => {
  it('löst beim Anlegen nicht aus, wenn die Bedingung schon erfüllt ist; erst nach einem Wechsel wieder', async () => {
    ha.set(ENTITY, '2');
    const w = await create();
    expect(cards()).toHaveLength(0);
    expect(data.getState(w.id).armed).toBe(false);

    await running(w); // wieder scharf
    expect(data.getState(w.id).armed).toBe(true);
    await done(w);
    expect(cards()).toHaveLength(1);
  });

  it('ein Übergang, der während der Trennung passierte, löst nach dem Wiederverbinden genau einmal aus', async () => {
    await create();
    ha.set(ENTITY, '2', '2026-11-04T09:00:00Z'); // passierte, als Stups nichts mitbekam
    ha.reconnect();
    await engine.idle();
    expect(cards()).toHaveLength(1);
    // noch einmal verbinden: derselbe Zustand, keine zweite Karte
    ha.reconnect();
    await engine.idle();
    expect(cards()).toHaveLength(1);
  });

  it('war die Bedingung nach dem Wiederverbinden nicht erfüllt, passiert nichts', async () => {
    await create();
    ha.reconnect();
    await engine.idle();
    expect(cards()).toHaveLength(0);
  });

  it('ein nach dem Auslösen erfüllter Zustand löst nach dem Wiederverbinden nicht noch einmal aus', async () => {
    const w = await create();
    await done(w);
    ha.reconnect();
    await engine.idle();
    expect(cards()).toHaveLength(1);
    expect(data.getState(w.id).armed).toBe(false);
  });

  it('der Zustand übersteht einen Neustart der App (neue Auswertung, dieselbe Datenbank)', async () => {
    const w = await create();
    await done(w);
    startEngine();
    ha.reconnect();
    await engine.idle();
    expect(cards()).toHaveLength(1);
    expect(data.getState(w.id).armed).toBe(false);
  });

  it('ist Home Assistant beim Anlegen nicht erreichbar, bleibt der Wächter vorsichtig (nicht scharf)', async () => {
    ha.failStates = true;
    const w = await create();
    expect(data.getState(w.id).armed).toBe(false);
    expect(cards()).toHaveLength(0);
  });

  it('die Wartezeit beginnt beim Zustandswechsel mit dem Zeitpunkt des Wechsels, nicht erst beim Wiederverbinden', async () => {
    ha.set('binary_sensor.tuer', 'on');
    await create({ trigger: { entityId: 'binary_sensor.tuer', kind: 'state', to: 'off', forMin: 5 } });
    ha.set('binary_sensor.tuer', 'off', new Date(t - 10 * 60_000).toISOString());
    ha.reconnect();
    await engine.idle();
    expect(cards()).toHaveLength(1);
  });
});

describe('Sperrzeit, Doppelkarten, Zähler', () => {
  it('eine flatternde Entität löst in der Sperrzeit nicht noch einmal aus', async () => {
    const w = await create({ dedupe: false });
    await done(w);
    advance(2);
    await running(w);
    await done(w);
    expect(cards()).toHaveLength(1);
    expect(data.runs(w.id)[0]).toMatchObject({ result: 'cooldown' });
    advance(10);
    await running(w);
    await done(w);
    expect(cards()).toHaveLength(2);
  });

  it('solange die Karte offen ist, entsteht keine neue; der Verlauf vermerkt es', async () => {
    const w = await create({ cooldownMin: 0 });
    await done(w);
    await running(w);
    advance(1);
    await done(w);
    expect(cards()).toHaveLength(1);
    expect(data.runs(w.id)[0]).toMatchObject({ result: 'retriggered', cardId: cards()[0]!.id });
    expect(data.runsOfCard(cards()[0]!.id).map((r) => r.result)).toEqual(['created', 'retriggered']);
  });

  it('der Verlauf der Karte nennt den Wächter und was er danach getan hat', async () => {
    const w = await create({ cooldownMin: 0 });
    await done(w);
    await running(w);
    await done(w);
    const activity = store.getCard(cards()[0]!.id).activity;
    expect(activity.find((a) => a.kind === 'created')!.byName).toBe('Wächter „Waschmaschine fertig“');
    expect(activity.find((a) => a.kind === 'watcher')).toMatchObject({ text: 'Erneut ausgelöst' });
  });

  it('ist die Karte erledigt, entsteht beim nächsten Mal wieder eine', async () => {
    const w = await create({ cooldownMin: 0 });
    await done(w);
    store.completeCard(cards()[0]!.id, { by: anna, source: 'app' });
    await running(w);
    await done(w);
    expect(cards().filter((c) => !c.completedAt)).toHaveLength(1);
    expect(cards()).toHaveLength(2);
  });

  it('„neue Karte trotzdem anlegen" schaltet die Doppelkarten-Regel ab', async () => {
    const w = await create({ cooldownMin: 0, dedupe: false });
    await done(w);
    await running(w);
    await done(w);
    expect(cards()).toHaveLength(2);
  });

  describe('Zähler (Saugroboter nach 3 Reinigungen)', () => {
    const robot = 'vacuum.saugroboter';
    const cycle = async (w: Watcher) => {
      ha.emit(fireKey(w), 'cleaning');
      await engine.idle();
      advance(1);
      ha.emit(fireKey(w), 'docked');
      await engine.idle();
      advance(1);
    };
    const mk = async (extra: Record<string, unknown> = {}) => {
      ha.set(robot, 'cleaning');
      return create({
        name: 'Saugroboter Behälter',
        trigger: { entityId: robot, kind: 'state', to: 'docked', count: 3 },
        card: { boardId, columnId, title: 'Staubbehälter leeren', due: { kind: 'none' } },
        cooldownMin: 0,
        ...extra,
      });
    };

    it('zählt, bis die Karte beim N-ten Mal entsteht', async () => {
      const w = await mk();
      await cycle(w);
      await cycle(w);
      expect(cards()).toHaveLength(0);
      expect(data.runs(w.id).map((r) => r.note)).toEqual(['2 von 3', '1 von 3']);
      await cycle(w);
      expect(cards()).toHaveLength(1);
      expect(engine.counterOf(w.id)).toBe(3);
    });

    it('läuft der Zähler bei offener Karte weiter, entsteht keine zweite; der Stand steht im Verlauf', async () => {
      const w = await mk();
      for (let i = 0; i < 5; i += 1) await cycle(w);
      expect(cards()).toHaveLength(1);
      expect(data.runs(w.id)[0]).toMatchObject({ result: 'retriggered', note: '5 Auslösungen seit dem letzten Zurücksetzen' });
    });

    it('wird die Karte erledigt, beginnt die Zählung von vorn', async () => {
      const w = await mk();
      for (let i = 0; i < 3; i += 1) await cycle(w);
      store.completeCard(cards()[0]!.id, { by: anna, source: 'app' });
      expect(engine.counterOf(w.id)).toBe(0);
      await cycle(w);
      await cycle(w);
      expect(cards()).toHaveLength(1);
      await cycle(w);
      expect(cards()).toHaveLength(2);
    });

    it('der Knopf „Zähler zurücksetzen" setzt auf null; der Stand übersteht einen Neustart', async () => {
      const w = await mk();
      await cycle(w);
      await cycle(w);
      startEngine();
      expect(engine.counterOf(w.id)).toBe(2);
      engine.resetCounter(w.id);
      expect(engine.counterOf(w.id)).toBe(0);
      await cycle(w);
      expect(data.runs(w.id)[0]).toMatchObject({ result: 'counted', note: '1 von 3' });
    });

    it('die Sperrzeit gilt auch für den Zähler (ein flatternder Roboter zählt nicht doppelt)', async () => {
      const w = await mk({ cooldownMin: 10 });
      ha.emit(fireKey(w), 'docked');
      await engine.idle();
      ha.emit(fireKey(w), 'cleaning');
      ha.emit(fireKey(w), 'docked');
      await engine.idle();
      expect(engine.counterOf(w.id)).toBe(1);
    });
  });
});

describe('Zuweisung', () => {
  const circle = (ids: string[]) => ids;

  it('abwechselnd (Rotation) merkt sich die Reihenfolge, auch über einen Neustart', async () => {
    const w = await create({ cooldownMin: 0, dedupe: false, assign: { mode: 'rotation', personIds: circle([anna, ben]) } });
    await done(w);
    startEngine();
    await running(w);
    await done(w);
    await running(w);
    await done(w);
    expect(cards().map((c) => c.assigneeIds[0])).toEqual([anna, ben, anna]);
  });

  it('abwechselnd unter den Anwesenden: nur wer zu Hause ist, reihum', async () => {
    home('anna', true);
    home('ben', true);
    const w = await create({ cooldownMin: 0, dedupe: false, assign: { mode: 'rotation_present', personIds: [] } });
    for (let i = 0; i < 3; i += 1) {
      await done(w);
      await running(w);
    }
    expect(cards().map((c) => c.assigneeIds[0])).toEqual([anna, ben, anna]);

    home('anna', false); // Anna geht
    await done(w);
    expect(cards().at(-1)!.assigneeIds).toEqual([ben]);
  });

  it('niemand zu Hause: Rückfall „nächste Person", „alle", „niemand" oder „feste Person"', async () => {
    const run = async (assign: Record<string, unknown>) => {
      const w = await create({ cooldownMin: 0, dedupe: false, assign: { mode: 'rotation_present', personIds: [], ...assign } });
      await done(w);
      await running(w);
      data.setActive(w.id, false);
      engine.syncSubscriptions();
      return cards().at(-1)!.assigneeIds;
    };
    expect(await run({ fallback: 'next' })).toEqual([anna]);
    expect(await run({ fallback: 'all' })).toEqual([anna, ben, conny]);
    expect(await run({ fallback: 'none' })).toEqual([]);
    expect(await run({ fallback: 'fixed', fallbackPersonId: conny })).toEqual([conny]);
  });

  it('alle Anwesenden', async () => {
    home('ben', true);
    home('conny', true);
    const w = await create({ assign: { mode: 'all_present', personIds: [] } });
    await done(w);
    expect(cards()[0]!.assigneeIds).toEqual([ben, conny]);
  });

  it('Personen ohne Zugriff (keine Person mehr) werden übersprungen', async () => {
    store.removePerson(ben);
    home('anna', true);
    home('ben', true);
    const w = await create({ cooldownMin: 0, dedupe: false, assign: { mode: 'rotation_present', personIds: [anna, ben, conny] } });
    await done(w);
    await running(w);
    await done(w);
    expect(cards().map((c) => c.assigneeIds)).toEqual([[anna], [anna]]);
  });

  it('eine Person, deren HA-Person unbekannt ist, gilt als nicht anwesend', async () => {
    ha.states = ha.states.filter((s) => s.entity_id !== 'person.ben');
    home('anna', false);
    const w = await create({ assign: { mode: 'all_present', personIds: [ben], fallback: 'none' } });
    await done(w);
    expect(cards()[0]!.assigneeIds).toEqual([]);
  });

  it('niemand: Karte bleibt unzugewiesen', async () => {
    const w = await create({ assign: { mode: 'none', personIds: [] } });
    await done(w);
    expect(cards()[0]!.assigneeIds).toEqual([]);
    expect(assigned).toEqual([]);
  });
});

describe('Wer zuerst nach Hause kommt', () => {
  const mk = (extra: Record<string, unknown> = {}) =>
    create({ trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'docked' }, assign: { mode: 'first_home', personIds: [], ...extra } });

  beforeEach(() => {
    ha.set('vacuum.s7', 'cleaning');
  });

  const finish = async (w: Watcher) => {
    ha.emit(fireKey(w), 'docked');
    await engine.idle();
  };

  it('ist schon jemand da, geht die Karte wie bei „abwechselnd unter den Anwesenden" sofort an eine anwesende Person', async () => {
    home('ben', true);
    const w = await mk();
    await finish(w);
    expect(cards()[0]!.assigneeIds).toEqual([ben]);
    expect(data.listWaiting()).toEqual([]);
  });

  it('ist niemand da, erscheint die Karte unzugewiesen mit Hinweis und ohne Push', async () => {
    const w = await mk();
    await finish(w);
    const c = cards()[0]!;
    expect(c.assigneeIds).toEqual([]);
    expect(c.dueAt).toBeNull();
    expect(store.getCard(c.id).description).toContain(WAITING_MARKER);
    expect(assigned).toEqual([]);
    expect(data.listWaiting().map((x) => x.cardId)).toEqual([c.id]);
    expect(data.runs(w.id)[0]!.result).toBe('waiting');
    expect(ha.subs.has('presence')).toBe(true);
  });

  it('die erste Heimkehr bekommt die Karte und die Nachricht; die Fälligkeit zählt ab der Zuweisung', async () => {
    const w = await create({
      trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'docked' },
      card: { boardId, columnId, title: 'Staubbehälter leeren', description: 'Bitte leeren', due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'first_home', personIds: [] },
    });
    await finish(w);
    advance(90);
    home('conny', true);
    ha.arrive('person.conny');
    await engine.idle();
    const c = store.getCard(cards()[0]!.id);
    expect(c.assigneeIds).toEqual([conny]);
    expect(c.dueAt).toBe(new Date(t + 30 * 60_000).toISOString());
    expect(c.description).toBe('Bitte leeren');
    expect(assigned.map((a) => a.ids)).toEqual([[conny]]);
  });

  it('kommen zwei fast gleichzeitig an (innerhalb von 2 Minuten), bekommen beide die Karte, danach niemand mehr', async () => {
    const w = await mk();
    await finish(w);
    ha.arrive('person.anna');
    await engine.idle();
    advance(1);
    ha.arrive('person.ben');
    await engine.idle();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([anna, ben]);
    advance(5);
    ha.arrive('person.conny');
    await engine.idle();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([anna, ben]);
    expect(data.listWaiting()).toEqual([]);
  });

  it('dieselbe Person kann nicht doppelt zugewiesen werden', async () => {
    const w = await mk();
    await finish(w);
    ha.arrive('person.anna');
    await engine.idle();
    ha.arrive('person.anna');
    await engine.idle();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([anna]);
    expect(assigned).toHaveLength(1);
  });

  it('wird die Karte vorher von Hand zugewiesen oder erledigt, endet das Warten', async () => {
    const w = await mk({ cooldownMin: 0 });
    await finish(w);
    store.updateCard(cards()[0]!.id, { assigneeIds: [ben] });
    ha.arrive('person.anna');
    await engine.idle();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([ben]);
    expect(data.listWaiting()).toEqual([]);
  });

  it('das Warten übersteht einen Neustart', async () => {
    const w = await mk();
    await finish(w);
    startEngine();
    ha.reconnect();
    await engine.idle();
    ha.arrive('person.ben');
    await engine.idle();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([ben]);
  });

  it('nach 24 Stunden ohne Heimkehr bleibt die Karte unzugewiesen (Vorgabe), ohne Hinweis', async () => {
    const w = await mk();
    await finish(w);
    advance(24 * 60 + 1);
    await engine.tick();
    const c = store.getCard(cards()[0]!.id);
    expect(c.assigneeIds).toEqual([]);
    expect(c.description).toBeNull();
    expect(data.listWaiting()).toEqual([]);
    expect(assigned).toEqual([]);
  });

  it('Rückfall nach 24 Stunden: an alle oder an eine feste Person', async () => {
    const w1 = await mk({ waitFallback: 'all' });
    await finish(w1);
    advance(24 * 60 + 1);
    await engine.tick();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([anna, ben, conny]);

    const w2 = await create({
      trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'idle' },
      assign: { mode: 'first_home', personIds: [], waitFallback: 'fixed', fallbackPersonId: ben },
      card: { boardId, columnId, title: 'Zweite Karte', due: { kind: 'none' } },
    });
    ha.emit(fireKey(w2), 'idle');
    await engine.idle();
    advance(24 * 60 + 1);
    await engine.tick();
    expect(store.getCard(cards().find((c) => c.title === 'Zweite Karte')!.id).assigneeIds).toEqual([ben]);
  });

  it('nur Personen aus dem Kreis des Wächters bekommen die Karte', async () => {
    const w = await mk({ personIds: [ben] });
    await finish(w);
    ha.arrive('person.anna');
    await engine.idle();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([]);
    ha.arrive('person.ben');
    await engine.idle();
    expect(store.getCard(cards()[0]!.id).assigneeIds).toEqual([ben]);
  });
});

describe('Fälligkeit, Spalte und Test', () => {
  it('„morgen 08:00" gilt in der Ortszeit; die Karte kommt dann nach „Geplant"', async () => {
    const w = await create({ card: { boardId, columnId, title: 'Mülltonne', due: { kind: 'at', day: 'tomorrow', time: '08:00' } } });
    await done(w);
    const c = cards()[0]!;
    expect(c.dueAt).toBe('2026-11-05T07:00:00.000Z'); // 08:00 Berlin
    const planned = store.getBoardView(boardId).columns.find((x) => x.isPlanned)!;
    expect(c.columnId).toBe(planned.id);
  });

  it('ist als Spalte „Geplant" gewählt, der Termin aber heute, landet die Karte in „Offen"', async () => {
    const planned = store.getBoardView(boardId).columns.find((x) => x.isPlanned)!;
    const w = await create({ card: { boardId, columnId: planned.id, title: 'x', due: { kind: 'in', minutes: 5 } } });
    await done(w);
    expect(cards()[0]!.columnId).toBe(columnId);
  });

  it('„Testen" legt eine Karte mit Vermerk an, ohne Sperrzeit, Zähler oder Doppelkarten-Regel zu beachten', async () => {
    const w = await create({ trigger: { entityId: ENTITY, kind: 'below', value: 5, count: 3 } });
    await engine.test(w.id);
    await engine.test(w.id);
    expect(cards()).toHaveLength(2);
    expect(cards()[0]!.description).toContain('(Test)');
    expect(data.runs(w.id)[0]!.result).toBe('test');
    expect(engine.counterOf(w.id)).toBe(0);
  });
});

describe('Nach Wartezeit erinnern', () => {
  let nudged: { card: Card; ids: string[] }[];
  beforeEach(() => {
    nudged = [];
    engine = createWatchers({
      store,
      data,
      ha,
      now: () => new Date(t),
      timeZone: () => 'Europe/Berlin',
      onAssigned: (card, ids) => assigned.push({ card, ids }),
      onNudge: (card, ids) => nudged.push({ card, ids }),
    });
    engine.start();
  });

  it('erinnert einmal, wenn die Karte nach der Zeit noch offen ist', async () => {
    const w = await create({ nudgeAfterMin: 60 });
    await done(w);
    advance(59);
    await engine.tick();
    expect(nudged).toHaveLength(0);
    advance(2);
    await engine.tick();
    expect(nudged.map((n) => [n.card.title, n.ids])).toEqual([['Waschmaschine ausräumen', [anna]]]);
    advance(120);
    await engine.tick();
    expect(nudged).toHaveLength(1);
    expect(data.runs(w.id)[0]!.result).toBe('nudged');
    expect(store.getCard(cards()[0]!.id).activity.some((a) => a.kind === 'watcher' && /Erinnerung gesendet/.test(a.text ?? ''))).toBe(true);
  });

  it('nichts, wenn die Karte erledigt oder niemandem zugewiesen ist', async () => {
    const w = await create({ nudgeAfterMin: 5, cooldownMin: 0 });
    await done(w);
    store.completeCard(cards()[0]!.id, { by: anna, source: 'app' });
    advance(10);
    await engine.tick();
    expect(nudged).toHaveLength(0);

    const w2 = await create({ nudgeAfterMin: 5, assign: { mode: 'none' }, name: 'Zweiter' });
    await running(w2);
    await done(w2);
    advance(10);
    await engine.tick();
    expect(nudged).toHaveLength(0);
  });

  it('bei der ersten Heimkehr zählt die Zeit ab der Zuweisung', async () => {
    ha.set('vacuum.s7', 'cleaning');
    const w = await create({ trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'docked' }, assign: { mode: 'first_home', personIds: [] }, nudgeAfterMin: 30 });
    ha.emit(fireKey(w), 'docked');
    await engine.idle();
    advance(600); // lange nichts
    await engine.tick();
    expect(nudged).toHaveLength(0);
    ha.arrive('person.ben');
    await engine.idle();
    advance(31);
    await engine.tick();
    expect(nudged.map((n) => n.ids)).toEqual([[ben]]);
  });
});

describe('Anwesende', () => {
  it('liefert, wer zu Hause ist (für Automationen mit assignees: present)', async () => {
    home('ben', true);
    home('conny', true);
    expect((await engine.presentPersonIds()).sort()).toEqual([ben, conny].sort());
  });
});

describe('Erledigt sich selbst', () => {
  it('wenn die zweite Bedingung eintritt, wird die offene Karte erledigt', async () => {
    ha.set('binary_sensor.tuer', 'off');
    const w = await create({ done: { entityId: 'binary_sensor.tuer', kind: 'state', to: 'on' } });
    await done(w);
    expect(cards()[0]!.completedAt).toBeNull();
    ha.emit(`w:${w.id}:done`, 'on');
    await engine.idle();
    expect(cards()[0]!.completedAt).not.toBeNull();
    expect(data.runs(w.id)[0]!.result).toBe('auto_done');
  });

  it('ohne offene Karte oder bei einem anderen Zustand passiert nichts', async () => {
    ha.set('binary_sensor.tuer', 'off');
    const w = await create({ done: { entityId: 'binary_sensor.tuer', kind: 'state', to: 'on' } });
    ha.emit(`w:${w.id}:done`, 'on');
    await engine.idle();
    expect(data.runs(w.id)).toEqual([]);
    await done(w);
    ha.emit(`w:${w.id}:done`, 'off');
    await engine.idle();
    expect(cards()[0]!.completedAt).toBeNull();
  });
});

describe('Fehlerfälle', () => {
  it('Entität gibt es nicht (mehr): Wächter wird markiert, nicht gelöscht; kommt sie zurück, ist wieder alles gut', async () => {
    ha.states = ha.states.filter((s) => s.entity_id !== ENTITY);
    const w = await create();
    expect(data.get(w.id).status).toBe('entity_missing');
    ha.set(ENTITY, '120');
    ha.reconnect();
    await engine.idle();
    expect(data.get(w.id).status).toBe('ok');
  });

  it('Board gelöscht: der Wächter pausiert mit Hinweis, keine Karte, der Fehler steht im Verlauf', async () => {
    const w = await create();
    store.deleteBoard(boardId);
    await done(w);
    expect(data.get(w.id)).toMatchObject({ status: 'target_missing', active: false });
    expect(data.runs(w.id)[0]).toMatchObject({ result: 'error' });
    expect(ha.subs.has(fireKey(w))).toBe(false);
  });

  it('ändert man den Wächter, gilt der neue Zustand (nicht scharf, wenn die Bedingung schon erfüllt ist)', async () => {
    ha.set(ENTITY, '2');
    const w = await create();
    data.update(w.id, parseWatcher({ name: 'x', trigger: { entityId: ENTITY, kind: 'below', value: 50 }, card: { boardId, columnId, title: 't' }, assign: { mode: 'none' } }));
    await engine.onSaved(w.id);
    expect(data.getState(w.id).armed).toBe(false);
    expect(cards()).toHaveLength(0);
  });

  it('Wächter löschen beendet die Abos', async () => {
    const w = await create();
    data.remove(w.id);
    engine.syncSubscriptions();
    expect(ha.subs.has(fireKey(w))).toBe(false);
  });
});

describe('Sicht für die Oberfläche', () => {
  it('zeigt Zählerstand, Abo und letzten Lauf', async () => {
    const w = await create({ trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 0, count: 3 }, cooldownMin: 0 });
    await done(w);
    const [v] = engine.view();
    expect(v).toMatchObject({ id: w.id, counter: 1, subscribed: true});
    expect(v!.lastRun).toMatchObject({ result: 'counted', note: '1 von 3' });
  });
});
