import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const chef = as('ha-chef', 'Chef');
const anna = as('ha-anna', 'Anna');

let app: FastifyInstance;
let calls: number;

async function build(exportData?: () => { dir: string; bytes: number; files: boolean; expiresAt: string }) {
  const store = createStore(openDb(':memory:'));
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  calls = 0;
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    ha: { listDashboards: async () => [] },
    exportData: exportData && (() => (calls++, exportData())),
  });
}

const post = (who: object) => app.inject({ method: 'POST', url: '/api/admin/export', headers: who as Record<string, string> });

describe('POST /api/admin/watcher-probe', () => {
  const probe = { states: { ok: true, count: 1 }, persons: [], entity: null, triggerEntity: 'sun.sun', stateTrigger: { ok: true }, numericTrigger: { ok: true } };
  let asked: (string | undefined)[];

  async function buildProbe(fn?: (id?: string) => Promise<typeof probe>) {
    asked = [];
    const store = createStore(openDb(':memory:'));
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, {
      store,
      directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
      ha: { listDashboards: async () => [], probeWatchers: fn && ((id) => (asked.push(id), fn(id))) },
    });
  }
  const run = (who: object, payload: object = {}) =>
    app.inject({ method: 'POST', url: '/api/admin/watcher-probe', headers: who as Record<string, string>, payload });

  it('Administratoren bekommen das Ergebnis, mit der gewählten Entität', async () => {
    await buildProbe(async () => probe);
    const res = await run(chef, { entityId: 'sensor.waschmaschine_leistung' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(probe);
    expect(asked).toEqual(['sensor.waschmaschine_leistung']);
  });

  it('andere dürfen nicht, falsche Entitäten werden abgelehnt', async () => {
    await buildProbe(async () => probe);
    expect((await run(anna)).statusCode).toBe(403);
    expect((await run(chef, { entityId: 'kaputt!' })).statusCode).toBe(400);
    expect(asked).toEqual([]);
  });

  it('ein Fehler von Home Assistant kommt als lesbare Meldung zurück', async () => {
    await buildProbe(async () => {
      throw new Error('Zeitüberschreitung bei Home Assistant');
    });
    const res = await run(chef);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Zeitüberschreitung/);
  });
});

describe('POST /api/admin/export', () => {
  beforeEach(() => build(() => ({ dir: '/share/stups-umzug', bytes: 1234, files: true, expiresAt: '2026-11-02T10:00:00.000Z' })));

  it('Administratoren bekommen den Ort des Exports', async () => {
    const res = await post(chef);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dir: '/share/stups-umzug', bytes: 1234, files: true, expiresAt: '2026-11-02T10:00:00.000Z' });
    expect(calls).toBe(1);
  });

  it('andere Personen dürfen nicht', async () => {
    const res = await post(anna);
    expect(res.statusCode).toBe(403);
    expect(calls).toBe(0);
  });

  it('ein Fehler beim Export kommt als lesbare Meldung zurück', async () => {
    await build(() => {
      throw new Error('Der Ordner /share ist nicht eingebunden');
    });
    const res = await post(chef);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/nicht eingebunden/);
  });
});
