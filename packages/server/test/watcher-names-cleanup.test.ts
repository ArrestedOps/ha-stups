import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createStore, type Store } from '../src/store.js';
import { withDevice, deviceLabel } from '../src/device-names.js';
import { cardTitleOf, plainName, subjectOf, templateCardTitles, templateNames } from '../src/watcher-names.js';
import { createWatcherData, type WatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';
import { createWatchers } from '../src/watchers.js';
import { FakeHa } from './helpers/fake-ha.js';

/**
 * Frühere Versionen hängten das Gerät an den Namen („Trockner fertig: Nachfrage mw50gdjw"). Jetzt heißt ein neuer Wächter wie die Vorlage;
 * bei bestehenden fällt der angehängte Gerätename einmalig weg, aber nur, wo das Muster sicher passt.
 */
describe('plainName: nur was die alte Regel genau so erzeugt hat', () => {
  const bases = templateNames();

  it('kennt die Vorlagen in beiden Sprachen', () => {
    expect(bases).toEqual(expect.arrayContaining(['Batterie schwach', 'Battery low', 'Waschmaschine fertig']));
  });

  it('nimmt das Gerät aus dem Friendly Name weg', () => {
    expect(plainName('Batterie schwach: iPhone Rene', 'sensor.iphone_rene_battery_level', 'iPhone Rene Battery Level', bases)).toBe('Batterie schwach');
    expect(plainName('Battery low: iPhone Rene', 'sensor.iphone_rene_battery_level', 'iPhone Rene Battery Level', bases)).toBe('Battery low');
  });

  it('teilweise schon im Namen: nur der Rest wurde angehängt („Trockner fertig: Nachfrage mw50gdjw")', () => {
    const name = withDevice('Waschmaschine fertig', 'Waschmaschine Keller');
    expect(name).toBe('Waschmaschine fertig: Keller');
    expect(plainName(name, 'sensor.waschmaschine_keller_leistung', 'Waschmaschine Keller Leistung', bases)).toBe('Waschmaschine fertig');
  });

  it('auch ohne Friendly Name über die Entitäts-ID', () => {
    const name = withDevice('Batterie schwach', deviceLabel(null, 'sensor.flur_tuer_battery_level'));
    expect(name).toBe('Batterie schwach: flur tuer');
    expect(plainName(name, 'sensor.flur_tuer_battery_level', undefined, bases)).toBe('Batterie schwach');
  });

  it('gekürzte Gerätenamen (mit …) werden genauso erkannt', () => {
    const label = deviceLabel('Ein sehr langer Name eines Geräts im Obergeschoss Battery Level', 'sensor.x');
    const name = withDevice('Batterie schwach', label);
    expect(plainName(name, 'sensor.x', 'Ein sehr langer Name eines Geräts im Obergeschoss Battery Level', bases)).toBe('Batterie schwach');
  });

  it('eigene Namen und alles, was nicht genau passt, bleibt', () => {
    expect(plainName('Mamas Handy laden', 'sensor.handy_mama_battery', 'Handy Mama Battery', bases)).toBeNull();
    expect(plainName('Batterie schwach', 'sensor.handy', 'Handy', bases)).toBeNull(); // schon der reine Name
    expect(plainName('Batterie schwach: Mamas Liebling', 'sensor.handy_mama_battery', 'Handy Mama Battery', bases)).toBeNull(); // anderes Gerät
    expect(plainName('Batterie schwach: Handy Mama und mehr', 'sensor.handy_mama_battery', 'Handy Mama Battery', bases)).toBeNull();
    expect(plainName('Batterie schwach - Handy Mama', 'sensor.handy_mama_battery', 'Handy Mama Battery', bases)).toBeNull();
    expect(plainName('Meine Batterie schwach: Handy Mama', 'sensor.handy_mama_battery', 'Handy Mama Battery', bases)).toBeNull();
  });

  it('subjectOf: Friendly Name, sonst die Entitäts-ID', () => {
    expect(subjectOf({ name: ' Waschmaschine ' }, 'sensor.w')).toBe('Waschmaschine');
    expect(subjectOf(null, 'sensor.w')).toBe('sensor.w');
    expect(subjectOf({}, 'sensor.w')).toBe('sensor.w');
  });
});

describe('Einmaliger Durchlauf im Wächter-Dienst', () => {
  let store: Store;
  let data: WatcherData;
  let ha: FakeHa;
  let boardId: string;
  let columnId: string;

  beforeEach(() => {
    ha = new FakeHa();
    const db = openDb(':memory:');
    store = createStore(db);
    boardId = store.createBoard({ name: 'Haushalt' }).id;
    columnId = store.getBoardView(boardId).columns[0]!.id;
    data = createWatcherData(db);
  });

  const add = (name: string, entityId: string) =>
    data.create(
      parseWatcher({
        name,
        trigger: { entityId, kind: 'below', value: 20, forMin: 0 },
        card: { boardId, columnId, title: 'Batterie wechseln: iPhone Rene' },
        assign: { mode: 'none' },
      }),
    );

  it('entfernt den Gerätenamen aus Name und Kartentitel, lässt eigene Namen und Titel stehen, merkt sich den Lauf und ändert danach nichts mehr', async () => {
    ha.set('sensor.iphone_rene_battery_level', '15', '2026-11-04T09:00:00Z', { friendly_name: 'iPhone Rene Battery Level' });
    ha.set('sensor.ipad_battery', '12', '2026-11-04T09:00:00Z', { friendly_name: 'iPad Küche Batterie' });
    const alt = add('Batterie schwach: iPhone Rene', 'sensor.iphone_rene_battery_level');
    const alt2 = add('Battery low: iPad Küche', 'sensor.ipad_battery');
    const eigen = add('Batterie schwach: Mamas Liebling', 'sensor.iphone_rene_battery_level');
    const schlicht = add('Batterie schwach', 'sensor.ipad_battery');
    const eigenerTitel = data.create(parseWatcher({ name: 'Mamas Handy', trigger: { entityId: 'sensor.ipad_battery', kind: 'below', value: 20, forMin: 0 }, card: { boardId, columnId, title: 'Rene laden: iPad Küche' }, assign: { mode: 'none' } }));
    const engine = createWatchers({ store, data, ha, now: () => new Date('2026-11-04T12:00:00Z'), timeZone: () => 'Europe/Berlin' });
    engine.start();
    await engine.snapshot();
    // auch der früher automatisch ergänzte Kartentitel der Vorlage: sonst hinge zur Laufzeit der Entitätsname doppelt an
    expect(data.get(alt.id)).toMatchObject({ name: 'Batterie schwach', card: { title: 'Batterie wechseln' } });
    expect(data.get(alt2.id).name).toBe('Battery low');
    expect(data.get(eigen.id).name).toBe('Batterie schwach: Mamas Liebling');
    expect(data.get(schlicht.id).name).toBe('Batterie schwach');
    expect(data.get(eigenerTitel.id).card.title).toBe('Rene laden: iPad Küche'); // kein Vorlagentitel: bleibt
    expect(store.rawSetting('watcherNamesCleaned')).toBe('1');

    // wer später wieder einen Namen nach dem alten Muster schreibt, behält ihn: der Durchlauf ist einmalig
    data.update(alt.id, { ...parseWatcher({ ...data.get(alt.id) }), name: 'Batterie schwach: iPhone Rene' });
    await engine.snapshot();
    expect(data.get(alt.id).name).toBe('Batterie schwach: iPhone Rene');
  });

  it('ohne Zustände aus Home Assistant passiert nichts (der Durchlauf wartet)', async () => {
    const alt = add('Batterie schwach: flur tuer', 'sensor.flur_tuer_battery_level');
    ha.failStates = true;
    const engine = createWatchers({ store, data, ha, now: () => new Date('2026-11-04T12:00:00Z'), timeZone: () => 'Europe/Berlin' });
    engine.start();
    await engine.snapshot().catch(() => undefined);
    expect(data.get(alt.id).name).toBe('Batterie schwach: flur tuer');
    expect(store.rawSetting('watcherNamesCleaned')).toBeNull();
    ha.failStates = false;
    await engine.snapshot();
    expect(data.get(alt.id).name).toBe('Batterie schwach');
  });
});

describe('Titel der Karte: der Name der Entität kommt zur Laufzeit dazu', () => {
  it('hängt den Namen der Entität an („Batterie wechseln: Nuki Türschloss")', () => {
    expect(cardTitleOf('Batterie wechseln', 'below', 'Nuki Türschloss')).toBe('Batterie wechseln: Nuki Türschloss');
    expect(cardTitleOf('  Batterie wechseln ', 'state', 'sensor.nuki_tuer')).toBe('Batterie wechseln: sensor.nuki_tuer'); // ohne Anzeigename die Kennung
  });

  it('nichts Doppeltes: steht der Name schon im Titel (Groß und Klein egal), bleibt der Titel', () => {
    expect(cardTitleOf('Nuki Türschloss: Batterie wechseln', 'below', 'Nuki Türschloss')).toBe('Nuki Türschloss: Batterie wechseln');
    expect(cardTitleOf('Batterie nuki türschloss wechseln', 'below', 'Nuki Türschloss')).toBe('Batterie nuki türschloss wechseln');
    expect(cardTitleOf(cardTitleOf('Batterie wechseln', 'below', 'Nuki'), 'below', 'Nuki')).toBe('Batterie wechseln: Nuki');
  });

  it('Kalender und Vorhersage: nichts anhängen; ohne Namen auch nicht', () => {
    expect(cardTitleOf('Müll rausstellen', 'calendar_event', 'Abfall')).toBe('Müll rausstellen');
    expect(cardTitleOf('Wäsche reinholen', 'forecast', 'Wetter Zuhause')).toBe('Wäsche reinholen');
    expect(cardTitleOf('Titel', 'below', '  ')).toBe('Titel');
  });

  it('zu lang: der Name wird gekürzt, nie der Titel; ohne Platz bleibt der Titel', () => {
    const out = cardTitleOf('Batterie wechseln', 'below', 'Ein ziemlich langer Name eines Geräts im Obergeschoss', 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.startsWith('Batterie wechseln: ')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(cardTitleOf('Ein ziemlich langer Titel einer Karte', 'below', 'Flur', 40)).toBe('Ein ziemlich langer Titel einer Karte');
  });

  it('die Vorlagen der Karten sind in beiden Sprachen bekannt', () => {
    expect(templateCardTitles()).toEqual(expect.arrayContaining(['Batterie wechseln', 'Change the battery']));
  });
});

describe('Die Karte, die der Wächter anlegt, bekommt den Namen der Entität', () => {
  it('der Wächter selbst bleibt sauber, die Karte hat „Titel: Entität"; ohne Entität (Kalender) nichts', async () => {
    const ha = new FakeHa();
    const db = openDb(':memory:');
    const store = createStore(db);
    const boardId = store.createBoard({ name: 'Haushalt' }).id;
    const columnId = store.getBoardView(boardId).columns[0]!.id;
    const data = createWatcherData(db);
    ha.set('sensor.nuki_batterie', '5', '2026-11-04T09:00:00Z', { friendly_name: 'Nuki Türschloss' });
    ha.set('calendar.abfall', 'off', '2026-11-04T09:00:00Z', { friendly_name: 'Abfall' });
    const nuki = data.create(parseWatcher({ name: 'Batterie schwach', trigger: { entityId: 'sensor.nuki_batterie', kind: 'below', value: 20, forMin: 0 }, card: { boardId, columnId, title: 'Batterie wechseln' }, assign: { mode: 'none' } }));
    const cal = data.create(parseWatcher({ name: 'Müll', trigger: { entityId: 'calendar.abfall', kind: 'calendar_event', leadMin: 60 }, card: { boardId, columnId, title: 'Müll rausstellen' }, assign: { mode: 'none' } }));
    const engine = createWatchers({ store, data, ha, now: () => new Date('2026-11-04T12:00:00Z'), timeZone: () => 'Europe/Berlin' });
    engine.start();
    await engine.snapshot();
    await engine.test(nuki.id);
    await engine.test(cal.id);
    const titles = [...new Set(store.getBoardView(boardId).cards.map((c) => c.title))].sort();
    expect(titles).toEqual(['Batterie wechseln: Nuki Türschloss', 'Müll rausstellen']);
    expect(data.get(nuki.id).card.title).toBe('Batterie wechseln'); // die Vorlage bleibt sauber
  });
});
