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

async function build(exportData?: () => { dir: string; bytes: number; files: boolean }) {
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

describe('POST /api/admin/export', () => {
  beforeEach(() => build(() => ({ dir: '/share/stups-umzug', bytes: 1234, files: true })));

  it('Administratoren bekommen den Ort des Exports', async () => {
    const res = await post(chef);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dir: '/share/stups-umzug', bytes: 1234, files: true });
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
