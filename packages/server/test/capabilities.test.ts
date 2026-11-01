import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import type { Capabilities } from '../src/runtime.js';
import { createStore } from '../src/store.js';

const headers = { 'x-remote-user-id': 'ha-rene', 'x-remote-user-name': 'rene', 'x-remote-user-display-name': 'René' };

async function build(capabilities?: Capabilities) {
  const app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store: createStore(openDb(':memory:')), capabilities });
  return app;
}

describe('GET /api/capabilities', () => {
  it('liefert, was die Betriebsart bietet', async () => {
    const caps: Capabilities = { mode: 'addon', auth: 'ingress', ha: true, watchers: true, sensors: true, push: ['ha-notify'], publicUrl: null };
    const res = await (await build(caps)).inject({ url: '/api/capabilities', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(caps);
  });

  it('ohne Angabe: Standalone ohne Home Assistant, ohne Wächter und Sensoren', async () => {
    const res = await (await build()).inject({ url: '/api/capabilities', headers });
    expect(res.json()).toEqual({ mode: 'standalone', auth: 'ingress', ha: false, watchers: false, sensors: false, push: [], publicUrl: null });
  });

  it('verlangt eine Anmeldung', async () => {
    const res = await (await build()).inject({ url: '/api/capabilities' });
    expect(res.statusCode).toBe(401);
  });
});
