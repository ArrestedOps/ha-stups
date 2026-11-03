import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { createBetaGate } from '../src/beta-gate.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef'); // Administrator
const anna = as('ha-anna', 'Anna');

let app: FastifyInstance;
let store: Store;
let changes: boolean[];

async function build(beta: boolean) {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-11-02T10:00:00Z') });
  store.addPerson({ haUserId: 'ha-chef', name: 'Chef' });
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  changes = [];
  const gate = createBetaGate({
    enabled: beta,
    settings: { get: (k) => store.rawSetting(k), put: (k, v) => store.putRawSetting(k, v) },
    people: () => store.people().map((p) => p.id),
  });
  gate.onWatchers((on) => changes.push(on));
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    betaGate: gate,
    capabilities: { mode: 'addon', auth: 'ingress', channel: beta ? 'beta' : 'stable', ha: true, watchers: true, sensors: true, house: true, push: ['ha-notify'], publicUrl: null, passkeys: false },
  });
}

async function call(who: object, method: 'GET' | 'PUT', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}
const idOf = (name: string) => store.people().find((p) => p.name === name)!.id;

describe('Beta: Push und Wächter einstellen', () => {
  beforeEach(() => build(true));

  it('jeder Angemeldete sieht den Stand (für das Band in der Oberfläche)', async () => {
    const r = await call(anna, 'GET', '/api/beta');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ push: { mode: 'off' }, watchers: false });
  });

  it('nur Administratoren ändern ihn', async () => {
    expect((await call(anna, 'PUT', '/api/beta', { watchers: true })).status).toBe(403);
    expect((await call(anna, 'GET', '/api/beta')).body.watchers).toBe(false);
    const r = await call(chef, 'PUT', '/api/beta', { watchers: true, push: { mode: 'only', personId: idOf('Chef') } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ push: { mode: 'only', personId: idOf('Chef') }, watchers: true });
    expect(changes).toEqual([true]);
  });

  it('weist Unsinn ab', async () => {
    expect((await call(chef, 'PUT', '/api/beta', { push: { mode: 'only', personId: 'x' } })).status).toBe(400);
    expect((await call(chef, 'PUT', '/api/beta', { push: { mode: 'vielleicht' } })).status).toBe(400);
    expect((await call(chef, 'PUT', '/api/beta', { watchers: 'ja' })).status).toBe(400);
    expect((await call(chef, 'GET', '/api/beta')).body).toEqual({ push: { mode: 'off' }, watchers: false });
  });

  it('die Fähigkeiten nennen den Kanal', async () => {
    expect((await call(anna, 'GET', '/api/capabilities')).body.channel).toBe('beta');
  });
});

describe('Normale App', () => {
  beforeEach(() => build(false));

  it('hat diese Einstellungen nicht', async () => {
    expect((await call(anna, 'GET', '/api/beta')).status).toBe(404);
    expect((await call(chef, 'PUT', '/api/beta', { watchers: true })).status).toBe(404);
    expect((await call(anna, 'GET', '/api/capabilities')).body.channel).toBe('stable');
  });
});
