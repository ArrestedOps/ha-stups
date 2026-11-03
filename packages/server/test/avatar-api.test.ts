import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { createAvatars } from '../src/avatars.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef');
const anna = as('ha-anna', 'Anna');
const ben = as('ha-ben', 'Ben');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

let app: FastifyInstance;
let annaId: string;
let benId: string;

beforeEach(async () => {
  const store = createStore(openDb(':memory:'));
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  store.addPerson({ haUserId: 'ha-chef', name: 'Chef' });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    avatars: createAvatars({ dir: mkdtempSync(join(tmpdir(), 'stups-av-')), store }),
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
  });
});

const put = (who: object, id: string, payload: Buffer, type = 'image/png') =>
  app.inject({ method: 'PUT', url: `/api/people/${id}/avatar`, headers: { ...(who as Record<string, string>), 'content-type': type }, payload });
const get = (who: object, id: string, rev = '') => app.inject({ method: 'GET', url: `/api/people/${id}/avatar${rev}`, headers: who as Record<string, string> });
const del = (who: object, id: string) => app.inject({ method: 'DELETE', url: `/api/people/${id}/avatar`, headers: who as Record<string, string> });

describe('Bilder der Personen: Schnittstelle', () => {
  it('ohne Bild 404 (die Oberfläche zeigt die Initiale)', async () => {
    expect((await get(anna, annaId)).statusCode).toBe(404);
  });

  it('die eigene Person lädt ein Bild hoch, jeder kann es ansehen, mit ?rev= darf es lange im Cache bleiben', async () => {
    const res = await put(anna, annaId, PNG);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: annaId, avatarRev: 1 });
    const seen = await get(ben, annaId, '?rev=1');
    expect(seen.statusCode).toBe(200);
    expect(seen.headers['content-type']).toBe('image/png');
    expect(seen.headers['cache-control']).toContain('immutable');
    expect(seen.headers['x-content-type-options']).toBe('nosniff');
    expect((await get(ben, annaId)).headers['cache-control']).toBe('private, no-cache');
  });

  it('ein Mitglied ändert nicht das Bild einer anderen Person, ein Administrator schon', async () => {
    expect((await put(ben, annaId, PNG)).statusCode).toBe(403);
    expect((await del(ben, annaId)).statusCode).toBe(403);
    expect((await put(chef, annaId, PNG)).statusCode).toBe(200);
    expect((await del(chef, annaId)).statusCode).toBe(204);
    expect((await get(anna, annaId)).statusCode).toBe(404);
  });

  it('lehnt SVG (auch als „image/png" getarnt), anderen Inhalt und zu große Bilder ab', async () => {
    expect((await put(anna, annaId, SVG, 'image/png')).statusCode).toBe(400);
    expect((await put(anna, annaId, SVG, 'image/svg+xml')).statusCode).toBe(400);
    expect((await put(anna, annaId, Buffer.from('<html>'), 'text/html')).statusCode).toBe(400);
    expect((await put(anna, annaId, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]))).statusCode).toBe(400);
    expect((await put(anna, annaId, Buffer.alloc(3 * 1024 * 1024, 1))).statusCode).toBe(413);
    expect((await put(anna, annaId, Buffer.alloc(0))).statusCode).toBe(400);
    expect((await get(anna, annaId)).statusCode).toBe(404);
  });

  it('unbekannte Person: 404', async () => {
    expect((await put(chef, 'gibt-es-nicht', PNG)).statusCode).toBe(404);
  });

  it('die Person in /api/people trägt avatarRev', async () => {
    await put(anna, annaId, PNG);
    const people = (await app.inject({ method: 'GET', url: '/api/people', headers: ben as Record<string, string> })).json() as { id: string; avatarRev: number | null }[];
    expect(people.find((p) => p.id === annaId)?.avatarRev).toBe(1);
    expect(people.find((p) => p.id === benId)?.avatarRev).toBeNull();
  });
});
