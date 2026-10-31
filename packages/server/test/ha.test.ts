import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { HaClient } from '../src/ha.js';

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: Zeitüberschreitung');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('HaClient REST', () => {
  it('posts service calls with the bearer token', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    const ha = new HaClient({ baseUrl: 'http://supervisor/core', token: 'T', fetchFn });

    await ha.callService('notify', 'mobile_app_x', { message: 'hi' });

    expect(calls[0]?.url).toBe('http://supervisor/core/api/services/notify/mobile_app_x');
    expect(calls[0]?.init.method).toBe('POST');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer T');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ message: 'hi' });
  });

  it('gibt eine hängende Anfrage nach dem Zeitlimit auf', async () => {
    const fetchFn = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', fetchFn, requestTimeoutMs: 50 });
    await expect(ha.callService('notify', 'x', {})).rejects.toThrow();
  });

  it('throws on a non-2xx response', async () => {
    const fetchFn = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch;
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', fetchFn });
    await expect(ha.callService('notify', 'x', {})).rejects.toThrow(/400/);
  });

  it('lists notify services from /api/services', async () => {
    const fetchFn = (async () =>
      new Response(
        JSON.stringify([
          { domain: 'light', services: { turn_on: {} } },
          { domain: 'notify', services: { mobile_app_a: {}, mobile_app_b: {}, notify: {} } },
        ]),
        { status: 200 },
      )) as unknown as typeof fetch;
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', fetchFn });
    expect(await ha.listNotifyServices()).toEqual(['mobile_app_a', 'mobile_app_b', 'notify']);
  });

  it('reads the time zone from /api/config', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ time_zone: 'Europe/Berlin' }), {
        status: 200,
      })) as unknown as typeof fetch;
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', fetchFn });
    expect((await ha.getConfig()).time_zone).toBe('Europe/Berlin');
  });
});

describe('HaClient: Zustände und Dashboards', () => {
  it('setzt einen Zustand per POST /api/states', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 201 });
    }) as unknown as typeof fetch;
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', fetchFn });
    await ha.setState('sensor.stups_ueberfaellig', '3', { unit_of_measurement: 'Aufgaben' });
    expect(calls[0]?.url).toBe('http://x/api/states/sensor.stups_ueberfaellig');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      state: '3',
      attributes: { unit_of_measurement: 'Aufgaben' },
    });
  });

  let wss: WebSocketServer | undefined;
  afterEach(async () => {
    await new Promise<void>((r) => (wss ? wss.close(() => r()) : r()));
    wss = undefined;
  });

  function server(handler: (ws: WebSocket, msg: Record<string, unknown>) => void) {
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'auth_required' }));
      ws.on('message', (raw) => handler(ws, JSON.parse(raw.toString())));
    });
    return (wss.address() as AddressInfo).port;
  }

  it('listet Dashboards: Standard plus eigene', async () => {
    const port = server((ws, msg) => {
      if (msg.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (msg.type === 'lovelace/dashboards/list') {
        ws.send(
          JSON.stringify({
            id: msg.id,
            type: 'result',
            success: true,
            result: [
              { url_path: 'dashboard-handy', title: 'Handy' },
              { url_path: 'ea-trading', title: '' },
            ],
          }),
        );
      }
    });
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', wsUrl: `ws://127.0.0.1:${port}` });
    expect(await ha.listDashboards()).toEqual([
      { title: 'Standard-Dashboard', path: '/' },
      { title: 'Handy', path: '/dashboard-handy' },
      { title: 'ea-trading', path: '/ea-trading' },
    ]);
  });

  it('meldet einen abgelehnten Befehl als Fehler', async () => {
    const port = server((ws, msg) => {
      if (msg.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (msg.type === 'kaputt') {
        ws.send(JSON.stringify({ id: msg.id, type: 'result', success: false, error: { message: 'Nicht erlaubt' } }));
      }
    });
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', wsUrl: `ws://127.0.0.1:${port}` });
    await expect(ha.wsCommand('kaputt')).rejects.toThrow(/Nicht erlaubt/);
  });

  it('bricht bei zu langer Antwortzeit ab', async () => {
    const port = server((ws, msg) => {
      if (msg.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
    });
    const ha = new HaClient({ baseUrl: 'http://x', token: 'T', wsUrl: `ws://127.0.0.1:${port}` });
    await expect(ha.wsCommand('nie-beantwortet', {}, 50)).rejects.toThrow(/Zeitüberschreitung/);
  });
});

describe('HaClient WebSocket events', () => {
  let wss: WebSocketServer | undefined;
  let ha: HaClient | undefined;

  afterEach(async () => {
    ha?.close();
    await new Promise<void>((r) => (wss ? wss.close(() => r()) : r()));
  });

  function startServer(onMessage: (ws: WebSocket, msg: Record<string, unknown>) => void) {
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'auth_required' }));
      ws.on('message', (raw) => onMessage(ws, JSON.parse(raw.toString())));
    });
    return (wss.address() as AddressInfo).port;
  }

  it('authenticates, subscribes and delivers notification actions', async () => {
    const seen: Record<string, unknown>[] = [];
    const port = startServer((ws, msg) => {
      seen.push(msg);
      if (msg.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (msg.type === 'subscribe_events') {
        ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true }));
        ws.send(
          JSON.stringify({
            id: msg.id,
            type: 'event',
            event: {
              event_type: 'mobile_app_notification_action',
              data: { action: 'KANBAN_DONE:42:k1', device_id: 'dev1' },
              context: { user_id: 'u1' },
            },
          }),
        );
      }
    });

    ha = new HaClient({ baseUrl: 'http://x', token: 'TOK', wsUrl: `ws://127.0.0.1:${port}` });
    const got = new Promise<{ action: string; deviceId?: string; userId?: string }>((resolve) => {
      ha!.onNotificationAction(resolve);
    });
    ha.connect();

    const action = await got;
    expect(action).toEqual({ action: 'KANBAN_DONE:42:k1', deviceId: 'dev1', userId: 'u1' });
    expect(seen[0]).toEqual({ type: 'auth', access_token: 'TOK' });
    expect(seen[1]).toMatchObject({
      type: 'subscribe_events',
      event_type: 'mobile_app_notification_action',
    });
  });

  it('reports connection status, subscription and event count', async () => {
    const port = startServer((ws, msg) => {
      if (msg.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (msg.type === 'subscribe_events') {
        ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true }));
        ws.send(
          JSON.stringify({
            id: msg.id,
            type: 'event',
            event: { event_type: 'mobile_app_notification_action', data: { action: 'A' } },
          }),
        );
      }
    });
    ha = new HaClient({ baseUrl: 'http://x', token: 'T', wsUrl: `ws://127.0.0.1:${port}` });
    expect(ha.status()).toMatchObject({ connected: false, subscribed: false, eventsReceived: 0 });
    const got = new Promise((resolve) => ha!.onNotificationAction(resolve));
    ha.connect();
    await got;
    expect(ha.status()).toMatchObject({
      connected: true,
      subscribed: true,
      lastError: null,
      eventsReceived: 1,
    });
    expect(ha.status().lastEventAt).not.toBeNull();
  });

  it('records an auth failure as lastError', async () => {
    const port = startServer((ws, msg) => {
      if (msg.type === 'auth') {
        ws.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token' }));
      }
    });
    ha = new HaClient({ baseUrl: 'http://x', token: 'BAD', wsUrl: `ws://127.0.0.1:${port}` });
    ha.connect();
    await waitFor(() => ha!.status().lastError !== null);
    expect(ha.status().connected).toBe(false);
    expect(ha.status().lastError).toMatch(/Invalid access token/);
  });

  it('records a failed subscription as lastError', async () => {
    const port = startServer((ws, msg) => {
      if (msg.type === 'auth') ws.send(JSON.stringify({ type: 'auth_ok' }));
      if (msg.type === 'subscribe_events') {
        ws.send(
          JSON.stringify({
            id: msg.id,
            type: 'result',
            success: false,
            error: { code: 'unauthorized', message: 'Unauthorized' },
          }),
        );
      }
    });
    ha = new HaClient({ baseUrl: 'http://x', token: 'T', wsUrl: `ws://127.0.0.1:${port}` });
    ha.connect();
    await waitFor(() => ha!.status().lastError !== null);
    expect(ha.status().subscribed).toBe(false);
    expect(ha.status().lastError).toMatch(/Unauthorized/);
  });

  it('reconnects after the socket drops', async () => {
    let connections = 0;
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (ws) => {
      connections += 1;
      ws.send(JSON.stringify({ type: 'auth_required' }));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth') {
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          if (connections === 1) setTimeout(() => ws.terminate(), 20);
        }
      });
    });
    const port = (wss.address() as AddressInfo).port;
    ha = new HaClient({
      baseUrl: 'http://x',
      token: 'T',
      wsUrl: `ws://127.0.0.1:${port}`,
      reconnectDelayMs: 20,
    });
    ha.connect();
    await waitFor(() => connections >= 2);
    expect(connections).toBeGreaterThanOrEqual(2);
  });
});
