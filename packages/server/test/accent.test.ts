import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const anna = as('ha-anna', 'Anna');
const fremd = as('ha-fremd', 'Fremd');

describe('Akzentfarbe je Person', () => {
  let app: FastifyInstance;
  let store: Store;

  beforeEach(async () => {
    store = createStore(openDb(':memory:'));
    store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async () => false, persons: async () => [] } });
  });

  const put = (who: object, payload: object) => app.inject({ method: 'PUT', url: '/api/me/accent', headers: who as Record<string, string>, payload });
  const me = async (who: object) => (await app.inject({ url: '/api/me', headers: who as Record<string, string> })).json();

  it('ohne Wahl: null (das Orange der App)', async () => {
    expect((await me(anna)).user.accentHue).toBeNull();
  });

  it('speichert den Farbton nur für die eigene Person', async () => {
    expect((await put(anna, { hue: 200 })).statusCode).toBe(204);
    expect((await me(anna)).user.accentHue).toBe(200);
    expect(store.people().find((p) => p.name === 'Ben')!.accentHue).toBeNull();
  });

  it('null stellt das Orange wieder her, 0 ist ein gültiger Farbton', async () => {
    await put(anna, { hue: 120 });
    expect((await put(anna, { hue: null })).statusCode).toBe(204);
    expect((await me(anna)).user.accentHue).toBeNull();
    expect((await put(anna, { hue: 0 })).statusCode).toBe(204);
    expect((await me(anna)).user.accentHue).toBe(0);
  });

  it('ungültige Werte: 400', async () => {
    for (const hue of [360, -1, 12.5, '200', undefined]) {
      expect((await put(anna, { hue })).statusCode, String(hue)).toBe(400);
    }
    expect((await me(anna)).user.accentHue).toBeNull();
  });

  it('ohne Zugriff (nur freigegebene): 403', async () => {
    store.setAccessMode('selected');
    expect((await put(fremd, { hue: 10 })).statusCode).toBe(403);
  });
});
