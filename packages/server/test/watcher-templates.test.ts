import { describe, expect, it } from 'vitest';
import type { HaState } from '../src/ha.js';
import { withLanguage } from '../src/i18n/index.js';
import { detectSuggestions, MAX_SUGGESTIONS, suggestionKey, watcherTemplates } from '../src/watcher-templates.js';

const state = (entityId: string, st: string, attributes: Record<string, unknown> = {}): HaState => ({ entity_id: entityId, state: st, attributes });
const ids = (list: { templateId: string; entityId: string }[]) => list.map((s) => `${s.templateId}:${s.entityId}`);

describe('Vorlagen', () => {
  it('alle Vorlagen aus dem Entwurf sind da: sieben mit Gerät, dazu 19 neue, vier ohne Gerät (dazu 13 neue, siehe unten)', () => {
    const list = watcherTemplates();
    expect(list.filter((x) => x.kind === 'watcher').map((x) => x.id)).toEqual([
      'washer',
      'dryer',
      'dishwasher',
      'bins',
      'rain',
      'battery',
      'vacuum',
      'window_open',
      'fridge_open',
      'leak',
      'plant',
      'humid',
      'co2',
      'dehumidifier',
      'robot_error',
      'filter_life',
      'toner',
      'level',
      'refill',
      'litter',
      'ev_plug',
      'mail',
      'garage_lock',
      'freezer_warm',
      'unavailable',
      'update',
    ]);
    expect(list.filter((x) => x.kind === 'recurring').map((x) => x.id).slice(0, 4)).toEqual(['descale', 'smoke', 'filter', 'bedding']);
  });

  it('Geräte-Vorlagen sagen ehrlich, dass der Sensor das Ausräumen nicht belegt; die Batterie kann sich selbst erledigen', () => {
    const byId = new Map(watcherTemplates().map((x) => [x.id, x]));
    for (const id of ['washer', 'dryer', 'dishwasher', 'bins', 'rain', 'vacuum'] as const) {
      expect(byId.get(id)).toMatchObject({ canSelfComplete: false });
      expect(byId.get(id)!.whyNoSelfComplete).toBeTruthy();
    }
    expect(byId.get('battery')).toMatchObject({ canSelfComplete: true, draft: { done: { kind: 'above', value: 50 } } });
  });

  it('Wiederkehrende Vorlagen tragen eine Wiederholung statt eines Wächters', () => {
    const smoke = watcherTemplates().find((x) => x.id === 'smoke')!;
    expect(smoke).toMatchObject({ draft: null, recurring: { title: 'Rauchmelder testen', recurrence: { type: 'fixed', freq: 'monthly', every: 6 } } });
  });
});

describe('Erkennung', () => {
  const states: HaState[] = [
    state('sensor.steckdose_trockner_power', '2', { device_class: 'power', friendly_name: 'Steckdose Trockner Leistung', unit_of_measurement: 'W' }),
    state('sensor.waschmaschine_leistung', '120', { device_class: 'power', friendly_name: 'Waschmaschine Leistung' }),
    state('sensor.spuelmaschine_operation_state', 'run', { friendly_name: 'Spülmaschine Betriebsstatus' }),
    state('sensor.kuehlschrank_power', '80', { device_class: 'power', friendly_name: 'Kühlschrank' }),
    state('calendar.abfall', 'off', { friendly_name: 'Abfallkalender' }),
    state('calendar.familie', 'off', { friendly_name: 'Familie' }),
    state('weather.zuhause', 'sunny', { friendly_name: 'Zuhause' }),
    state('sensor.bad_batterie', '12', { device_class: 'battery', friendly_name: 'Bad Fenster Batterie' }),
    state('sensor.flur_batterie', '88', { device_class: 'battery', friendly_name: 'Flur Batterie' }),
    state('sensor.kaputt_batterie', 'unavailable', { device_class: 'battery' }),
    state('vacuum.roboter', 'docked', { friendly_name: 'Saugroboter' }),
  ];

  it('findet Geräte, Kalender, Wetter, Batterien und Saugroboter mit Begründung', () => {
    const list = detectSuggestions(states, new Set());
    expect(ids(list)).toEqual([
      'washer:sensor.waschmaschine_leistung',
      'dryer:sensor.steckdose_trockner_power',
      'dishwasher:sensor.spuelmaschine_operation_state',
      'bins:calendar.abfall',
      'rain:weather.zuhause',
      'battery:sensor.bad_batterie',
      'battery:sensor.flur_batterie',
      'vacuum:vacuum.roboter',
      'robot_error:vacuum.roboter',
      'unavailable:sensor.kaputt_batterie',
    ]);
    expect(list.find((s) => s.entityId === 'sensor.steckdose_trockner_power')?.reason).toBe('Steckdose Trockner Leistung misst die Leistung');
    expect(list.find((s) => s.entityId === 'sensor.bad_batterie')?.reason).toBe('Bad Fenster Batterie: Batterie bei 12 %');
  });

  it('jeder Treffer trägt den kurzen Gerätenamen für Name und Aufgabentitel (ohne Endungen wie Battery Level)', () => {
    const list = detectSuggestions(
      [
        state('sensor.iphone_rene_battery_level', '14', { device_class: 'battery', friendly_name: 'iPhone Rene Battery Level' }),
        state('sensor.ohne_name_battery', '30', { device_class: 'battery' }),
        state('sensor.waschmaschine_leistung', '120', { device_class: 'power', friendly_name: 'Waschmaschine Leistung' }),
      ],
      new Set(),
    );
    expect(Object.fromEntries(list.map((s) => [s.entityId, s.label]))).toEqual({
      'sensor.iphone_rene_battery_level': 'iPhone Rene',
      'sensor.ohne_name_battery': 'ohne name',
      'sensor.waschmaschine_leistung': 'Waschmaschine',
    });
  });

  it('der Hinweis der Batterie-Vorlage verspricht keinen Gerätenamen mehr, der fehlt', () => {
    expect(watcherTemplates().find((x) => x.id === 'battery')!.hint).not.toMatch(/erst, wenn du ihn anpasst/);
  });

  it('Programmstatus eines Geräts bekommt den Entwurf „wechselt in finished"', () => {
    const s = detectSuggestions(states, new Set()).find((x) => x.variant === 'status')!;
    expect(s.draft?.trigger).toEqual({ kind: 'state', to: 'finished', forMin: 0 });
  });

  it('Entitäten, die schon ein Wächter beobachtet, fehlen', () => {
    const list = detectSuggestions(states, new Set(['sensor.waschmaschine_leistung', 'vacuum.roboter']));
    expect(ids(list)).not.toContain('washer:sensor.waschmaschine_leistung');
    expect(ids(list)).not.toContain('vacuum:vacuum.roboter');
    expect(ids(list)).not.toContain('robot_error:vacuum.roboter');
    expect(ids(list)).toContain('dryer:sensor.steckdose_trockner_power');
  });

  it('der Kühlschrank (Leistung, aber kein Gerätename) und der Familienkalender treffen nichts; ein Sensor ohne Zahl fehlt bei den Batterien', () => {
    const list = ids(detectSuggestions(states, new Set()));
    expect(list.some((x) => x.includes('kuehlschrank') || x.includes('calendar.familie'))).toBe(false);
    // ein Batterie-Sensor ohne Zahl ist kein Batterie-Treffer (er steht als „nicht erreichbar“ da)
    expect(list.filter((x) => x.includes('kaputt'))).toEqual(['unavailable:sensor.kaputt_batterie']);
  });

  it('mehr als fünf Batterien: alle kommen, die schwächsten zuerst', () => {
    const many = Array.from({ length: 12 }, (_, i) => state(`sensor.b${i}`, String(90 - i), { device_class: 'battery', friendly_name: `B${i}` }));
    const list = detectSuggestions(many, new Set());
    expect(list).toHaveLength(12);
    expect(list.map((s) => s.entityId)).toEqual(Array.from({ length: 12 }, (_, i) => `sensor.b${11 - i}`));
  });

  it('auch Kalender, Saugroboter, Wetter und Geräte werden nicht mehr auf wenige Treffer gekürzt', () => {
    const many = [
      ...Array.from({ length: 8 }, (_, i) => state(`calendar.muell_${i}`, 'off', { friendly_name: `Müll ${i}` })),
      ...Array.from({ length: 7 }, (_, i) => state(`vacuum.robi_${i}`, 'docked')),
      ...Array.from({ length: 4 }, (_, i) => state(`weather.ort_${i}`, 'sunny')),
      ...Array.from({ length: 9 }, (_, i) => state(`sensor.trockner_${i}_power`, '1', { device_class: 'power', friendly_name: `Trockner ${i}` })),
    ];
    const byTemplate = (id: string) => detectSuggestions(many, new Set()).filter((s) => s.templateId === id).length;
    expect(byTemplate('bins')).toBe(8);
    expect(byTemplate('vacuum')).toBe(7);
    expect(byTemplate('rain')).toBe(4);
    expect(byTemplate('dryer')).toBe(9);
  });

  it('Schutzgrenze: höchstens 500 Treffer insgesamt, die Vorlagen kommen der Reihe nach', () => {
    const huge = [
      ...Array.from({ length: 300 }, (_, i) => state(`calendar.muell_${i}`, 'off', { friendly_name: `Müll ${i}` })),
      ...Array.from({ length: 400 }, (_, i) => state(`sensor.b${i}`, String(i % 100), { device_class: 'battery', friendly_name: `B${i}` })),
    ];
    expect(MAX_SUGGESTIONS).toBe(500);
    const list = detectSuggestions(huge, new Set());
    expect(list).toHaveLength(500);
    expect(list.filter((s) => s.templateId === 'bins')).toHaveLength(300);
    expect(list.filter((s) => s.templateId === 'battery')).toHaveLength(200);
  });

  it('die Grenze lässt sich aufheben (für die Liste der ausgeblendeten Treffer, die auch jenseits davon zurückkommen sollen)', () => {
    const huge = Array.from({ length: 520 }, (_, i) => state(`sensor.b${i}`, String(i % 100), { device_class: 'battery' }));
    expect(detectSuggestions(huge, new Set(), new Set(), Infinity)).toHaveLength(520);
  });

  it('die Schutzgrenze zählt Treffer ohne die ausgeblendeten', () => {
    const huge = Array.from({ length: 510 }, (_, i) => state(`sensor.b${i}`, String(i % 100), { device_class: 'battery' }));
    const hidden = new Set(Array.from({ length: 10 }, (_, i) => suggestionKey('battery', `sensor.b${i}`)));
    expect(detectSuggestions(huge, new Set(), hidden)).toHaveLength(500);
  });

  it('kaputte Zustände (fehlende Attribute, fremde Typen) lassen die Erkennung nicht abstürzen', () => {
    const weird = [{ entity_id: 'sensor.x', state: 'on' }, { entity_id: 'light.y', state: 'off', attributes: undefined }] as HaState[];
    expect(detectSuggestions(weird, new Set())).toEqual([]);
    expect(detectSuggestions([], new Set())).toEqual([]);
  });

  it('Waschmaschine und Waschtrockner/Trockner werden nicht verwechselt', () => {
    const list = detectSuggestions([state('sensor.trockner_power', '1', { device_class: 'power', friendly_name: 'Trockner' })], new Set());
    expect(ids(list)).toEqual(['dryer:sensor.trockner_power']);
  });
});

describe('Ausgeblendetes', () => {
  const states = [
    state('sensor.batt_a', '10', { device_class: 'battery' }),
    state('sensor.batt_b', '20', { device_class: 'battery' }),
    state('vacuum.robi', 'docked'),
  ];

  it('ausgeblendete Treffer fehlen, andere Vorlagen derselben Entität bleiben', () => {
    const hidden = new Set([suggestionKey('battery', 'sensor.batt_a')]);
    expect(ids(detectSuggestions(states, new Set(), hidden))).toEqual(['battery:sensor.batt_b', 'vacuum:vacuum.robi', 'robot_error:vacuum.robi']);
    expect(ids(detectSuggestions(states, new Set()))).toEqual(['battery:sensor.batt_a', 'battery:sensor.batt_b', 'vacuum:vacuum.robi', 'robot_error:vacuum.robi']);
  });

  it('beim Ausblenden bleiben alle übrigen Treffer, in derselben Reihenfolge', () => {
    const many = Array.from({ length: 7 }, (_, i) => state(`sensor.b${i}`, String(10 + i), { device_class: 'battery' }));
    const hidden = new Set([suggestionKey('battery', 'sensor.b0')]);
    expect(detectSuggestions(many, new Set(), hidden).map((s) => s.entityId)).toEqual(['sensor.b1', 'sensor.b2', 'sensor.b3', 'sensor.b4', 'sensor.b5', 'sensor.b6']);
  });
});

// ---------- Neue Vorlagen für Geräte ----------

describe('Neue Vorlagen: Erkennung', () => {
  const only = (states: HaState[], id: string) => detectSuggestions(states, new Set()).filter((s) => s.templateId === id);
  const one = (states: HaState[], id: string) => {
    const hits = only(states, id);
    expect(hits).toHaveLength(1);
    return hits[0]!;
  };

  it('Fenster/Tür lange offen: Fenster-, Tür- und Garagensensor, aber nicht die Kühlschranktür', () => {
    const w = state('binary_sensor.fenster_bad', 'off', { device_class: 'window', friendly_name: 'Fenster Bad' });
    expect(one([w], 'window_open').entityId).toBe('binary_sensor.fenster_bad');
    expect(only([state('binary_sensor.haustuer', 'off', { device_class: 'door', friendly_name: 'Haustür' })], 'window_open')).toHaveLength(1);
    const fridge = state('binary_sensor.kuehlschrank_tuer', 'off', { device_class: 'door', friendly_name: 'Kühlschrank Tür' });
    expect(only([fridge], 'window_open')).toEqual([]);
    expect(only([state('sensor.fenster_x', '1', { device_class: 'window' })], 'window_open')).toEqual([]);
  });

  it('Kühl-/Gefriertür offen: nur Türsensoren mit Kühlschrank- oder Gefrierwörtern', () => {
    const fridge = state('binary_sensor.kuehlschrank_tuer', 'off', { device_class: 'door', friendly_name: 'Kühlschrank Tür' });
    expect(one([fridge], 'fridge_open').entityId).toBe('binary_sensor.kuehlschrank_tuer');
    expect(only([state('binary_sensor.freezer_door', 'off', { device_class: 'door', friendly_name: 'Freezer Door' })], 'fridge_open')).toHaveLength(1);
    expect(only([state('binary_sensor.haustuer', 'off', { device_class: 'door', friendly_name: 'Haustür' })], 'fridge_open')).toEqual([]);
  });

  it('Wasserleck: binary_sensor mit Geräteklasse moisture', () => {
    expect(one([state('binary_sensor.waschkeller_wasser', 'off', { device_class: 'moisture', friendly_name: 'Waschkeller Wasser' })], 'leak').entityId).toBe('binary_sensor.waschkeller_wasser');
    expect(only([state('sensor.bodenfeuchte', '30', { device_class: 'moisture' })], 'leak')).toEqual([]);
  });

  it('Pflanze: Bodenfeuchte-Sensor oder plant-Entität; Luftfeuchte ist keine Pflanze', () => {
    const soil = one([state('sensor.ficus_moisture', '35', { device_class: 'moisture', unit_of_measurement: '%', friendly_name: 'Ficus' })], 'plant');
    expect(soil).toMatchObject({ variant: 'level', unit: '%' });
    const byName = one([state('sensor.monstera_boden', '35', { unit_of_measurement: '%', friendly_name: 'Monstera Boden' })], 'plant');
    expect(byName.entityId).toBe('sensor.monstera_boden');
    const entity = one([state('plant.ficus', 'ok', { friendly_name: 'Ficus' })], 'plant');
    expect(entity).toMatchObject({ variant: 'status', draft: { trigger: { kind: 'state', to: 'problem' }, done: { kind: 'state', to: 'ok' } } });
    expect(only([state('sensor.bad_luftfeuchte', '55', { device_class: 'humidity', unit_of_measurement: '%', friendly_name: 'Pflanzenzimmer Luftfeuchte' })], 'plant')).toEqual([]);
  });

  it('Lüften: Luftfeuchte und CO₂', () => {
    expect(one([state('sensor.bad_feuchte', '70', { device_class: 'humidity', unit_of_measurement: '%', friendly_name: 'Bad' })], 'humid').reason).toBe('Bad: Luftfeuchte bei 70 %');
    expect(one([state('sensor.buero_co2', '1300', { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm', friendly_name: 'Büro' })], 'co2').reason).toBe('Büro: CO₂ bei 1300 ppm');
    expect(only([state('sensor.t', '20', { device_class: 'temperature' })], 'humid')).toEqual([]);
  });

  it('Entfeuchter-Tank und andere Nachfüll-Meldungen', () => {
    expect(one([state('binary_sensor.entfeuchter_tank', 'off', { friendly_name: 'Entfeuchter Tank voll' })], 'dehumidifier').entityId).toBe('binary_sensor.entfeuchter_tank');
    expect(only([state('binary_sensor.tank_pool', 'off', { friendly_name: 'Pool Tank' })], 'dehumidifier')).toEqual([]);
    expect(one([state('binary_sensor.spuelmaschine_salz', 'off', { friendly_name: 'Spülmaschine Salz leer' })], 'refill').entityId).toBe('binary_sensor.spuelmaschine_salz');
    // der Tank eines Entfeuchters ist kein „Nachfüllen“
    expect(only([state('binary_sensor.entfeuchter_tank', 'off', { friendly_name: 'Entfeuchter Wassertank' })], 'refill')).toEqual([]);
  });

  it('Roboter steckt fest: Saug- und Mähroboter', () => {
    const list = detectSuggestions([state('vacuum.robi', 'docked'), state('lawn_mower.rasen', 'docked', { friendly_name: 'Rasenroboter' })], new Set());
    expect(ids(list.filter((s) => s.templateId === 'robot_error'))).toEqual(['robot_error:vacuum.robi', 'robot_error:lawn_mower.rasen']);
    expect(only([state('light.flur', 'off')], 'robot_error')).toEqual([]);
  });

  it('Filter, Toner, Füllstand: Prozentwerte mit den passenden Wörtern', () => {
    expect(one([state('sensor.luftreiniger_filter', '8', { unit_of_measurement: '%', friendly_name: 'Luftreiniger Filter' })], 'filter_life').reason).toBe('Luftreiniger Filter: Filter bei 8 %');
    expect(only([state('sensor.filter_x', 'on', { friendly_name: 'Filter x' })], 'filter_life')).toEqual([]);
    expect(one([state('sensor.drucker_tonerstand', '12', { unit_of_measurement: '%', friendly_name: 'Drucker Toner' })], 'toner').entityId).toBe('sensor.drucker_tonerstand');
    // „ink“ steckt auch in „link“: nur das ganze Wort zählt
    expect(only([state('sensor.wlan_link_qualitaet', '80', { unit_of_measurement: '%', friendly_name: 'WLAN Link Qualität' })], 'toner')).toEqual([]);
    expect(one([state('sensor.pellets_fuellstand', '15', { unit_of_measurement: '%', friendly_name: 'Pellets Füllstand' })], 'level').entityId).toBe('sensor.pellets_fuellstand');
    expect(only([state('sensor.pellets_fuellstand', '15', { friendly_name: 'Pellets Füllstand' })], 'level')).toEqual([]);
  });

  it('Katzenklo: Behälter-Sensor (Schalter) oder Füllstand (Pegel) mit eigenem Entwurf', () => {
    const sw = one([state('binary_sensor.katzenklo_voll', 'off', { friendly_name: 'Katzenklo voll' })], 'litter');
    expect(sw.variant).toBe('switch');
    const lvl = one([state('sensor.katzenklo_schublade', '40', { unit_of_measurement: '%', friendly_name: 'Katzenklo Schublade' })], 'litter');
    expect(lvl).toMatchObject({ variant: 'level', draft: { trigger: { kind: 'above', value: 80 }, done: { kind: 'below', value: 50 } } });
    expect(only([state('binary_sensor.katzenklo_tuer', 'off', { friendly_name: 'Katzenklo Tür' })], 'litter')).toEqual([]);
  });

  it('E-Auto einstecken: Ladestand des Autos, nicht der Handy-Akku', () => {
    expect(one([state('sensor.id3_auto_batterie', '25', { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'ID.3 Auto Batterie' })], 'ev_plug').entityId).toBe('sensor.id3_auto_batterie');
    expect(only([state('sensor.iphone_battery_level', '25', { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'iPhone Auto Handy' })], 'ev_plug')).toEqual([]);
    expect(only([state('sensor.flur_batterie', '25', { device_class: 'battery', friendly_name: 'Flur' })], 'ev_plug')).toEqual([]);
  });

  it('Post: nur der Briefkasten-Sensor', () => {
    expect(one([state('binary_sensor.briefkasten', 'off', { friendly_name: 'Briefkasten' })], 'mail').entityId).toBe('binary_sensor.briefkasten');
    expect(one([state('binary_sensor.post_eingang', 'off', { friendly_name: 'Post' })], 'mail').entityId).toBe('binary_sensor.post_eingang');
    expect(only([state('binary_sensor.position_x', 'off', { friendly_name: 'Position' })], 'mail')).toEqual([]);
  });

  it('Garage und Haustür: Garagentor (cover) und Türschloss (lock) mit verschiedenen Fassungen', () => {
    const cover = one([state('cover.garage', 'closed', { device_class: 'garage', friendly_name: 'Garage' })], 'garage_lock');
    expect(cover).toMatchObject({ variant: 'cover' });
    expect(cover.draft).toBeUndefined();
    const lock = one([state('lock.haustuer', 'locked', { friendly_name: 'Haustür' })], 'garage_lock');
    expect(lock).toMatchObject({ variant: 'lock', draft: { trigger: { kind: 'state', to: 'unlocked' }, card: { title: 'Tür abschließen' }, done: { kind: 'state', to: 'locked' } } });
    expect(only([state('cover.rollo', 'open', { device_class: 'shutter' })], 'garage_lock')).toEqual([]);
  });

  it('Gefriertruhe zu warm: Temperatur mit Gefrierwörtern', () => {
    expect(one([state('sensor.gefriertruhe_temperatur', '-18', { device_class: 'temperature', friendly_name: 'Gefriertruhe' })], 'freezer_warm').reason).toBe('Gefriertruhe: Temperatur bei -18 °C');
    expect(only([state('sensor.wohnzimmer_temperatur', '21', { device_class: 'temperature', friendly_name: 'Wohnzimmer' })], 'freezer_warm')).toEqual([]);
  });

  it('Update und nicht erreichbare Geräte; ein schon belegtes Gerät bekommt keinen zweiten Treffer', () => {
    expect(one([state('update.home_assistant_core_update', 'off', { friendly_name: 'Home Assistant Core' })], 'update').entityId).toBe('update.home_assistant_core_update');
    const gone = state('sensor.tuer_batterie', 'unavailable', { device_class: 'battery', friendly_name: 'Tür Batterie' });
    expect(one([gone], 'unavailable').entityId).toBe('sensor.tuer_batterie');
    // ein Fenstersensor, der nicht erreichbar ist, ist schon „Fenster lange offen“ und kommt nicht doppelt
    const window = state('binary_sensor.fenster', 'unavailable', { device_class: 'window', friendly_name: 'Fenster' });
    expect(only([window], 'window_open')).toHaveLength(1);
    expect(only([window], 'unavailable')).toEqual([]);
    // erreichbare Geräte erscheinen nicht
    expect(only([state('sensor.ok_batterie', '50', { device_class: 'battery' })], 'unavailable')).toEqual([]);
    expect(only([state('light.flur', 'unavailable')], 'unavailable')).toEqual([]);
  });

  it('jede neue Vorlage hat Titel, Hinweis, Aufgabe und eine ehrliche Aussage zum Erledigen (Begründung, wo nichts belegt werden kann)', () => {
    const news = watcherTemplates().filter((x) => x.kind === 'watcher').slice(7);
    expect(news).toHaveLength(19);
    for (const x of news) {
      expect(x.title).toBeTruthy();
      expect(x.hint).toBeTruthy();
      expect(x.draft!.card.title).toBeTruthy();
      expect(x.canSelfComplete).toBe(x.draft!.done !== null);
      if (!x.canSelfComplete) expect(x.whyNoSelfComplete).toBeTruthy();
    }
    expect(news.filter((x) => !x.canSelfComplete).map((x) => x.id)).toEqual(['leak', 'mail', 'freezer_warm', 'unavailable']);
  });

  it('alle Texte der neuen Vorlagen gibt es auf Englisch', () => {
    const de = watcherTemplates().filter((x) => x.kind === 'watcher').slice(7);
    const en = withLanguage('en', () => watcherTemplates().filter((x) => x.kind === 'watcher').slice(7));
    for (const [i, x] of de.entries()) {
      expect(en[i]!.title).not.toBe(x.title);
      expect(en[i]!.hint).not.toBe(x.hint);
      expect(en[i]!.draft!.card.title.length).toBeGreaterThan(0);
    }
  });
});

// ---------- Neue wiederkehrende Vorlagen (ohne Gerät) ----------

describe('Neue wiederkehrende Vorlagen', () => {
  const EXPECTED: Record<string, { freq: string; every: number }> = {
    fridge_clean: { freq: 'monthly', every: 3 },
    oven_clean: { freq: 'monthly', every: 3 },
    windows: { freq: 'monthly', every: 6 },
    radiators: { freq: 'yearly', every: 1 },
    tyres: { freq: 'monthly', every: 6 },
    gutter: { freq: 'yearly', every: 1 },
    washer_hygiene: { freq: 'monthly', every: 1 },
    shower_head: { freq: 'monthly', every: 3 },
    drains: { freq: 'monthly', every: 2 },
    first_aid: { freq: 'yearly', every: 1 },
    extinguisher: { freq: 'yearly', every: 2 },
    mattress: { freq: 'monthly', every: 3 },
    fertilize: { freq: 'weekly', every: 4 },
  };

  it('13 neue Vorlagen mit der vorgesehenen Wiederholung, ohne Wächter', () => {
    const list = watcherTemplates().filter((x) => x.kind === 'recurring');
    expect(list.map((x) => x.id)).toEqual(['descale', 'smoke', 'filter', 'bedding', ...Object.keys(EXPECTED)]);
    for (const [id, want] of Object.entries(EXPECTED)) {
      const tpl = list.find((x) => x.id === id)!;
      expect(tpl.recurring?.recurrence, id).toEqual({ type: 'fixed', ...want });
      expect(tpl.draft).toBeNull();
      expect(tpl.recurring?.title).toBeTruthy();
    }
  });

  it('jede hat einen Hinweis, auch auf Englisch (nicht dieselben Worte wie auf Deutsch)', () => {
    const de = watcherTemplates().filter((x) => x.id in EXPECTED);
    const en = withLanguage('en', () => watcherTemplates().filter((x) => x.id in EXPECTED));
    expect(de).toHaveLength(13);
    for (const [i, x] of de.entries()) {
      expect(x.hint.trim(), x.id).not.toBe('');
      expect(en[i]!.hint.trim(), x.id).not.toBe('');
      expect(en[i]!.hint, x.id).not.toBe(x.hint);
      expect(en[i]!.title, x.id).not.toBe(x.title);
      expect(en[i]!.recurring?.title, x.id).not.toBe(x.recurring?.title);
    }
  });

  it('Reifen und Heizung nennen den Zeitpunkt im Hinweis', () => {
    const byId = new Map(watcherTemplates().map((x) => [x.id, x]));
    expect(byId.get('radiators')!.hint).toMatch(/Herbst/);
    expect(byId.get('tyres')!.hint).toMatch(/Oktober/);
  });

  it('die Wiederholungen sind für den Server gültig', async () => {
    const { parseRecurrence } = await import('../src/store/validate.js');
    for (const id of Object.keys(EXPECTED)) {
      const tpl = watcherTemplates().find((x) => x.id === id)!;
      expect(() => parseRecurrence(tpl.recurring!.recurrence), id).not.toThrow();
    }
  });
});
