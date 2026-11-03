import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { avatarMime, createAvatars, MAX_AVATAR_BYTES, type AvatarHa } from '../src/avatars.js';
import { openDb } from '../src/db.js';
import { ValidationError } from '../src/errors.js';
import { createStore, type Store } from '../src/store.js';
import type { HaState } from '../src/ha.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

class FakeAvatarHa implements AvatarHa {
  states: HaState[] = [];
  pictures = new Map<string, Buffer | null>();
  fetches: string[] = [];
  connected: (() => void)[] = [];
  subs = new Map<string, (e: Record<string, any>) => void>();
  async getStates() {
    return this.states;
  }
  async fetchPicture(path: string) {
    this.fetches.push(path);
    return this.pictures.get(path) ?? null;
  }
  subscribe(key: string, _payload: Record<string, unknown>, onEvent: (e: Record<string, any>) => void) {
    this.subs.set(key, onEvent);
    return () => this.subs.delete(key);
  }
  unsubscribe(key: string) {
    this.subs.delete(key);
  }
  onConnected(cb: () => void) {
    this.connected.push(cb);
  }
}

let store: Store;
let ha: FakeAvatarHa;
let dir: string;
let anna: string;

beforeEach(() => {
  store = createStore(openDb(':memory:'));
  anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  ha = new FakeAvatarHa();
  ha.states = [{ entity_id: 'person.anna', state: 'home', attributes: { friendly_name: 'Anna', user_id: 'ha-anna', entity_picture: '/api/image_proxy/person.anna?token=a1' } }];
  ha.pictures.set('/api/image_proxy/person.anna?token=a1', JPEG);
  dir = mkdtempSync(join(tmpdir(), 'stups-avatars-'));
});

describe('Bildtyp', () => {
  it('nur JPEG, PNG und WebP; SVG und GIF nicht', () => {
    expect(avatarMime(PNG)).toBe('image/png');
    expect(avatarMime(JPEG)).toBe('image/jpeg');
    expect(avatarMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))).toBe('image/webp');
    expect(avatarMime(SVG)).toBeNull();
    expect(avatarMime(Buffer.from('GIF89a....'))).toBeNull();
  });
});

describe('Bild hochladen', () => {
  it('speichert, zählt die Fassung hoch und liest zurück', () => {
    const av = createAvatars({ dir, store });
    expect(av.save(anna, PNG)).toBe(1);
    expect(av.read(anna)).toMatchObject({ mime: 'image/png' });
    expect(av.read(anna)!.data.equals(PNG)).toBe(true);
    expect(av.save(anna, JPEG)).toBe(2);
    expect(store.userById(anna)?.avatarRev).toBe(2);
  });

  it('lehnt falschen Typ, leere Dateien und zu große Bilder ab, ohne etwas zu ändern', () => {
    const av = createAvatars({ dir, store });
    expect(() => av.save(anna, SVG)).toThrow(ValidationError);
    expect(() => av.save(anna, Buffer.alloc(0))).toThrow(ValidationError);
    expect(() => av.save(anna, Buffer.concat([PNG, Buffer.alloc(MAX_AVATAR_BYTES)]))).toThrow(ValidationError);
    expect(av.read(anna)).toBeNull();
    expect(store.userById(anna)?.avatarRev).toBeNull();
  });

  it('ohne Bild gibt read null (Initiale bleibt)', () => {
    expect(createAvatars({ dir, store }).read(anna)).toBeNull();
  });
});

describe('Bild aus Home Assistant', () => {
  it('holt das Bild der zugeordneten Person, nur einmal, solange sich nichts ändert', async () => {
    const av = createAvatars({ dir, store, ha });
    await av.refresh();
    expect(store.avatarSource(anna)).toBe('ha');
    expect(av.read(anna)!.data.equals(JPEG)).toBe(true);
    await av.refresh();
    expect(ha.fetches).toHaveLength(1);
  });

  it('holt neu, wenn sich entity_picture ändert (Zustandswechsel der Person)', async () => {
    const av = createAvatars({ dir, store, ha });
    await av.refresh();
    ha.states[0]!.attributes!.entity_picture = '/api/image_proxy/person.anna?token=b2';
    ha.pictures.set('/api/image_proxy/person.anna?token=b2', PNG);
    ha.subs.get('avatars')!({ variables: { trigger: { from_state: { attributes: { entity_picture: 'alt' } }, to_state: { attributes: { entity_picture: 'neu' } } } } });
    await new Promise((r) => setTimeout(r, 10));
    expect(av.read(anna)!.mime).toBe('image/png');
    expect(store.userById(anna)?.avatarRev).toBe(2);
  });

  it('ein Wechsel zwischen „zu Hause" und „unterwegs" holt nichts', async () => {
    const av = createAvatars({ dir, store, ha });
    await av.refresh();
    ha.subs.get('avatars')!({ variables: { trigger: { from_state: { attributes: { entity_picture: 'x' } }, to_state: { attributes: { entity_picture: 'x' } } } } });
    await new Promise((r) => setTimeout(r, 10));
    expect(ha.fetches).toHaveLength(1);
  });

  it('ein hochgeladenes Bild hat Vorrang und wird nie überschrieben', async () => {
    const av = createAvatars({ dir, store, ha });
    av.save(anna, PNG);
    await av.refresh();
    expect(store.avatarSource(anna)).toBe('upload');
    expect(av.read(anna)!.data.equals(PNG)).toBe(true);
    expect(ha.fetches).toHaveLength(0);
  });

  it('Bild entfernen fällt auf das Bild aus Home Assistant zurück, ohne HA-Bild auf die Initiale', async () => {
    const av = createAvatars({ dir, store, ha });
    await av.refresh();
    av.save(anna, PNG);
    await av.remove(anna);
    expect(store.avatarSource(anna)).toBe('ha');
    expect(av.read(anna)!.data.equals(JPEG)).toBe(true);
    ha.states[0]!.attributes!.entity_picture = undefined;
    await av.refresh();
    expect(store.avatarSource(anna)).toBeNull();
    expect(existsSync(join(dir, `${anna}.img`))).toBe(false);
  });

  it('nimmt nur Pfade auf Home Assistant, ungültige Bilder werden übergangen', async () => {
    ha.states[0]!.attributes!.entity_picture = 'https://fremd.example/bild.png';
    const av = createAvatars({ dir, store, ha });
    await av.refresh();
    expect(ha.fetches).toHaveLength(0);
    expect(store.avatarSource(anna)).toBeNull();
    ha.states[0]!.attributes!.entity_picture = '/local/anna.png';
    ha.pictures.set('/local/anna.png', SVG);
    await av.refresh();
    expect(store.avatarSource(anna)).toBeNull();
  });

  it('Home Assistant nicht erreichbar: kein Absturz, Upload geht trotzdem', async () => {
    ha.getStates = async () => {
      throw new Error('nicht erreichbar');
    };
    const av = createAvatars({ dir, store, ha });
    await expect(av.refresh()).resolves.toBeUndefined();
    expect(av.save(anna, PNG)).toBe(1);
  });

  it('das Bild liegt als Datei im Ordner der Bilder', async () => {
    const av = createAvatars({ dir, store, ha });
    await av.refresh();
    expect(readFileSync(join(dir, `${anna}.img`)).equals(JPEG)).toBe(true);
  });
});
