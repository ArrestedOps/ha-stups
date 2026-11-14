import { describe, expect, it } from 'vitest';
import type { HaState } from '../src/ha.js';
import { detectSuggestions, MAX_SUGGESTIONS, suggestionKey, watcherTemplates } from '../src/watcher-templates.js';

const state = (entityId: string, st: string, attributes: Record<string, unknown> = {}): HaState => ({ entity_id: entityId, state: st, attributes });
const ids = (list: { templateId: string; entityId: string }[]) => list.map((s) => `${s.templateId}:${s.entityId}`);

describe('Vorlagen', () => {
  it('alle Vorlagen aus dem Entwurf sind da: sieben mit Gerät, vier ohne', () => {
    const list = watcherTemplates();
    expect(list.filter((x) => x.kind === 'watcher').map((x) => x.id)).toEqual(['washer', 'dryer', 'dishwasher', 'bins', 'rain', 'battery', 'vacuum']);
    expect(list.filter((x) => x.kind === 'recurring').map((x) => x.id)).toEqual(['descale', 'smoke', 'filter', 'bedding']);
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
    expect(ids(list)).toContain('dryer:sensor.steckdose_trockner_power');
  });

  it('der Kühlschrank (Leistung, aber kein Gerätename) und der Familienkalender treffen nichts; ein Sensor ohne Zahl fehlt bei den Batterien', () => {
    const list = ids(detectSuggestions(states, new Set()));
    expect(list.some((x) => x.includes('kuehlschrank') || x.includes('calendar.familie') || x.includes('kaputt'))).toBe(false);
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
    expect(ids(detectSuggestions(states, new Set(), hidden))).toEqual(['battery:sensor.batt_b', 'vacuum:vacuum.robi']);
    expect(ids(detectSuggestions(states, new Set()))).toEqual(['battery:sensor.batt_a', 'battery:sensor.batt_b', 'vacuum:vacuum.robi']);
  });

  it('beim Ausblenden bleiben alle übrigen Treffer, in derselben Reihenfolge', () => {
    const many = Array.from({ length: 7 }, (_, i) => state(`sensor.b${i}`, String(10 + i), { device_class: 'battery' }));
    const hidden = new Set([suggestionKey('battery', 'sensor.b0')]);
    expect(detectSuggestions(many, new Set(), hidden).map((s) => s.entityId)).toEqual(['sensor.b1', 'sensor.b2', 'sensor.b3', 'sensor.b4', 'sensor.b5', 'sensor.b6']);
  });
});
