import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ingressAuth } from '../src/ingress.js';
import { parseOptions } from '../src/config.js';
import { spikeRoutes, type SpikeDeps } from '../src/spike.js';

const headers = {
  'x-remote-user-id': 'u1',
  'x-remote-user-name': 'rene',
  'x-remote-user-display-name': 'René',
  'x-ingress-path': '/api/hassio_ingress/TOK',
};

function makeDeps(overrides: Partial<SpikeDeps> = {}) {
  const sent: { service: string; data: Record<string, unknown> }[] = [];
  const actions: ((a: { action: string; deviceId?: string; userId?: string }) => void)[] = [];
  const deps: SpikeDeps = {
    options: parseOptions({
      users: [{ name: 'Rene', notify: ['mobile_app_iphone_rene'] }, { name: 'Conny', notify: [] }],
    }),
    ha: {
      callService: async (_d: string, service: string, data: Record<string, unknown>) => {
        sent.push({ service, data });
      },
      listNotifyServices: async () => ['mobile_app_iphone_rene', 'mobile_app_other'],
      getConfig: async () => ({ time_zone: 'Europe/Berlin' }),
      status: () => ({
        connected: true,
        subscribed: true,
        lastError: null,
        eventsReceived: 0,
        lastEventAt: null,
        lostSince: null,
      }),
      onNotificationAction: (cb) => {
        actions.push(cb);
      },
    },
    now: () => new Date('2026-10-30T10:00:00Z'),
    ...overrides,
  };
  return { deps, sent, actions };
}

async function build(deps: SpikeDeps) {
  const app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(spikeRoutes, deps);
  return app;
}

describe('spike routes', () => {
  it('GET /api/spike/info reports user, ingress path, options and services', async () => {
    const { deps } = makeDeps();
    const app = await build(deps);
    const res = await app.inject({ url: '/api/spike/info', headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ id: 'u1', displayName: 'René' });
    expect(body.ingressPath).toBe('/api/hassio_ingress/TOK');
    expect(body.timeZone).toBe('Europe/Berlin');
    expect(body.dashboardPath).toBe('/lovelace/0');
    expect(body.people).toEqual([
      { name: 'Rene', notify: [{ service: 'mobile_app_iphone_rene', exists: true }] },
      { name: 'Conny', notify: [] },
    ]);
    expect(body.notifyServices).toContain('mobile_app_other');
    expect(body.haEvents).toEqual({
      connected: true,
      subscribed: true,
      lastError: null,
      eventsReceived: 0,
      lastEventAt: null,
    });
  });

  it('flags configured notify services that do not exist in HA', async () => {
    const { deps } = makeDeps({
      options: parseOptions({ users: [{ name: 'Rene', notify: ['mobile_app_typo'] }] }),
    });
    const app = await build(deps);
    const body = (await app.inject({ url: '/api/spike/info', headers })).json();
    expect(body.people[0].notify).toEqual([{ service: 'mobile_app_typo', exists: false }]);
  });

  it('POST /api/spike/test-push sends a push with a Done action to all of a persons services', async () => {
    const { deps, sent } = makeDeps({
      options: parseOptions({
        users: [{ name: 'Rene', notify: ['mobile_app_a', 'mobile_app_b'] }],
      }),
    });
    const app = await build(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/spike/test-push',
      headers,
      payload: { person: 'Rene', url: '/xyz_stups#/card/1' },
    });
    expect(res.statusCode).toBe(200);
    expect(sent.map((s) => s.service)).toEqual(['mobile_app_a', 'mobile_app_b']);
    const d = sent[0]!.data as { title: string; data: { tag: string; url: string; actions: { action: string }[] } };
    expect(d.title).toMatch(/Test/);
    expect(d.data.tag).toBe('stups-spike');
    expect(d.data.url).toBe('/xyz_stups#/card/1');
    expect(d.data.actions[0]?.action).toMatch(/^KANBAN_DONE:spike:/);
  });

  it('POST /api/spike/test-push returns 404 for an unknown person', async () => {
    const { deps } = makeDeps();
    const app = await build(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/spike/test-push',
      headers,
      payload: { person: 'Nobody' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/spike/test-push returns 409 when the person has no notify service', async () => {
    const { deps } = makeDeps();
    const app = await build(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/spike/test-push',
      headers,
      payload: { person: 'Conny' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('records received notification actions and exposes them at /api/spike/actions', async () => {
    const { deps, actions } = makeDeps();
    const app = await build(deps);
    actions[0]!({ action: 'KANBAN_DONE:spike:1', deviceId: 'd1', userId: 'hu1' });
    const body = (await app.inject({ url: '/api/spike/actions', headers })).json();
    expect(body.actions).toEqual([
      {
        action: 'KANBAN_DONE:spike:1',
        deviceId: 'd1',
        userId: 'hu1',
        receivedAt: '2026-10-30T10:00:00.000Z',
      },
    ]);
  });

  it('POST /api/spike/clear removes the notification by tag', async () => {
    const { deps, sent } = makeDeps();
    const app = await build(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/spike/clear',
      headers,
      payload: { person: 'Rene' },
    });
    expect(res.statusCode).toBe(200);
    expect(sent[0]?.data).toEqual({ message: 'clear_notification', data: { tag: 'stups-spike' } });
  });
});
