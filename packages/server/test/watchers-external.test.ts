import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ValidationError } from '../src/errors.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData, type Watcher, type WatcherData } from '../src/watcher-data.js';
import { parseTrigger, parseWatcher } from '../src/watcher-types.js';
import { createWatchers, type Watchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

// Neue Auslöser: Termine eines Kalenders (mit Vorlauf) und Regen in der Vorhersage, beide im Takt von 30 Minuten abgefragt
const TZ = 'Europe/Berlin';
const CAL = 'calendar.abfall';
const WEATHER = 'weather.zuhause';
let t: number;
let ha: FakeHa;
let store: Store;
let data: WatcherData;
let engine: Watchers;
let anna: string;
let boardId: string;
let columnId: string;

const iso = (ms: number) => new Date(ms).toISOString();
const inHours = (h: number) => iso(t + h * 3_600_000);
const advance = (min: number) => (t += min * 60_000);
const cards = () => store.getBoardView(boardId).cards;

beforeEach(() => {
  t = Date.parse('2026-11-04T10:00:00Z'); // Mi 11:00 Berlin
  ha = new FakeHa();
  const db = openDb(':memory:');
  store = createStore(db, { now: () => new Date(t), timeZone: () => TZ });
  data = createWatcherData(db, () => new Date(t));
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  const board = store.createBoard({ name: 'Haushalt', withPlanned: true });
  boardId = board.id;
  columnId = store.getBoardView(board.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  ha.set(CAL, 'off', '2026-11-04T08:00:00Z', { friendly_name: 'Abfallkalender' });
  ha.set(WEATHER, 'sunny', '2026-11-04T08:00:00Z', { friendly_name: 'Zuhause' });
  ha.set('person.anna', 'home', '2026-11-04T08:00:00Z', { friendly_name: 'Anna', user_id: 'u-anna' });
  engine = createWatchers({ store, data, ha, now: () => new Date(t), timeZone: () => TZ });
  engine.start();
});

const base = { card: () => ({ boardId, columnId, title: 'Tonnen rausstellen' }), assign: () => ({ mode: 'fixed', personIds: [anna] }) };

async function calendarWatcher(leadMin = 12 * 60): Promise<Watcher> {
  const w = data.create(parseWatcher({ name: 'Tonnen', trigger: { entityId: CAL, kind: 'calendar_event', leadMin }, card: base.card(), assign: base.assign() }));
  await engine.onSaved(w.id);
  return w;
}
async function forecastWatcher(hours = 3): Promise<Watcher> {
  const w = data.create(parseWatcher({ name: 'Regen', trigger: { entityId: WEATHER, kind: 'forecast', forecast: { condition: 'rain', hours } }, card: { ...base.card(), title: 'Wäsche rein' }, assign: base.assign(), cooldownMin: 0 }));
  await engine.onSaved(w.id);
  return w;
}

describe('Eingabe prüfen', () => {
  it('calendar_event: nur calendar.*, Vorlauf 0 bis 7 Tage, ohne Angabe 12 Stunden', () => {
    expect(parseTrigger({ entityId: CAL, kind: 'calendar_event' })).toMatchObject({ kind: 'calendar_event', leadMin: 720, forMin: 0, count: 1 });
    expect(parseTrigger({ entityId: CAL, kind: 'calendar_event', leadMin: 0 }).leadMin).toBe(0);
    for (const bad of [{ entityId: 'sensor.x', kind: 'calendar_event' }, { entityId: CAL, kind: 'calendar_event', leadMin: -1 }, { entityId: CAL, kind: 'calendar_event', leadMin: 10081 }]) {
      expect(() => parseTrigger(bad)).toThrow(ValidationError);
    }
  });
  it('forecast: nur weather.*, Regen, 1 bis 48 Stunden, ohne Angabe 3', () => {
    expect(parseTrigger({ entityId: WEATHER, kind: 'forecast' })).toMatchObject({ kind: 'forecast', forecast: { condition: 'rain', hours: 3 } });
    expect(parseTrigger({ entityId: WEATHER, kind: 'forecast', forecast: { condition: 'rain', hours: 48 } }).forecast?.hours).toBe(48);
    for (const bad of [{ entityId: CAL, kind: 'forecast' }, { entityId: WEATHER, kind: 'forecast', forecast: { condition: 'snow', hours: 3 } }, { entityId: WEATHER, kind: 'forecast', forecast: { condition: 'rain', hours: 0 } }, { entityId: WEATHER, kind: 'forecast', forecast: { condition: 'rain', hours: 49 } }]) {
      expect(() => parseTrigger(bad)).toThrow(ValidationError);
    }
  });
  it('alte Wächter (Zahl, Zustand) laden unverändert', () => {
    expect(parseTrigger({ entityId: 'sensor.x', kind: 'below', value: 5 })).toEqual({ entityId: 'sensor.x', kind: 'below', to: null, value: 5, forMin: 3, count: 1 });
  });
});

describe('Kalender: Termin mit Vorlauf', () => {
  it('legt die Aufgabe an, sobald der Vorlauf beginnt, genau einmal je Termin', async () => {
    ha.calendars.set(CAL, [{ title: 'Biotonne', start: inHours(11), end: inHours(12) }]);
    await calendarWatcher();
    await engine.tick();
    expect(cards().map((c) => c.title)).toEqual(['Tonnen rausstellen']);
    expect(cards()[0]!.assigneeIds).toEqual([anna]);
    advance(31);
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('ein Termin außerhalb des Vorlaufs wartet, bis er dran ist', async () => {
    ha.calendars.set(CAL, [{ title: 'Restmüll', start: inHours(14), end: inHours(15) }]);
    await calendarWatcher();
    await engine.tick();
    expect(cards()).toHaveLength(0);
    advance(31 * 4); // gut zwei Stunden später: Vorlauf beginnt
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('zwei Termine: zwei Aufgaben; vergangene Termine: keine', async () => {
    ha.calendars.set(CAL, [
      { title: 'Alt', start: inHours(-5), end: inHours(-4) },
      { title: 'A', start: inHours(2), end: inHours(3) },
      { title: 'B', start: inHours(5), end: inHours(6) },
    ]);
    await calendarWatcher();
    await engine.tick();
    expect(cards()).toHaveLength(2);
  });

  it('ganztägiger Termin (nur Datum) beginnt um Mitternacht Ortszeit', async () => {
    // 5.11. ganztägig = 5.11. 00:00 Berlin = 4.11. 23:00 UTC, in 13 Stunden; Vorlauf 14 Stunden
    ha.calendars.set(CAL, [{ title: 'Papier', start: '2026-11-05', end: '2026-11-06' }]);
    await calendarWatcher(14 * 60);
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('ist die Aufgabe erledigt, kommt sie für denselben Termin nicht wieder', async () => {
    ha.calendars.set(CAL, [{ title: 'Bio', start: inHours(2), end: inHours(3) }]);
    await calendarWatcher();
    await engine.tick();
    store.completeCard(cards()[0]!.id, { by: anna, source: 'app' });
    advance(31);
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('eine gelöschte Aufgabe (Papierkorb) kommt für denselben Termin nicht wieder', async () => {
    ha.calendars.set(CAL, [{ title: 'Bio', start: inHours(2), end: inHours(3), uid: 'abc' }]);
    await calendarWatcher();
    await engine.tick();
    store.deleteCard(cards()[0]!.id);
    expect(cards()).toHaveLength(0);
    advance(31);
    await engine.tick();
    expect(cards()).toHaveLength(0);
  });

  it('ein geänderter Titel oder Beginn desselben Termins (gleiche Kennung) erzeugt keine zweite Aufgabe', async () => {
    ha.calendars.set(CAL, [{ title: 'Bio', start: inHours(2), end: inHours(3), uid: 'abc' }]);
    await calendarWatcher();
    await engine.tick();
    expect(cards()).toHaveLength(1);
    ha.calendars.set(CAL, [{ title: 'Biotonne (neu)', start: inHours(3), end: inHours(4), uid: 'abc' }]);
    advance(31);
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('Einzeltermine einer Serie (gleiche Kennung, andere Wiederholung) bekommen je eine Aufgabe', async () => {
    ha.calendars.set(CAL, [
      { title: 'Bio', start: inHours(2), end: inHours(3), uid: 'serie', recurrenceId: 'r1' },
      { title: 'Bio', start: inHours(5), end: inHours(6), uid: 'serie', recurrenceId: 'r2' },
    ]);
    await calendarWatcher();
    await engine.tick();
    expect(cards()).toHaveLength(2);
  });

  it('ein hängender Kalender hält die Warteschlange nicht auf und ein zweiter Wächter wird trotzdem abgefragt', async () => {
    engine = createWatchers({ store, data, ha, now: () => new Date(t), timeZone: () => TZ, pollTimeoutMs: 60 });
    ha.hangCalendar = true;
    const hanging = await calendarWatcher();
    ha.forecasts.set(WEATHER, [{ datetime: inHours(1), condition: 'rainy' }]);
    await forecastWatcher();
    const tick = engine.tick();
    // Während die Abfrage hängt, ist die Warteschlange frei (Zustandswechsel, „übernehmen" usw. kämen sofort dran)
    const state = await Promise.race([engine.idle().then(() => 'frei'), new Promise((r) => setTimeout(() => r('blockiert'), 30))]);
    expect(state).toBe('frei');
    await tick; // nach dem Zeitlimit ist der Takt fertig
    expect(cards().map((c) => c.title)).toEqual(['Wäsche rein']); // die Vorhersage lief trotz hängendem Kalender
    expect(data.get(hanging.id).status).toBe('ok');
    // und nach fünf Minuten gibt es einen neuen Versuch
    ha.hangCalendar = false;
    ha.calendars.set(CAL, [{ title: 'Bio', start: inHours(2), end: inHours(3) }]);
    advance(6);
    await engine.tick();
    expect(cards().map((c) => c.title)).toContain('Tonnen rausstellen');
  });

  it('eine Ausnahme bei einem Wächter bricht den Rest des Takts nicht ab', async () => {
    const warnings: string[] = [];
    engine = createWatchers({ store, data, ha, now: () => new Date(t), timeZone: () => TZ, log: { info: () => undefined, warn: (m: string) => void warnings.push(m) } });
    ha.calendars.set(CAL, [{ title: 'A', start: inHours(2), end: inHours(3) }]);
    const bad = await calendarWatcher();
    ha.forecasts.set(WEATHER, [{ datetime: inHours(1), condition: 'rainy' }]);
    await forecastWatcher();
    const original = store.hasCardWithDedupeKey;
    store.hasCardWithDedupeKey = () => {
      throw new Error('kaputt');
    };
    try {
      await engine.tick();
    } finally {
      store.hasCardWithDedupeKey = original;
    }
    expect(warnings.join('\n')).toMatch(/kaputt/);
    expect(cards().map((c) => c.title)).toEqual(['Wäsche rein']);
    expect(bad.id).toBeTruthy();
  });

  it('der Kalender wird höchstens alle 30 Minuten abgefragt', async () => {
    ha.calendars.set(CAL, []);
    await calendarWatcher();
    await engine.tick();
    advance(10);
    await engine.tick();
    advance(10);
    await engine.tick();
    expect(ha.calendarCalls).toBe(1);
    advance(11);
    await engine.tick();
    expect(ha.calendarCalls).toBe(2);
  });

  it('Kalender nicht erreichbar: kein Absturz, kein Fehlerstatus, nach 5 Minuten ein neuer Versuch', async () => {
    ha.failCalendar = true;
    const w = await calendarWatcher();
    await expect(engine.tick()).resolves.toBeUndefined();
    expect(data.get(w.id).status).toBe('ok');
    ha.failCalendar = false;
    ha.calendars.set(CAL, [{ title: 'Bio', start: inHours(2), end: inHours(3) }]);
    advance(6);
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('Zuhause: der nächste Termin steht unter „Bald dran", bis seine Aufgabe entsteht', async () => {
    ha.calendars.set(CAL, [{ title: 'Restmüll', start: inHours(20), end: inHours(21) }]);
    await calendarWatcher();
    await engine.tick();
    expect(engine.homeState().items[0]).toMatchObject({ phase: 'soon', nextEvent: { title: 'Restmüll' } });
    advance(31 * 16); // Vorlauf beginnt
    await engine.tick();
    expect(engine.homeState().items[0]!.phase).toBe('waiting');
  });
});

describe('Vorhersage: Regen', () => {
  const rain = (h: number) => ({ datetime: inHours(h), condition: 'rainy' });
  const dry = (h: number) => ({ datetime: inHours(h), condition: 'sunny', precipitation: 0, precipitation_probability: 5 });

  it('Regen in den nächsten Stunden: eine Aufgabe; solange der Regen anhält, keine zweite', async () => {
    ha.forecasts.set(WEATHER, [dry(1), rain(2), rain(3)]);
    await forecastWatcher();
    await engine.tick();
    expect(cards()).toHaveLength(1);
    advance(31);
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('Regen nach dem Zeitfenster zählt nicht', async () => {
    ha.forecasts.set(WEATHER, [dry(1), rain(6)]);
    await forecastWatcher(3);
    await engine.tick();
    expect(cards()).toHaveLength(0);
  });

  it('Wahrscheinlichkeit ab 50 % oder spürbarer Niederschlag zählen auch ohne „rainy"', async () => {
    ha.forecasts.set(WEATHER, [{ datetime: inHours(1), condition: 'cloudy', precipitation_probability: 60 }]);
    await forecastWatcher();
    await engine.tick();
    expect(cards()).toHaveLength(1);
  });

  it('nach trockenem Wetter ist der Wächter wieder scharf: neuer Regen, neue Aufgabe', async () => {
    ha.forecasts.set(WEATHER, [rain(1)]);
    await forecastWatcher();
    await engine.tick();
    store.completeCard(cards()[0]!.id, { by: anna, source: 'app' });
    advance(31);
    ha.forecasts.set(WEATHER, [dry(1)]);
    await engine.tick();
    advance(31);
    ha.forecasts.set(WEATHER, [rain(1)]);
    await engine.tick();
    expect(cards()).toHaveLength(2);
  });

  it('fehlende Vorhersage: nichts passiert, der Wächter bleibt in Ordnung', async () => {
    const w = await forecastWatcher();
    await engine.tick();
    expect(cards()).toHaveLength(0);
    expect(data.get(w.id).status).toBe('ok');
  });
});
