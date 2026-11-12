import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { identityAuth, requestPath, type Identity } from '../src/identity.js';
import { createStaticDirectory } from '../src/directory.js';

async function build(identity: Identity) {
  const app = Fastify();
  await app.register(identityAuth, { identity });
  app.get('/whoami', async (req) => req.principal);
  app.get('/healthz', async () => ({ ok: true }));
  return app;
}

describe('identityAuth (Port)', () => {
  it('setzt den Benutzer, den der Adapter liefert, und reicht Adresse, Pfad und Kopfzeilen weiter', async () => {
    const seen: unknown[] = [];
    const app = await build({
      authenticate: (req) => {
        seen.push({ ip: req.ip, url: req.url, token: req.headers['x-token'] });
        return { ok: true, principal: { id: 'u1', name: 'anna', displayName: 'Anna', ingressPath: '' } };
      },
    });
    const res = await app.inject({ url: '/whoami?x=1', headers: { 'x-token': 't' }, remoteAddress: '10.0.0.5' });
    expect(res.json()).toEqual({ id: 'u1', name: 'anna', displayName: 'Anna', ingressPath: '' });
    expect(seen).toEqual([{ ip: '10.0.0.5', url: '/whoami?x=1', token: 't' }]);
  });

  it('gibt Status und Meldung des Adapters weiter, auch wenn er asynchron antwortet', async () => {
    const app = await build({ authenticate: async () => ({ ok: false, status: 401, error: 'Bitte anmelden' }) });
    const res = await app.inject({ url: '/whoami' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Bitte anmelden' });
  });

  it('fragt den Adapter bei /healthz nicht', async () => {
    let asked = 0;
    const app = await build({
      authenticate: () => {
        asked += 1;
        return { ok: false, status: 403, error: 'nein' };
      },
    });
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect(asked).toBe(0);
  });
});

describe('requestPath', () => {
  const encode = (s: string, times: number) => Array.from({ length: times }).reduce<string>((acc) => encodeURIComponent(acc), s);

  it('schneidet die Abfrage ab und decodiert den Pfad', () => {
    expect(requestPath('/api/boards?x=1&y=%2F')).toBe('/api/boards');
    expect(requestPath('/%61pi/boards')).toBe('/api/boards');
    expect(requestPath('/healthz')).toBe('/healthz');
  });

  it('decodiert mehrfach codierte Pfade bis zum festen Stand, höchstens vier Stufen', () => {
    expect(requestPath(`/${encode('a b', 4)}`)).toBe('/a b');
    // fünf Stufen: nach vier Durchgängen bleibt eine Stufe übrig
    expect(requestPath(`/${encode('a b', 5)}`)).toBe(`/${encode('a b', 1)}`);
  });

  it('eine ungültige Codierung ergibt null', () => {
    expect(requestPath('/api/%E0%A4%A')).toBeNull();
    expect(requestPath('/%25E0%25A4%25A')).toBeNull();
  });
});

describe('createStaticDirectory', () => {
  it('kennt nur die genannten Administratoren und keine Personen', async () => {
    const d = createStaticDirectory(['dev-rene']);
    expect(await d.isAdmin('dev-rene')).toBe(true);
    expect(await d.isAdmin('dev-anna')).toBe(false);
    expect(await d.persons()).toEqual([]);
  });
});
