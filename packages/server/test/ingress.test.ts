import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ingressAuth } from '../src/ingress.js';

async function build(enforceIp = true) {
  const app = Fastify();
  await app.register(ingressAuth, { enforceIp });
  app.get('/whoami', async (req) => req.principal);
  return app;
}

const headers = {
  'x-remote-user-id': 'abc123',
  'x-remote-user-name': 'rene',
  'x-remote-user-display-name': 'René',
  'x-ingress-path': '/api/hassio_ingress/TOKEN',
};

describe('ingressAuth', () => {
  it('accepts the ingress proxy and exposes the HA user', async () => {
    const app = await build();
    const res = await app.inject({
      url: '/whoami',
      headers,
      remoteAddress: '172.30.32.2',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: 'abc123',
      name: 'rene',
      displayName: 'René',
      ingressPath: '/api/hassio_ingress/TOKEN',
    });
  });

  it('accepts the IPv4-mapped IPv6 form of the proxy address', async () => {
    const app = await build();
    const res = await app.inject({
      url: '/whoami',
      headers,
      remoteAddress: '::ffff:172.30.32.2',
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects other addresses with 403', async () => {
    const app = await build();
    const res = await app.inject({ url: '/whoami', headers, remoteAddress: '192.168.1.50' });
    expect(res.statusCode).toBe(403);
  });

  it('rejects requests without a user id with 401', async () => {
    const app = await build();
    const res = await app.inject({ url: '/whoami', remoteAddress: '172.30.32.2' });
    expect(res.statusCode).toBe(401);
  });

  it('can skip the IP check for local development', async () => {
    const app = await build(false);
    const res = await app.inject({ url: '/whoami', headers, remoteAddress: '127.0.0.1' });
    expect(res.statusCode).toBe(200);
  });

  it('nutzt in der lokalen Entwicklung den Entwicklungsnutzer, wenn kein Header kommt', async () => {
    const dev = Fastify();
    await dev.register(ingressAuth, {
      enforceIp: false,
      devUser: { id: 'dev-rene', name: 'rene', displayName: 'René' },
    });
    dev.get('/whoami', async (req) => req.principal);
    const res = await dev.inject({ url: '/whoami', remoteAddress: '127.0.0.1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('rene');
  });

  it('der Entwicklungsnutzer gilt nie, wenn die IP-Prüfung aktiv ist', async () => {
    const prod = Fastify();
    await prod.register(ingressAuth, {
      enforceIp: true,
      devUser: { id: 'dev-rene', name: 'rene', displayName: 'René' },
    });
    prod.get('/whoami', async (req) => req.principal);
    const res = await prod.inject({ url: '/whoami', remoteAddress: '172.30.32.2' });
    expect(res.statusCode).toBe(401);
  });

  it('falls back to the name when no display name is sent', async () => {
    const app = await build();
    const res = await app.inject({
      url: '/whoami',
      headers: { 'x-remote-user-id': 'x', 'x-remote-user-name': 'conny' },
      remoteAddress: '172.30.32.2',
    });
    expect(res.json().displayName).toBe('conny');
  });

  it('serves /healthz without auth', async () => {
    const app = Fastify();
    await app.register(ingressAuth, { enforceIp: true });
    app.get('/healthz', async () => ({ ok: true }));
    const res = await app.inject({ url: '/healthz', remoteAddress: '10.0.0.1' });
    expect(res.statusCode).toBe(200);
  });
});
