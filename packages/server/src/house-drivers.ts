import type { HaState } from './ha.js';

/**
 * Die zwei Wege ins Haus: eine Ansage über einen Lautsprecher und eine Lampe, die kurz aufleuchtet.
 * Alles läuft über feste Dienste von Home Assistant (`tts.speak`, `media_player.volume_set`, `light.turn_on`, `scene.*`),
 * es gibt keine freien Aufrufe. Zeitgeber werden eingespritzt, damit Tests nicht warten müssen.
 */

/** Was schiefging: `no_tts` (kein Sprachdienst gewählt), `ha_error` (Home Assistant hat den Aufruf abgelehnt oder war nicht erreichbar) */
export class HouseFailure extends Error {
  constructor(
    readonly code: 'no_tts' | 'ha_error',
    readonly detail = '',
  ) {
    super(detail || code);
  }
}

export interface HouseHa {
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>;
  getStates(): Promise<HaState[]>;
}

export interface HouseDriverDeps {
  ha: HouseHa;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  log?: { warn: (msg: string) => void };
}

export interface SpeakTarget {
  id: string;
  entityId: string;
  /** Lautstärke in Prozent; null = nicht anfassen */
  volume: number | null;
}

export interface LightTarget {
  id: string;
  entityId: string;
}

/** So lange leuchtet die Lampe */
export const LIGHT_MS = 5000;
const SCENE_PREFIX = 'stups_haus_';

/** Geschätzte Sprechdauer: Länge des Satzes × 0,08 s + 3 s. Danach wird die Lautstärke zurückgestellt. */
export const estimateSpeechMs = (text: string): number => Math.round((text.length * 0.08 + 3) * 1000);

export function createHouseDrivers(deps: HouseDriverDeps) {
  const { ha } = deps;

  async function call(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    try {
      await ha.callService(domain, service, data);
    } catch (err) {
      throw new HouseFailure('ha_error', `${domain}.${service}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const warn = (msg: string) => deps.log?.warn(msg);

  // ---------- Ansage ----------

  /** Lautsprecher, deren Lautstärke wir verändert haben: auf welchen Wert es zurückgeht und wann */
  const volumes = new Map<string, { previous: number | null; timer: unknown }>();

  async function restoreVolume(entityId: string): Promise<void> {
    const entry = volumes.get(entityId);
    volumes.delete(entityId);
    if (!entry || entry.previous === null) return;
    try {
      await call('media_player', 'volume_set', { entity_id: entityId, volume_level: entry.previous });
    } catch (err) {
      warn(`Lautstärke von ${entityId} konnte nicht zurückgestellt werden: ${String(err)}`);
    }
  }

  async function currentVolume(entityId: string): Promise<number | null> {
    try {
      const level = (await ha.getStates()).find((s) => s.entity_id === entityId)?.attributes?.volume_level;
      return typeof level === 'number' ? level : null;
    } catch {
      return null;
    }
  }

  async function speak(channel: SpeakTarget, text: string, opts: { tts: string | null; language: 'de' | 'en' }): Promise<void> {
    if (!opts.tts) throw new HouseFailure('no_tts');
    let changedVolume = false;
    if (channel.volume !== null) {
      const running = volumes.get(channel.entityId);
      // Läuft schon eine Rückstellung, bleibt der Wert von vor der ersten Ansage der, auf den es zurückgeht
      const previous = running ? running.previous : await currentVolume(channel.entityId);
      if (running) deps.clearTimer(running.timer);
      volumes.set(channel.entityId, { previous, timer: null });
      await call('media_player', 'volume_set', { entity_id: channel.entityId, volume_level: channel.volume / 100 });
      changedVolume = true;
    }
    try {
      await call('tts', 'speak', {
        entity_id: opts.tts,
        media_player_entity_id: channel.entityId,
        message: text,
        language: opts.language,
        cache: true,
      });
    } catch (err) {
      if (changedVolume) await restoreVolume(channel.entityId);
      throw err;
    }
    const entry = volumes.get(channel.entityId);
    if (changedVolume && entry) {
      // Ohne bekannten früheren Wert gibt es nichts zurückzustellen
      if (entry.previous === null) volumes.delete(channel.entityId);
      else {
        // Ein Zeitgeber einer gleichzeitigen Ansage wird ersetzt, nicht daneben stehen gelassen (er stellte sonst zu früh zurück)
        if (entry.timer !== null) deps.clearTimer(entry.timer);
        entry.timer = deps.setTimer(() => void restoreVolume(channel.entityId), estimateSpeechMs(text));
      }
    }
  }

  // ---------- Lampe ----------

  /** Lampen, die gerade leuchten: Name der gemerkten Szene und Zeitgeber */
  const lights = new Map<string, { sceneId: string; timer: unknown }>();

  async function restoreLight(entityId: string): Promise<void> {
    const entry = lights.get(entityId);
    lights.delete(entityId);
    if (!entry) return;
    const scene = `scene.${entry.sceneId}`;
    try {
      await call('scene', 'turn_on', { entity_id: scene });
    } catch (err) {
      warn(`Lampe ${entityId} konnte nicht zurückgestellt werden: ${String(err)}`);
    }
    try {
      await call('scene', 'delete', { entity_id: scene });
    } catch (err) {
      warn(`Szene ${scene} konnte nicht gelöscht werden: ${String(err)}`);
    }
  }

  async function light(channel: LightTarget, rgb: [number, number, number]): Promise<void> {
    const active = lights.get(channel.entityId);
    if (active) {
      // Leuchtet schon: verlängern, keinen zweiten Zustand merken (sonst bliebe die Lampe an)
      if (active.timer !== null) {
        deps.clearTimer(active.timer);
        active.timer = deps.setTimer(() => void restoreLight(channel.entityId), LIGHT_MS);
      }
      return;
    }
    const sceneId = `${SCENE_PREFIX}${channel.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    // Kann der Zustand nicht gemerkt werden, leuchtet die Lampe nicht: sie ließe sich nicht zurückstellen
    await call('scene', 'create', { scene_id: sceneId, snapshot_entities: [channel.entityId] });
    const entry = { sceneId, timer: null as unknown };
    lights.set(channel.entityId, entry);
    try {
      await call('light', 'turn_on', { entity_id: channel.entityId, rgb_color: rgb, brightness_pct: 100 });
    } catch (err) {
      await restoreLight(channel.entityId);
      throw err;
    }
    entry.timer = deps.setTimer(() => void restoreLight(channel.entityId), LIGHT_MS);
  }

  /** Beim Start: Szenen, die ein Neustart mitten im Leuchten zurückgelassen hat, abspielen und löschen */
  async function cleanup(): Promise<number> {
    let states: HaState[];
    try {
      states = await ha.getStates();
    } catch {
      return 0;
    }
    let n = 0;
    for (const s of states) {
      if (!s.entity_id.startsWith(`scene.${SCENE_PREFIX}`)) continue;
      try {
        await call('scene', 'turn_on', { entity_id: s.entity_id });
        await call('scene', 'delete', { entity_id: s.entity_id });
        n += 1;
      } catch (err) {
        warn(`Szene ${s.entity_id} konnte nicht aufgeräumt werden: ${String(err)}`);
      }
    }
    return n;
  }

  return { speak, light, cleanup };
}

export type HouseDrivers = ReturnType<typeof createHouseDrivers>;
