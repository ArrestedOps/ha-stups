import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationError } from './errors.js';
import { sniffMime } from './files.js';
import type { HaState } from './ha.js';
import { t } from './i18n/index.js';
import { personEntity } from './presence.js';
import type { Store } from './store.js';

/** Größtes Personenbild in Bytes (hochgeladen oder aus Home Assistant) */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export type AvatarMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Nur diese drei Typen; SVG, GIF und alles andere bleiben draußen (am Inhalt erkannt, nicht am Namen) */
export function avatarMime(bytes: Buffer): AvatarMime | null {
  const mime = sniffMime(bytes);
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' ? mime : null;
}

/** Was die Bilder aus Home Assistant brauchen (HaClient bringt es mit, die Tests setzen eine Attrappe ein) */
export interface AvatarHa {
  getStates(): Promise<HaState[]>;
  /** Holt ein Bild von Home Assistant (Pfad wie in `entity_picture`); null, wenn es keins gibt */
  fetchPicture(path: string): Promise<Buffer | null>;
  subscribe(key: string, payload: Record<string, unknown>, onEvent: (event: Record<string, any>) => void): () => void;
  unsubscribe(key: string): void;
  onConnected(cb: () => void): void;
}

export interface AvatarDeps {
  dir: string;
  store: Store;
  ha?: AvatarHa;
  log?: { info(m: string): void; warn(m: string): void };
}

/**
 * Bilder der Personen: je Person eine Datei `<dir>/<userId>.img` (gehört zum Backup und zum Umzug). Quelle ist Home Assistant
 * (`entity_picture` der zugeordneten `person.*`) oder ein Upload; ein Upload hat Vorrang. Der Browser holt Bilder immer von Stups,
 * nie direkt von Home Assistant.
 */
export function createAvatars(deps: AvatarDeps) {
  const { dir, store, ha } = deps;
  const log = deps.log ?? { info: () => undefined, warn: () => undefined };
  mkdirSync(dir, { recursive: true });

  const file = (userId: string) => join(dir, `${userId.replace(/[^A-Za-z0-9-]/g, '')}.img`);
  /** Zuletzt aus Home Assistant geholter `entity_picture` je Person (erkennt Änderungen) */
  const fetched = new Map<string, string>();
  /** Der Pfad aus dem letzten Abgleich, auch bei Personen mit Upload (für „Bild entfernen" → zurück zum HA-Bild) */
  const known = new Map<string, string>();

  function read(userId: string): { data: Buffer; mime: AvatarMime } | null {
    if (!store.avatarSource(userId)) return null;
    try {
      const data = readFileSync(file(userId));
      const mime = avatarMime(data);
      return mime ? { data, mime } : null;
    } catch {
      return null;
    }
  }

  function write(userId: string, bytes: Buffer): void {
    const target = file(userId);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, target);
  }

  /** Eigenes Bild hochladen (prüft Typ und Größe). Gibt die neue Fassung zurück. */
  function save(userId: string, bytes: Buffer): number {
    if (bytes.length === 0) throw new ValidationError(t('Es fehlt das Bild'));
    if (bytes.length > MAX_AVATAR_BYTES) throw new ValidationError(t('Das Bild ist zu groß (höchstens 2 MB)'));
    if (!avatarMime(bytes)) throw new ValidationError(t('Dieser Bildtyp ist nicht erlaubt. Erlaubt sind JPEG, PNG und WebP'));
    write(userId, bytes);
    return store.setAvatar(userId, 'upload');
  }

  async function adoptHa(userId: string, path: string): Promise<void> {
    let bytes: Buffer | null;
    try {
      bytes = (await ha?.fetchPicture(path)) ?? null;
    } catch (err) {
      log.warn(`Bild von Home Assistant: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (!bytes || bytes.length > MAX_AVATAR_BYTES || !avatarMime(bytes)) return;
    write(userId, bytes);
    fetched.set(userId, path);
    store.setAvatar(userId, 'ha');
  }

  /** „Bild entfernen": ein hochgeladenes Bild fällt auf das aus Home Assistant zurück, sonst auf die Initiale */
  async function remove(userId: string): Promise<void> {
    const source = store.avatarSource(userId);
    if (!source) return;
    rmSync(file(userId), { force: true });
    store.clearAvatar(userId);
    fetched.delete(userId);
    const path = known.get(userId);
    if (source === 'upload' && path) await adoptHa(userId, path);
  }

  /** Gleicht die Bilder mit den Personen in Home Assistant ab (beim Start und bei Änderungen) */
  async function syncFromHa(states: HaState[]): Promise<void> {
    const persons = states.filter((s) => s.entity_id.startsWith('person.'));
    for (const p of store.people()) {
      const entity = personEntity(p, persons);
      const picture = entity?.attributes?.entity_picture;
      const path = typeof picture === 'string' && picture.startsWith('/') ? picture : null;
      if (path) known.set(p.id, path);
      else known.delete(p.id);
      const source = store.avatarSource(p.id);
      if (source === 'upload') continue;
      if (!path) {
        // das Bild in Home Assistant ist weg: unser Abbild auch
        if (source === 'ha') {
          rmSync(file(p.id), { force: true });
          store.clearAvatar(p.id);
          fetched.delete(p.id);
        }
        continue;
      }
      if (source === 'ha' && fetched.get(p.id) === path && existsSync(file(p.id))) continue;
      await adoptHa(p.id, path);
    }
  }

  async function refresh(): Promise<void> {
    if (!ha) return;
    try {
      const states = await ha.getStates();
      await syncFromHa(states);
      const entities = states.filter((s) => s.entity_id.startsWith('person.')).map((s) => s.entity_id);
      if (entities.length === 0) return;
      ha.subscribe('avatars', { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: entities } }, (ev) => {
        const to = ev.variables?.trigger?.to_state;
        const from = ev.variables?.trigger?.from_state;
        // nur wenn sich das Bild geändert hat (nicht bei jedem Wechsel zwischen „zu Hause" und „unterwegs")
        if (to?.attributes?.entity_picture === from?.attributes?.entity_picture) return;
        void ha.getStates().then(syncFromHa).catch((err) => log.warn(`Bilder: ${String(err)}`));
      });
    } catch (err) {
      log.warn(`Bilder aus Home Assistant: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Beim Start und nach jeder (Wieder-)Verbindung abgleichen */
  function start(): void {
    ha?.onConnected(() => void refresh());
  }

  return { read, save, remove, syncFromHa, refresh, start, dir };
}

export type Avatars = ReturnType<typeof createAvatars>;
