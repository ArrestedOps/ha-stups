import { beforeEach, describe, expect, it } from 'vitest';
import type { HaState } from '../src/ha.js';
import { createHouseDrivers, estimateSpeechMs, HouseFailure } from '../src/house-drivers.js';

interface Call {
  domain: string;
  service: string;
  data: Record<string, any>;
}

let calls: Call[];
let states: HaState[];
let failOn: string | null;
let timers: { id: number; fn: () => void; ms: number; cleared: boolean }[];

const ha = {
  callService: async (domain: string, service: string, data: Record<string, unknown>) => {
    if (failOn === `${domain}.${service}`) throw new Error(`HA: ${domain}.${service} fehlgeschlagen`);
    calls.push({ domain, service, data });
  },
  getStates: async () => states,
};

const drivers = () =>
  createHouseDrivers({
    ha,
    setTimer: (fn, ms) => {
      const t = { id: timers.length, fn, ms, cleared: false };
      timers.push(t);
      return t.id;
    },
    clearTimer: (h) => {
      const t = timers[h as number];
      if (t) t.cleared = true;
    },
  });

/** Löst den (noch nicht gelöschten) Zeitgeber aus, der zuletzt gesetzt wurde */
const fireLast = async () => {
  const t = [...timers].reverse().find((x) => !x.cleared)!;
  t.cleared = true;
  t.fn();
  await Promise.resolve();
  await new Promise((r) => setImmediate(r));
};
const names = () => calls.map((c) => `${c.domain}.${c.service}`);

beforeEach(() => {
  calls = [];
  failOn = null;
  timers = [];
  states = [
    { entity_id: 'media_player.kinderzimmer', state: 'idle', attributes: { volume_level: 0.3 } },
    { entity_id: 'light.flur', state: 'off', attributes: {} },
  ] as HaState[];
});

describe('Ansage', () => {
  const channel = { id: 'k1', entityId: 'media_player.kinderzimmer', volume: null as number | null };

  it('ruft tts.speak mit Sprachdienst, Lautsprecher, Satz und Sprache auf', async () => {
    await drivers().speak(channel, 'Ben, Müll rausbringen ist fällig.', { tts: 'tts.piper', language: 'de' });
    expect(calls).toEqual([
      { domain: 'tts', service: 'speak', data: { entity_id: 'tts.piper', media_player_entity_id: 'media_player.kinderzimmer', message: 'Ben, Müll rausbringen ist fällig.', language: 'de', cache: true } },
    ]);
    expect(timers).toEqual([]); // ohne Lautstärke nichts zurückzustellen
  });

  it('ohne gewählten Sprachdienst: Fehler mit Kennung, kein Aufruf', async () => {
    const err = await drivers()
      .speak(channel, 'Hallo', { tts: null, language: 'de' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(HouseFailure);
    expect(err.code).toBe('no_tts');
    expect(calls).toEqual([]);
  });

  it('ein Fehler von Home Assistant wird zum Fehler mit Kennung und Einzelheit', async () => {
    failOn = 'tts.speak';
    const err = await drivers()
      .speak(channel, 'Hallo', { tts: 'tts.piper', language: 'de' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(HouseFailure);
    expect(err.code).toBe('ha_error');
    expect(err.detail).toContain('tts.speak');
  });

  it('mit Lautstärke: erst setzen, dann ansagen, nach der Sprechdauer auf den früheren Wert zurück', async () => {
    const d = drivers();
    await d.speak({ ...channel, volume: 70 }, 'Ben, Müll rausbringen ist fällig.', { tts: 'tts.piper', language: 'de' });
    expect(names()).toEqual(['media_player.volume_set', 'tts.speak']);
    expect(calls[0]!.data).toEqual({ entity_id: 'media_player.kinderzimmer', volume_level: 0.7 });
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(estimateSpeechMs('Ben, Müll rausbringen ist fällig.'));

    await fireLast();
    expect(names()).toEqual(['media_player.volume_set', 'tts.speak', 'media_player.volume_set']);
    expect(calls[2]!.data).toEqual({ entity_id: 'media_player.kinderzimmer', volume_level: 0.3 });
  });

  it('zwei Ansagen kurz nacheinander: die erste Lautstärke bleibt die, auf die zurückgestellt wird', async () => {
    const d = drivers();
    const c = { ...channel, volume: 70 };
    await d.speak(c, 'Eins', { tts: 'tts.piper', language: 'de' });
    states = [{ entity_id: 'media_player.kinderzimmer', state: 'playing', attributes: { volume_level: 0.7 } }] as HaState[];
    await d.speak(c, 'Zwei', { tts: 'tts.piper', language: 'de' });
    expect(timers[0]!.cleared).toBe(true); // der erste Zeitgeber wurde durch den zweiten ersetzt
    await fireLast();
    expect(calls.at(-1)!.data.volume_level).toBe(0.3);
    expect(names().filter((n) => n === 'media_player.volume_set')).toHaveLength(3); // zweimal setzen, einmal zurück
  });

  it('zwei gleichzeitige Ansagen: nur ein Zeitgeber bleibt übrig (der alte wird gelöscht), die Lautstärke geht einmal zurück', async () => {
    const d = drivers();
    const c = { ...channel, volume: 70 };
    await Promise.all([d.speak(c, 'Eins', { tts: 'tts.piper', language: 'de' }), d.speak(c, 'Zwei', { tts: 'tts.piper', language: 'de' })]);
    const live = timers.filter((x) => !x.cleared);
    expect(live).toHaveLength(1);
    await fireLast();
    expect(names().filter((n) => n === 'media_player.volume_set').length).toBeGreaterThanOrEqual(3);
    expect(calls.at(-1)!.data.volume_level).toBe(0.3);
    expect(timers.filter((x) => !x.cleared)).toHaveLength(0);
  });

  it('kennt der Lautsprecher seine Lautstärke nicht, wird nur gesetzt und nichts zurückgestellt', async () => {
    states = [{ entity_id: 'media_player.kinderzimmer', state: 'off', attributes: {} }] as HaState[];
    await drivers().speak({ ...channel, volume: 50 }, 'Hallo', { tts: 'tts.piper', language: 'en' });
    expect(names()).toEqual(['media_player.volume_set', 'tts.speak']);
    expect(timers).toEqual([]);
  });

  it('die Sprechdauer wächst mit der Länge des Satzes', () => {
    expect(estimateSpeechMs('a'.repeat(50))).toBe(Math.round((50 * 0.08 + 3) * 1000));
    expect(estimateSpeechMs('')).toBe(3000);
  });
});

describe('Lampe', () => {
  const channel = { id: 'a1b2-c3', entityId: 'light.flur' };
  const orange: [number, number, number] = [245, 85, 0];

  it('merkt den Zustand in einer Szene, leuchtet in der Farbe, stellt nach 5 Sekunden zurück und räumt die Szene weg', async () => {
    const d = drivers();
    await d.light(channel, orange);
    expect(calls).toEqual([
      { domain: 'scene', service: 'create', data: { scene_id: 'stups_haus_a1b2_c3', snapshot_entities: ['light.flur'] } },
      { domain: 'light', service: 'turn_on', data: { entity_id: 'light.flur', rgb_color: [245, 85, 0], brightness_pct: 100 } },
    ]);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(5000);

    await fireLast();
    expect(calls.slice(2)).toEqual([
      { domain: 'scene', service: 'turn_on', data: { entity_id: 'scene.stups_haus_a1b2_c3' } },
      { domain: 'scene', service: 'delete', data: { entity_id: 'scene.stups_haus_a1b2_c3' } },
    ]);
  });

  it('ein zweiter Aufruf während des Leuchtens verlängert und legt keine zweite Szene an', async () => {
    const d = drivers();
    await d.light(channel, orange);
    await d.light(channel, orange);
    expect(names().filter((n) => n === 'scene.create')).toHaveLength(1);
    expect(timers).toHaveLength(2);
    expect(timers[0]!.cleared).toBe(true);
    expect(timers[1]!.ms).toBe(5000);
    await fireLast();
    expect(names().filter((n) => n === 'scene.turn_on')).toHaveLength(1);
  });

  it('nach dem Zurückstellen ist die Lampe wieder frei: der nächste Aufruf merkt den Zustand neu', async () => {
    const d = drivers();
    await d.light(channel, orange);
    await fireLast();
    await d.light(channel, orange);
    expect(names().filter((n) => n === 'scene.create')).toHaveLength(2);
  });

  it('kann die Szene nicht angelegt werden, leuchtet die Lampe nicht (sonst bliebe sie an)', async () => {
    failOn = 'scene.create';
    const err = await drivers()
      .light(channel, orange)
      .catch((e) => e);
    expect(err).toBeInstanceOf(HouseFailure);
    expect(err.code).toBe('ha_error');
    expect(names()).toEqual([]);
  });

  it('scheitert das Einschalten, wird der Zustand trotzdem zurückgestellt und aufgeräumt', async () => {
    failOn = 'light.turn_on';
    const err = await drivers()
      .light(channel, orange)
      .catch((e) => e);
    expect(err).toBeInstanceOf(HouseFailure);
    expect(names()).toEqual(['scene.create', 'scene.turn_on', 'scene.delete']);
  });
});

describe('Aufräumen beim Start', () => {
  it('spielt übrig gebliebene Stups-Szenen ab und löscht sie, andere Szenen bleiben unberührt', async () => {
    states = [
      { entity_id: 'scene.stups_haus_k1', state: 'unknown', attributes: {} },
      { entity_id: 'scene.film_abend', state: 'unknown', attributes: {} },
      { entity_id: 'scene.stups_haus_k2', state: 'unknown', attributes: {} },
    ] as HaState[];
    const n = await drivers().cleanup();
    expect(n).toBe(2);
    expect(calls).toEqual([
      { domain: 'scene', service: 'turn_on', data: { entity_id: 'scene.stups_haus_k1' } },
      { domain: 'scene', service: 'delete', data: { entity_id: 'scene.stups_haus_k1' } },
      { domain: 'scene', service: 'turn_on', data: { entity_id: 'scene.stups_haus_k2' } },
      { domain: 'scene', service: 'delete', data: { entity_id: 'scene.stups_haus_k2' } },
    ]);
  });

  it('ist Home Assistant nicht erreichbar, ist es kein Fehler (0 aufgeräumt)', async () => {
    const d = createHouseDrivers({
      ha: {
        callService: async () => undefined,
        getStates: async () => {
          throw new Error('offline');
        },
      },
      setTimer: () => 0,
      clearTimer: () => undefined,
    });
    expect(await d.cleanup()).toBe(0);
  });
});
